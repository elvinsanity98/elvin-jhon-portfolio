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

  // Shared between the portrait and the tour: while the tour runs, its stand-in cursor
  // steers the portrait's head instead of the real pointer.
  var touring = false;
  var portraitLookAt = null;            // function (x, y), or (null) to face forward

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
    function reset() { if (!touring) queueFrame(CENTER); }
    portraitLookAt = function (x, y) { queueFrame(x == null ? CENTER : frameFromPoint(x, y)); };

    window.addEventListener('pointermove', function (e) {
      if (touring) return;
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

  // === Projects: fanned card deck ===
  // Three cards show at once: the front one is the live link, one peeks out on each side.
  // Clicking a peeking card (or the arrows, arrow keys, a swipe) deals it to the front.
  // Icons and tags come from data-icon / data-tags on each .proj in the markup.
  (function () {
    var grid = document.querySelector('#projects .proj-grid');
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.proj'));
    var n = cards.length;
    if (n < 3) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cur = 0;

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    }

    cards.forEach(function (card) {
      var tags = (card.getAttribute('data-tags') || '').split('|').filter(Boolean);
      if (tags.length) {
        var row = el('div', 'ht-proj-tags');
        tags.forEach(function (t) { row.appendChild(el('span', 'ht-proj-tag', t)); });
        card.insertBefore(row, card.firstChild);
      }
      var name = card.querySelector('.proj-name');
      if (name) {
        var head = el('div', 'ht-proj-head');
        var tile = el('span', 'ht-proj-icon');
        tile.setAttribute('aria-hidden', 'true');
        // Only a plain fa-* class name is accepted from the attribute
        var icon = /^fa-[a-z0-9-]+$/.test(card.getAttribute('data-icon') || '') ? card.getAttribute('data-icon') : 'fa-cube';
        tile.appendChild(el('i', 'fas ' + icon));
        card.insertBefore(head, name);
        head.appendChild(tile);
        head.appendChild(name);
      }
    });

    var bar = el('div', 'ht-deck-bar');
    var prevBtn = el('button');
    prevBtn.type = 'button';
    prevBtn.setAttribute('aria-label', 'Previous project');
    prevBtn.appendChild(el('i', 'fas fa-chevron-left'));
    var count = el('span', 'ht-deck-count');
    count.setAttribute('aria-live', 'polite');
    var nextBtn = el('button');
    nextBtn.type = 'button';
    nextBtn.setAttribute('aria-label', 'Next project');
    nextBtn.appendChild(el('i', 'fas fa-chevron-right'));
    bar.appendChild(prevBtn);
    bar.appendChild(count);
    bar.appendChild(nextBtn);

    function pad(v) { return v < 10 ? '0' + v : String(v); }
    // Where card i sits relative to the front one: 0 front, 1 right, -1 left, 'off' hidden
    function poseOf(i) {
      var d = (i - cur + n) % n;
      return d === 0 ? '0' : d === 1 ? '1' : d === n - 1 ? '-1' : 'off';
    }
    function layout() {
      cards.forEach(function (card, i) { card.setAttribute('data-pos', poseOf(i)); });
      count.textContent = pad(cur + 1) + ' / ' + pad(n);
    }
    function show(i) {
      i = ((i % n) + n) % n;
      if (i === cur) return;
      // Deal from the side the card is on (or the nearer side when it was hidden)
      var ahead = (i - cur + n) % n;
      var fromRight = ahead <= n / 2;
      var incoming = cards[i];
      cur = i;
      layout();
      if (reduce) return;
      incoming.classList.remove('ht-deal-r', 'ht-deal-l');
      void incoming.offsetWidth;                      // restart the animation if it was mid-flight
      incoming.classList.add(fromRight ? 'ht-deal-r' : 'ht-deal-l');
    }

    // All cards share the tallest one's height so the deck never jumps
    function measure() {
      grid.style.removeProperty('--ht-card-h');
      var tallest = 0;
      cards.forEach(function (card) { tallest = Math.max(tallest, card.offsetHeight); });
      if (tallest) grid.style.setProperty('--ht-card-h', tallest + 'px');
    }

    var swiped = false;
    cards.forEach(function (card, i) {
      card.addEventListener('animationend', function () { card.classList.remove('ht-deal-r', 'ht-deal-l'); });
      // Remember whether the card was in front when the press began: focusing it (below)
      // brings it forward before 'click' fires, and that click must not follow the link.
      card.addEventListener('pointerdown', function () { card._wasFront = i === cur; });
      card.addEventListener('focus', function () { show(i); });
      card.addEventListener('click', function (e) {
        var wasFront = card._wasFront;
        card._wasFront = undefined;
        if (swiped || wasFront === false) { e.preventDefault(); show(i); }
      });
      card.setAttribute('draggable', 'false');
    });
    prevBtn.addEventListener('click', function () { show(cur - 1); });
    nextBtn.addEventListener('click', function () { show(cur + 1); });
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      show(cur + (e.key === 'ArrowRight' ? 1 : -1));
      cards[cur].focus({ preventScroll: true });
    });
    // Horizontal swipe flips through the deck
    var startX = null;
    grid.addEventListener('pointerdown', function (e) { startX = e.clientX; swiped = false; });
    grid.addEventListener('pointerup', function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) < 40) return;
      swiped = true;                                  // the click that follows is not a tap
      show(cur + (dx < 0 ? 1 : -1));
      setTimeout(function () { swiped = false; }, 0);
    });
    grid.addEventListener('pointercancel', function () { startX = null; });

    grid.classList.add('ht-deck');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-roledescription', 'carousel');
    grid.setAttribute('aria-label', 'Projects');
    grid.insertAdjacentElement('afterend', bar);
    layout();
    measure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 150);
    });
  })();

  // === Certifications: icon tile on top of each card (from its data-icon) ===
  (function () {
    Array.prototype.forEach.call(document.querySelectorAll('#certs .cert'), function (card) {
      var cls = card.getAttribute('data-icon') || '';
      if (!/^fa[bs] fa-[a-z0-9-]+$/.test(cls)) cls = 'fas fa-certificate';
      var tile = document.createElement('span');
      tile.className = 'ht-cert-icon';
      tile.setAttribute('aria-hidden', 'true');
      var icon = document.createElement('i');
      icon.className = cls;
      tile.appendChild(icon);
      card.insertBefore(tile, card.firstChild);
    });
  })();

  // === Tour: a stand-in cursor walks the page and types a line at each stop ===
  // Plays by itself on a visitor's first desktop visit. "Take the tour" in the sidebar,
  // the G key, or the pill it leaves at the bottom replays it. Any click, key press,
  // scroll or touch ends it. Add ?tour=1 to the URL to force it.
  (function () {
    var NAME = 'Elvin';
    var SEEN_KEY = 'ejg-tour-seen', PILL_KEY = 'ejg-tour-pill';
    // sel: what to point at; several matches make the cursor sweep across them
    // at:  where on the element the cursor rests, as [x, y] fractions of its box
    // say: the line typed at that stop
    var STOPS = [
      { sel: '.hero-name', at: [0.02, -0.1], above: true, say: "Hi! I'm Elvin, welcome to my website! 👋" },
      { sel: '.ht-socials a', at: [0.5, 1.1], say: 'Here are my social links.' },
      { sel: '.ht-figure', at: [0.3, 0.9], say: 'A few quick numbers about my work.' },
      { sel: '.ht-side .ht-nav a[href*="github.com"]', at: [1, 0.6], say: 'My code lives on GitHub.' },
      { sel: '#ht-sections a[href="#projects"]', at: [1, 0.6], say: "Things I've built. Click the cards to shuffle them." },
      { sel: '#ht-sections a[href="#experience"]', at: [1, 0.6], say: "Where I've worked and studied." },
      { sel: '#ht-sections a[href="#certs"]', at: [1, 0.6], say: 'My certifications. Each one links to its proof.' },
      { sel: '#ht-sections a[href="#recs"]', at: [1, 0.6], say: "What people I've worked with say." },
      { sel: '.ht-mode', at: [1, 0.6], say: 'Light or dark? Pick your theme here.' },
      { sel: '.ht-mail', at: [1, 0.7], say: "Here's my email." },
      { sel: '.ht-bio', at: [0, 0.8], say: "That's the tour. Scroll around and enjoy your stay! ✌️" }
    ];

    var desktop = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var startBtn = document.getElementById('ht-tour-start');

    function make(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    }
    function stored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function store(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

    // The stand-in cursor and its bubble are decoration: hidden from assistive tech
    var cursor = make('div', 'ht-tour-cursor');
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = '<svg viewBox="0 0 18 18"><path d="M2 1.5 15.6 8 9.4 9.7 7.3 16z"/></svg>';
    var bubble = make('div', 'ht-tour-bubble');
    bubble.setAttribute('aria-hidden', 'true');
    var textEl = make('span', 'ht-tour-text');
    bubble.appendChild(make('span', 'ht-tour-name', NAME));
    bubble.appendChild(textEl);

    var pill = make('div', 'ht-tour-pill');
    pill.hidden = true;
    var pillMain = make('button');
    pillMain.type = 'button';
    var pillIcon = make('i', 'fas fa-rotate-right');
    pillIcon.setAttribute('aria-hidden', 'true');
    var pillLabel = make('span');
    pillMain.appendChild(pillIcon);
    pillMain.appendChild(pillLabel);
    var pillClose = make('button');
    pillClose.type = 'button';
    pillClose.setAttribute('aria-label', 'Hide this');
    pillClose.appendChild(make('i', 'fas fa-xmark'));
    pill.appendChild(pillMain);
    pill.appendChild(pillClose);

    document.body.appendChild(cursor);
    document.body.appendChild(bubble);
    document.body.appendChild(pill);

    var alive = false, timers = [], raf = 0;
    var settling = false;                 // scrolling back to the top before the first stop
    var pos = { x: 0, y: 0 }, above = false, flipX = false, hot = [];

    function later(fn, ms) { timers.push(setTimeout(function () { if (alive) fn(); }, ms)); }

    function placeBubble() {
      var w = bubble.offsetWidth, h = bubble.offsetHeight;
      var x = flipX ? pos.x - w - 6 : pos.x + 14;
      var y = above ? pos.y - h - 8 : pos.y + 18;
      bubble.style.transform = 'translate(' + Math.max(8, Math.round(x)) + 'px,' + Math.max(8, Math.round(y)) + 'px)';
    }
    function place() {
      cursor.style.transform = 'translate(' + pos.x.toFixed(1) + 'px,' + pos.y.toFixed(1) + 'px)';
      placeBubble();
      if (portraitLookAt) portraitLookAt(pos.x, pos.y);
    }
    function moveTo(x, y, done) {
      var from = { x: pos.x, y: pos.y };
      var dist = Math.sqrt(Math.pow(x - from.x, 2) + Math.pow(y - from.y, 2));
      var dur = Math.max(380, Math.min(1000, dist * 1.5));
      var t0 = performance.now();
      (function frame(now) {
        if (!alive) return;
        var t = Math.min(1, (now - t0) / dur);
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // ease in-out
        pos.x = from.x + (x - from.x) * e;
        pos.y = from.y + (y - from.y) * e;
        place();
        if (t < 1) raf = requestAnimationFrame(frame); else done();
      })(t0);
    }

    function cool() {
      hot.forEach(function (node) { node.classList.remove('ht-tour-hot'); });
      hot = [];
    }
    function heat(node) { node.classList.add('ht-tour-hot'); hot.push(node); }
    // Back to the bare name tag that rides along with the cursor
    function hush() {
      textEl.textContent = '';
      bubble.classList.remove('is-speaking', 'is-typing');
      above = false; flipX = false;
    }
    function type(line, wantAbove, done) {
      var chars = Array.from ? Array.from(line) : line.split('');
      // Measure the finished bubble once so it opens on a side with room and never flips mid-line
      textEl.textContent = line;
      bubble.classList.add('is-speaking');
      var w = bubble.offsetWidth, h = bubble.offsetHeight;
      flipX = pos.x + 14 + w > window.innerWidth - 10;
      above = !!wantAbove || pos.y + 18 + h > window.innerHeight - 10;
      textEl.textContent = '';
      bubble.classList.add('is-typing');
      var i = 0;
      (function tick() {
        textEl.textContent = chars.slice(0, ++i).join('');
        placeBubble();
        if (i < chars.length) later(tick, 26);
        else { bubble.classList.remove('is-typing'); done(); }
      })();
    }

    function onScreen(node) {
      var r = node.getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
    }
    function pointOn(node, at) {
      var r = node.getBoundingClientRect();
      return { x: r.left + r.width * at[0] + (at[0] === 1 ? 6 : 0), y: r.top + r.height * at[1] };
    }

    function runStop(i) {
      if (i >= STOPS.length) { stop(); return; }
      var s = STOPS[i];
      var targets = Array.prototype.filter.call(document.querySelectorAll(s.sel), onScreen);
      if (!targets.length) { runStop(i + 1); return; }      // not visible at this window size
      cool();
      hush();
      var p = pointOn(targets[0], s.at);
      moveTo(p.x, p.y, function () {
        heat(targets[0]);
        type(s.say, s.above, function () {
          var k = 1;
          (function sweep() {
            if (k >= targets.length) {
              later(function () { runStop(i + 1); }, targets.length > 1 ? 900 : Math.max(1200, s.say.length * 32));
              return;
            }
            later(function () {
              var q = pointOn(targets[k], s.at);
              moveTo(q.x, q.y, function () { cool(); heat(targets[k]); k++; sweep(); });
            }, 420);
          })();
        });
      });
    }

    function setPill(mode) {
      if (mode === 'skip') {
        pillIcon.className = 'fas fa-stop';
        pillLabel.textContent = 'skip tour';
        pillClose.hidden = true;
        pill.hidden = false;
      } else {
        pillIcon.className = 'fas fa-rotate-right';
        pillLabel.textContent = stored(SEEN_KEY) ? 'take the tour again' : 'take the tour';
        pillClose.hidden = false;
        pill.hidden = stored(PILL_KEY) === 'off';
      }
    }

    function start() {
      if (alive || !desktop.matches) return;
      store(SEEN_KEY, '1');
      alive = true;
      touring = true;
      setPill('skip');
      var begin = function () {
        settling = false;
        pos = { x: window.innerWidth * 0.66, y: window.innerHeight * 0.6 };
        hush();
        place();
        document.body.classList.add('ht-tour-on');
        later(function () { runStop(0); }, 450);
      };
      // Every stop is at the top of the page: scroll there first and wait until it arrives
      if (window.scrollY > 4) {
        settling = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        var tries = 0;
        (function waitForTop() {
          if (window.scrollY <= 4) { begin(); return; }
          if (++tries > 40) { window.scrollTo(0, 0); begin(); return; }
          later(waitForTop, 80);
        })();
      } else begin();
    }
    function stop() {
      if (!alive) return;
      alive = false;
      touring = false;
      settling = false;
      timers.forEach(clearTimeout);
      timers = [];
      cancelAnimationFrame(raf);
      cool();
      hush();
      document.body.classList.remove('ht-tour-on');
      if (portraitLookAt) portraitLookAt(null);
      setPill('again');
    }

    pillMain.addEventListener('click', function () { if (alive) stop(); else start(); });
    pillClose.addEventListener('click', function () { store(PILL_KEY, 'off'); pill.hidden = true; });
    if (startBtn) startBtn.addEventListener('click', start);

    // The visitor taking over ends the tour. The tour's own controls handle themselves.
    function takeover(e) {
      if (!alive) return;
      if (e.target && e.target.closest && e.target.closest('.ht-tour-pill, .ht-tour-start')) return;
      stop();
    }
    ['pointerdown', 'wheel', 'touchstart'].forEach(function (name) {
      window.addEventListener(name, takeover, { passive: true });
    });
    window.addEventListener('scroll', function () { if (alive && !settling && window.scrollY > 40) stop(); }, { passive: true });
    window.addEventListener('resize', function () { if (alive) stop(); });
    document.addEventListener('keydown', function (e) {
      if (alive) { stop(); return; }
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      var t = e.target;
      if (t && t.matches && t.matches('input, textarea, select, [contenteditable]')) return;
      if ((e.key || '').toLowerCase() === 'g') start();
    });

    var forced = /[?&]tour=1(&|$)/.test(location.search);
    var firstVisit = !stored(SEEN_KEY) && !reduce && !location.hash && window.scrollY < 40;
    if (desktop.matches && (forced || firstVisit)) {
      var kickoff = function () { setTimeout(start, 900); };
      if (document.readyState === 'complete') kickoff();
      else window.addEventListener('load', kickoff, { once: true });
    } else {
      setPill('again');
    }
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
