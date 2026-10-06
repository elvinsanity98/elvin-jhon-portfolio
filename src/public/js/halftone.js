// Halftone layout behaviour.
// Loaded on every page view but only runs when <html data-layout="halftone">;
// in the classic layout it returns immediately.
(function () {
  'use strict';

  var html = document.documentElement;
  if (html.getAttribute('data-layout') !== 'halftone') return;

  var THEME_KEY = 'ejg-theme';          // same key the classic toggle uses
  var GH_USER = 'elvinsanity98';
  var CACHE_MS = 60 * 60 * 1000;        // GitHub's anonymous API allows 60 requests/hour per visitor

  // === Colour mode: system / light / dark ===
  // Dispatches the same 'themechange' event as the classic toggle.
  (function () {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-ht-mode]'));
    var topBtn = document.getElementById('ht-top-mode');

    function stored() {
      try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
    }
    function syncUi() {
      var mode = stored() || 'system';
      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-ht-mode') === mode));
      });
      if (topBtn) {
        var dark = html.getAttribute('data-theme') === 'dark';
        topBtn.innerHTML = '<i class="far fa-' + (dark ? 'sun' : 'moon') + '"></i>';
        topBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      }
    }
    function apply(next) {
      var prev = html.getAttribute('data-theme');
      if (prev !== next) {
        html.setAttribute('data-theme', next);
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next, previous: prev } }));
      }
      syncUi();
    }
    function setMode(mode) {
      try {
        if (mode === 'system') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, mode);
      } catch (e) {}
      apply(mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode);
    }
    function flip() {
      setMode(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    }

    buttons.forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-ht-mode')); });
    });
    if (topBtn) topBtn.addEventListener('click', flip);
    if (mq.addEventListener) {
      mq.addEventListener('change', function () {
        if (!stored()) apply(mq.matches ? 'dark' : 'light');
      });
    }

    // Shortcuts shown in the sidebar: D flips the theme, T goes back to the top
    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      var t = e.target;
      if (t && t.matches && t.matches('input, textarea, select, [contenteditable]')) return;
      var key = (e.key || '').toLowerCase();
      if (key === 'd') flip();
      else if (key === 't') window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    syncUi();
  })();

  // === Halftone portrait: 3x3 sprite of head directions that follows the pointer ===
  (function () {
    var portrait = document.getElementById('ht-portrait');
    if (!portrait) return;
    var CENTER = 4;
    var current = CENTER, pending = CENTER, scheduled = 0;

    function setFrame(index) {
      current = index;
      portrait.style.setProperty('--fx', index % 3);
      portrait.style.setProperty('--fy', Math.floor(index / 3));
    }
    function queueFrame(index) {
      pending = index;
      if (scheduled) return;
      scheduled = requestAnimationFrame(function () {
        scheduled = 0;
        if (pending !== current) setFrame(pending);
      });
    }
    function frameFromPoint(x, y) {
      var rect = portrait.getBoundingClientRect();
      // The gaze originates near the eyes, rather than at the chest.
      var cx = rect.left + rect.width * 0.5, cy = rect.top + rect.height * 0.39;
      var dx = (x - cx) / (rect.width * 0.64), dy = (y - cy) / (rect.height * 0.64);
      // A small dead zone and radial hysteresis keep centre from flickering.
      var deadZone = current === CENTER ? 0.22 : 0.17;
      if (Math.sqrt(dx * dx + dy * dy) < deadZone) return CENTER;
      var sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      return [5, 8, 7, 6, 3, 0, 1, 2][(sector + 8) % 8];
    }
    function reset() { queueFrame(CENTER); }

    window.addEventListener('pointermove', function (e) {
      // Touch only steers the head while the finger is on the portrait
      if (e.pointerType === 'touch' && !portrait.contains(e.target)) return;
      queueFrame(frameFromPoint(e.clientX, e.clientY));
    }, { passive: true });
    portrait.addEventListener('pointerdown', function (e) {
      queueFrame(frameFromPoint(e.clientX, e.clientY));
    });
    portrait.addEventListener('pointerup', function (e) { if (e.pointerType === 'touch') reset(); });
    portrait.addEventListener('pointercancel', reset);
    html.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);

    setFrame(CENTER);
  })();

  // === Recommendations: every quote is visible; long ones get a "Read more" ===
  (function () {
    var root = document.getElementById('recs');
    if (!root) return;
    root.removeAttribute('aria-roledescription');
    Array.prototype.forEach.call(root.querySelectorAll('.rc-slide'), function (slide) {
      // Undo the classic carousel's hidden state
      slide.removeAttribute('hidden');
      slide.removeAttribute('aria-hidden');
      slide.removeAttribute('aria-roledescription');
      var quote = slide.querySelector('.rc-quote');
      if (!quote) return;
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'ht-more';
      more.setAttribute('aria-expanded', 'false');
      more.textContent = 'Read more';
      more.addEventListener('click', function () {
        var open = slide.classList.toggle('ht-open');
        more.setAttribute('aria-expanded', String(open));
        more.textContent = open ? 'Show less' : 'Read more';
      });
      quote.insertAdjacentElement('afterend', more);
    });
  })();

  // === Sidebar: mark the section currently on screen ===
  (function () {
    var links = Array.prototype.slice.call(document.querySelectorAll('#ht-sections a[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });

    function activate(id) {
      links.forEach(function (a) {
        var on = a === byId[id];
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }
    // A section counts as "current" while it crosses a band in the upper part of the viewport
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) activate(entry.target.id);
      });
    }, { rootMargin: '-25% 0px -65% 0px' });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  })();

  // === GitHub: latest public repos + dot-matrix contribution graph ===
  // Both are public endpoints (no token). The markup ships with a static fallback,
  // so a failed or rate-limited request just leaves that in place.
  (function () {
    var reposEl = document.getElementById('ht-gh-repos');
    var graphEl = document.getElementById('ht-gh-graph');
    var totalEl = document.getElementById('ht-gh-total');
    var countEl = document.getElementById('ht-repo-count');
    if (!reposEl || !window.fetch) return;

    // fetch JSON, cached in localStorage for CACHE_MS
    function cachedJson(key, url, slim) {
      try {
        var hit = JSON.parse(localStorage.getItem(key) || 'null');
        if (hit && Date.now() - hit.t < CACHE_MS) return Promise.resolve(hit.d);
      } catch (e) {}
      return fetch(url, { headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          var d = slim(data);
          try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
          return d;
        });
    }

    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function monthYear(iso) {
      var d = new Date(iso);
      return isNaN(d) ? '' : MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    }

    cachedJson('ejg-gh-repos', 'https://api.github.com/users/' + GH_USER + '/repos?sort=pushed&per_page=100', function (list) {
      return {
        count: list.length,
        repos: list.filter(function (r) { return !r.fork && !r.archived; }).slice(0, 6).map(function (r) {
          return { name: r.name, url: r.html_url, language: r.language, pushed: r.pushed_at };
        })
      };
    }).then(function (data) {
      if (!data || !data.repos || !data.repos.length) return;
      if (countEl && data.count && data.count < 100) countEl.textContent = String(data.count);
      var frag = document.createDocumentFragment();
      data.repos.forEach(function (r) {
        // Only ever link to github.com, whatever the API returns
        if (!/^https:\/\/github\.com\//.test(r.url || '')) return;
        var a = document.createElement('a');
        a.className = 'ht-repo';
        a.href = r.url;
        a.target = '_blank';
        a.rel = 'noopener';
        var name = document.createElement('span');
        name.className = 'ht-repo-name';
        name.textContent = r.name;
        var meta = document.createElement('span');
        meta.className = 'ht-repo-meta';
        meta.textContent = [r.language, monthYear(r.pushed)].filter(Boolean).join(' · ');
        a.appendChild(name);
        a.appendChild(meta);
        frag.appendChild(a);
      });
      if (frag.childNodes.length) {
        reposEl.textContent = '';
        reposEl.appendChild(frag);
      }
    }).catch(function () { /* keep the static fallback */ });

    if (!graphEl) return;
    // Contribution calendar comes from a public mirror of the GitHub profile graph
    cachedJson('ejg-gh-contrib', 'https://github-contributions-api.jogruber.de/v4/' + GH_USER + '?y=last', function (data) {
      return {
        total: data.total && data.total.lastYear,
        days: (data.contributions || []).map(function (c) { return [c.date, c.level]; })
      };
    }).then(function (data) {
      if (!data || !data.days || data.days.length < 28) return;
      var NS = 'http://www.w3.org/2000/svg';
      var CELL = 12, RADII = [1, 2.2, 3.2, 4.2, 5.2];   // dot size encodes the day's activity level
      var offset = new Date(data.days[0][0] + 'T00:00:00Z').getUTCDay();   // rows are Sun..Sat
      var cols = Math.ceil((offset + data.days.length) / 7);
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + cols * CELL + ' ' + 7 * CELL);
      svg.setAttribute('aria-hidden', 'true');
      data.days.forEach(function (day, i) {
        var slot = offset + i;
        var level = Math.max(0, Math.min(4, day[1] | 0));
        var dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', Math.floor(slot / 7) * CELL + CELL / 2);
        dot.setAttribute('cy', (slot % 7) * CELL + CELL / 2);
        dot.setAttribute('r', RADII[level]);
        dot.setAttribute('fill', 'currentColor');
        if (level === 0) dot.setAttribute('opacity', '0.28');
        svg.appendChild(dot);
      });
      graphEl.textContent = '';
      graphEl.appendChild(svg);
      graphEl.hidden = false;
      if (totalEl && typeof data.total === 'number') {
        totalEl.textContent = data.total.toLocaleString('en-US') + ' contributions in the last year';
        totalEl.hidden = false;
      }
    }).catch(function () { /* graph stays hidden */ });
  })();
})();
