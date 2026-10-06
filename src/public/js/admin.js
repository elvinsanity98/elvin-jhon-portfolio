// Admin page logic: a password login for a static site, with no database and no server.
//
// How it stays secure:
//   * The only thing that can change the live theme is a GitHub token with write access
//     to this repo. That token is never stored in readable form anywhere.
//   * Setup encrypts the token with a key derived from the password
//     (PBKDF2-SHA256 -> AES-256-GCM) and commits the ciphertext to docs/admin-vault.json.
//   * Logging in means decrypting that vault in the browser. A wrong password cannot
//     produce the token, so there is no "if (password ok)" check for anyone to bypass.
//   * The vault is public because the repo is, so it is exactly as strong as the password.
//     The token must be a fine-grained one limited to this repo's Contents, which caps the
//     damage if the password is ever guessed.
(function () {
  'use strict';

  const OWNER = 'elvinsanity98';
  const REPO = 'elvin-jhon-portfolio';
  const BRANCH = 'main';
  const CONFIG_PATH = 'docs/site-config.js';
  const VAULT_PATH = 'docs/admin-vault.json';
  const API = 'https://api.github.com';

  const KDF_ITERATIONS = 600000;            // PBKDF2-SHA256 rounds for new vaults
  const MIN_PASSWORD = 12;
  const IDLE_LOCK_MS = 10 * 60 * 1000;
  const LAYOUTS = { classic: 'Classic', halftone: 'Halftone' };

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let session = null;      // { token }: memory only, gone on lock or reload
  let vault = null;        // the encrypted vault currently in the repo, if any
  let published = null;    // layout id currently committed as live
  let deployRun = 0;       // cancels older "wait for deploy" loops
  let failures = 0;
  let idleTimer = 0;

  // ---------------------------------------------------------------- encoding
  const utf8 = new TextEncoder();
  function toB64(bytes) {
    bytes = new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function fromB64(b64) {
    return Uint8Array.from(atob(String(b64).replace(/\s/g, '')), (c) => c.charCodeAt(0));
  }

  // ------------------------------------------------------------------- vault
  // Binding the ciphertext to the repo name means a vault copied elsewhere will not open.
  const AAD = utf8.encode(OWNER + '/' + REPO);

  async function deriveKey(password, salt, iterations) {
    const material = await crypto.subtle.importKey(
      'raw', utf8.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function sealToken(password, token) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, KDF_ITERATIONS);
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: AAD }, key, utf8.encode(token));
    return {
      v: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: KDF_ITERATIONS,
      cipher: 'AES-256-GCM',
      salt: toB64(salt),
      iv: toB64(iv),
      data: toB64(data),
      updated: new Date().toISOString()
    };
  }

  // Rejects (throws) when the password is wrong: AES-GCM authentication fails.
  async function openVault(password, v) {
    const key = await deriveKey(password, fromB64(v.salt), v.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(v.iv), additionalData: AAD }, key, fromB64(v.data));
    return new TextDecoder().decode(plain);
  }

  function validVault(v) {
    return !!v && v.v === 1 &&
      typeof v.salt === 'string' && typeof v.iv === 'string' && typeof v.data === 'string' &&
      Number.isInteger(v.iterations) && v.iterations >= 100000 && v.iterations <= 5000000;
  }

  // ------------------------------------------------------------------ GitHub
  class GitHubError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function github(path, opts) {
    opts = opts || {};
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    if (opts.body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(API + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store'
      });
    } catch (e) {
      throw new GitHubError(0, 'Could not reach GitHub. Check your connection and try again.');
    }
    if (res.status === 404 && opts.allowMissing) return null;
    let json = null;
    try { json = await res.json(); } catch (e) {}
    if (!res.ok) throw new GitHubError(res.status, (json && json.message) || ('GitHub answered ' + res.status));
    return json;
  }

  const contentsUrl = (path) => '/repos/' + OWNER + '/' + REPO + '/contents/' + path;

  async function readFile(path, token) {
    // The timestamp keeps GitHub's CDN from answering with a minute-old copy
    const file = await github(contentsUrl(path) + '?ref=' + BRANCH + '&t=' + Date.now(),
      { token, allowMissing: true });
    if (!file || typeof file.content !== 'string') return null;
    return { sha: file.sha, text: new TextDecoder().decode(fromB64(file.content)) };
  }

  async function writeFile(path, text, message, token) {
    const current = await readFile(path, token);
    const body = { message, content: toB64(utf8.encode(text)), branch: BRANCH };
    if (current) body.sha = current.sha;
    return github(contentsUrl(path), { method: 'PUT', token, body });
  }

  function explain(err) {
    if (!(err instanceof GitHubError)) return 'Something went wrong: ' + (err && err.message ? err.message : err);
    if (err.status === 401) return 'GitHub rejected the token. It may have expired or been revoked. Set up again with a new one.';
    if (err.status === 403 && /rate limit/i.test(err.message)) return 'GitHub rate limit reached. Wait a few minutes and try again.';
    if (err.status === 403) return 'The token is not allowed to write to this repo. It needs Repository permissions > Contents: Read and write.';
    if (err.status === 404) return 'The token cannot see ' + OWNER + '/' + REPO + '. Give it access to that repository.';
    if (err.status === 409) return 'The repo changed while saving. Try again.';
    return err.message;
  }

  // ------------------------------------------------------------ site config
  function parseLayout(text) {
    const m = /"layout"\s*:\s*"([a-z]+)"/.exec(text || '');
    return m && LAYOUTS[m[1]] ? m[1] : null;
  }
  function configSource(layout) {
    return '// Published site settings. Written by admin.html: change the theme there, not by hand.\n' +
      'window.SITE_CONFIG = ' + JSON.stringify({ layout, updated: new Date().toISOString() }, null, 2) + ';\n';
  }

  // --------------------------------------------------------------- passwords
  function passwordProblem(pw) {
    if (pw.length < MIN_PASSWORD) return 'Use at least ' + MIN_PASSWORD + ' characters.';
    if (/(password|qwerty|123456|letmein|admin|elvin|gimena)/i.test(pw)) return 'Avoid common words and your own name.';
    if (/^(.)\1+$/.test(pw)) return 'That is one character repeated.';
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
    if (pw.length < 20 && classes < 3) return 'Mix upper and lower case, numbers and symbols, or use a passphrase of 20+ characters.';
    return '';
  }
  // Rough guess-resistance estimate for the meter only; passwordProblem() is the gate.
  function strength(pw) {
    if (!pw) return 0;
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/[0-9]/.test(pw)) pool += 10;
    if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
    const bits = new Set(pw).size * Math.log2(pool || 1);   // repeats add nothing
    return Math.max(0, Math.min(1, bits / 110));
  }

  // ---------------------------------------------------------------------- UI
  const VIEWS = ['view-loading', 'view-login', 'view-setup', 'view-dash'];
  function show(id) {
    VIEWS.forEach((v) => { $(v).hidden = v !== id; });
    const focus = $(id).querySelector('[data-autofocus]');
    if (focus) focus.focus();
  }
  function say(id, text, kind) {
    const el = $(id);
    el.textContent = text || '';
    el.dataset.kind = kind || '';
  }
  function busy(form, on) {
    Array.prototype.forEach.call(form.querySelectorAll('button, input'), (el) => { el.disabled = on; });
  }

  function touch() {
    clearTimeout(idleTimer);
    if (session) idleTimer = setTimeout(() => lock('Locked after 10 minutes without activity.'), IDLE_LOCK_MS);
  }
  function lock(reason) {
    session = null;
    deployRun++;
    clearTimeout(idleTimer);
    Array.prototype.forEach.call(document.querySelectorAll('input[type="password"]'), (el) => { el.value = ''; });
    updateMeter($('setup-meter'), '');
    updateMeter($('change-meter'), '');
    say('login-msg', reason || '');
    say('dash-msg', '');
    show(vault ? 'view-login' : 'view-setup');
  }

  function updateMeter(meter, pw) {
    const score = strength(pw);
    meter.style.setProperty('--fill', (score * 100).toFixed(0) + '%');
    meter.dataset.level = !pw ? '' : passwordProblem(pw) ? 'weak' : score > 0.75 ? 'strong' : 'ok';
  }

  function renderDash() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-layout-card]'), (card) => {
      const id = card.getAttribute('data-layout-card');
      const live = id === published;
      card.classList.toggle('is-live', live);
      const btn = card.querySelector('[data-make-live]');
      btn.disabled = live;
      btn.textContent = live ? 'Live now' : 'Make live';
    });
  }

  async function openDash() {
    show('view-dash');
    touch();
    say('dash-msg', 'Reading the live theme…');
    try {
      const file = await readFile(CONFIG_PATH, session.token);
      published = parseLayout(file && file.text) || 'classic';
      renderDash();
      say('dash-msg', '');
    } catch (err) {
      say('dash-msg', explain(err), 'error');
    }
  }

  async function publish(layout) {
    if (!session || !LAYOUTS[layout] || layout === published) return;
    const run = ++deployRun;
    const dash = $('view-dash');
    busy(dash, true);
    say('dash-msg', 'Publishing ' + LAYOUTS[layout] + '…');
    try {
      await writeFile(CONFIG_PATH, configSource(layout), 'Switch live theme to ' + LAYOUTS[layout], session.token);
    } catch (err) {
      busy(dash, false);
      renderDash();
      say('dash-msg', explain(err), 'error');
      return;
    }
    published = layout;
    busy(dash, false);
    renderDash();
    say('dash-msg', 'Saved. GitHub Pages is rebuilding, usually about a minute…');

    // Watch the deployed copy until it reflects the change (~3 minutes at most)
    for (let i = 0; i < 36; i++) {
      await sleep(5000);
      if (run !== deployRun) return;
      try {
        const res = await fetch('./site-config.js?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok && parseLayout(await res.text()) === layout) {
          say('dash-msg', LAYOUTS[layout] + ' is live.', 'ok');
          return;
        }
      } catch (e) {}
    }
    say('dash-msg', 'Saved on GitHub. The site will switch once Pages finishes; returning visitors can see the old theme for up to 10 minutes (browser cache).');
  }

  // ------------------------------------------------------------------ events
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const pw = $('login-pw').value;
    if (!pw || !vault) return;
    busy(form, true);
    say('login-msg', 'Unlocking…');
    let token;
    try {
      token = await openVault(pw, vault);
    } catch (err) {
      // Slows guessing in this tab only. The real protection is the key derivation cost
      // plus a strong password, since the vault itself is public.
      failures++;
      const wait = Math.min(30, Math.pow(2, failures));
      $('login-pw').value = '';
      for (let s = wait; s > 0; s--) {
        say('login-msg', 'Wrong password. Try again in ' + s + 's.', 'error');
        await sleep(1000);
      }
      say('login-msg', 'Wrong password.', 'error');
      busy(form, false);
      $('login-pw').focus();
      return;
    }
    failures = 0;
    $('login-pw').value = '';
    busy(form, false);
    say('login-msg', '');
    session = { token };
    openDash();
  });

  $('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const token = $('setup-token').value.trim();
    const pw = $('setup-pw').value;
    if (!/^github_pat_[A-Za-z0-9_]{20,}$/.test(token)) {
      say('setup-msg', /^gh[pousr]_/.test(token)
        ? 'That is a classic token, which can reach all your repositories. Create a fine-grained token (starts with github_pat_) limited to this repo.'
        : 'That does not look like a fine-grained GitHub token (it should start with github_pat_).', 'error');
      return;
    }
    const problem = passwordProblem(pw);
    if (problem) { say('setup-msg', problem, 'error'); return; }
    if (pw !== $('setup-pw2').value) { say('setup-msg', 'The two passwords do not match.', 'error'); return; }

    busy(form, true);
    try {
      say('setup-msg', 'Checking the token…');
      await github('/repos/' + OWNER + '/' + REPO, { token });
      say('setup-msg', 'Encrypting and saving…');
      const next = await sealToken(pw, token);
      // Committing the vault doubles as the proof that the token can write
      await writeFile(VAULT_PATH, JSON.stringify(next, null, 2) + '\n', 'Update admin login vault', token);
      vault = next;
    } catch (err) {
      busy(form, false);
      say('setup-msg', explain(err), 'error');
      return;
    }
    busy(form, false);
    form.reset();
    updateMeter($('setup-meter'), '');
    say('setup-msg', '');
    session = { token };
    openDash();
  });

  $('change-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!session) return;
    const form = e.currentTarget;
    const pw = $('change-pw').value;
    const problem = passwordProblem(pw);
    if (problem) { say('change-msg', problem, 'error'); return; }
    if (pw !== $('change-pw2').value) { say('change-msg', 'The two passwords do not match.', 'error'); return; }
    busy(form, true);
    say('change-msg', 'Saving…');
    try {
      const next = await sealToken(pw, session.token);
      await writeFile(VAULT_PATH, JSON.stringify(next, null, 2) + '\n', 'Update admin login vault', session.token);
      vault = next;
      form.reset();
      updateMeter($('change-meter'), '');
      say('change-msg', 'Password changed.', 'ok');
    } catch (err) {
      say('change-msg', explain(err), 'error');
    }
    busy(form, false);
  });

  $('setup-pw').addEventListener('input', (e) => updateMeter($('setup-meter'), e.target.value));
  $('change-pw').addEventListener('input', (e) => updateMeter($('change-meter'), e.target.value));
  $('to-setup').addEventListener('click', () => { say('setup-msg', ''); show('view-setup'); });
  $('to-login').addEventListener('click', () => show('view-login'));
  $('lock-btn').addEventListener('click', () => lock('Locked.'));
  Array.prototype.forEach.call(document.querySelectorAll('[data-make-live]'), (btn) => {
    btn.addEventListener('click', () => publish(btn.closest('[data-layout-card]').getAttribute('data-layout-card')));
  });
  ['pointerdown', 'keydown'].forEach((type) => window.addEventListener(type, touch, { passive: true }));

  // -------------------------------------------------------------------- boot
  (async function boot() {
    if (!window.crypto || !crypto.subtle) {
      say('loading-msg', 'This page needs a secure (https) connection to work.', 'error');
      return;
    }
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) $('local-note').hidden = false;

    // The repo is the source of truth; the deployed copy can lag behind a fresh setup.
    let checked = false;
    try {
      const file = await readFile(VAULT_PATH);
      checked = true;
      const parsed = file ? JSON.parse(file.text) : null;
      if (validVault(parsed)) vault = parsed;
    } catch (e) {}
    if (!vault && !checked) {
      // GitHub unreachable or rate-limited: fall back to the copy deployed with the site
      try {
        const res = await fetch('./admin-vault.json?t=' + Date.now(), { cache: 'no-store' });
        const parsed = res.ok ? await res.json() : null;
        if (validVault(parsed)) vault = parsed;
      } catch (e) {}
    }
    $('to-login').hidden = !vault;
    show(vault ? 'view-login' : 'view-setup');
  })();
})();
