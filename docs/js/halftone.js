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
        // Title with the user count (data-users) underneath, like an app store listing
        var titles = el('div', 'ht-proj-titles');
        card.insertBefore(head, name);
        head.appendChild(tile);
        head.appendChild(titles);
        titles.appendChild(name);
        // Reach: data-users for most apps, data-schools for the school system; none = no line
        var users = parseInt(card.getAttribute('data-users'), 10);
        var schools = parseInt(card.getAttribute('data-schools'), 10);
        var reach = users > 0 ? { n: users, one: 'user', many: 'users', icon: 'fa-users' }
                  : schools > 0 ? { n: schools, one: 'school', many: 'schools', icon: 'fa-school' }
                  : null;
        if (reach) {
          var count = el('span', 'ht-proj-users');
          var mark = el('i', 'fas ' + reach.icon);
          mark.setAttribute('aria-hidden', 'true');
          count.appendChild(mark);
          count.appendChild(el('b', '', reach.n.toLocaleString('en-US')));
          count.appendChild(document.createTextNode(' ' + (reach.n === 1 ? reach.one : reach.many)));
          titles.appendChild(count);
        }
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

  // === Sidebar "N people viewing now" ===
  // Simulated: there is no backend counting visitors. The number drifts at random
  // between MIN and MAX every few seconds, and now and then a face swaps.
  (function () {
    var countEl = document.getElementById('ht-viewer-count');
    var moreEl = document.getElementById('ht-viewer-more');
    if (!countEl) return;
    var MIN = 3, MAX = 58;
    var FACES = ['fa-user-astronaut', 'fa-user-tie', 'fa-user-graduate', 'fa-user-ninja',
                 'fa-user-secret', 'fa-user-doctor', 'fa-user'];
    var faces = Array.prototype.slice.call(document.querySelectorAll('.ht-viewer-faces i'));
    var n = MIN + Math.floor(Math.random() * (MAX - MIN + 1));

    function render(animate) {
      countEl.textContent = String(n);
      if (moreEl) {
        moreEl.hidden = n <= faces.length;
        moreEl.textContent = '+' + Math.max(0, n - faces.length);
      }
      if (animate) {
        countEl.classList.remove('is-ticking');
        void countEl.offsetWidth;
        countEl.classList.add('is-ticking');
      }
    }
    function swapFace() {
      var face = faces[Math.floor(Math.random() * faces.length)];
      if (!face) return;
      face.classList.add('is-swapping');
      setTimeout(function () {
        face.className = 'fas ' + FACES[Math.floor(Math.random() * FACES.length)];
      }, 300);
    }
    function step() {
      var delta = (1 + Math.floor(Math.random() * 4)) * (Math.random() < 0.5 ? -1 : 1);
      n = Math.max(MIN, Math.min(MAX, n + delta));
      render(true);
      if (Math.random() < 0.35) swapFace();
      setTimeout(step, 3500 + Math.random() * 5500);
    }
    render(false);
    setTimeout(step, 3500 + Math.random() * 5500);
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

  // === Typing test: Alt+J (Option+J on a Mac), or "Typing test" in the sidebar ===
  // A short run of common words with live WPM / accuracy / time, an on-screen keyboard
  // that outlines the next key, and a result card that compares the score with Elvin's.
  // While it is open it takes every key press, so the page shortcuts (D, T, G) stay quiet.
  (function () {
    var ELVIN_WPM = 85;                   // the score visitors try to beat
    var WORD_COUNT = 25;
    var MAX_EXTRA = 8;                    // wrong letters allowed past the end of a word
    var WORDS = ('the be to of and in that have it for not on with he as you do at this but his by ' +
      'from they we say her she or an will my one all would there their what so up out if about who ' +
      'get which go me when make can like time no just him know take people into year your good some ' +
      'could them see other than then now look only come its over think also back after use two how ' +
      'our work first well way even new want because any these give day most us find here thing many ' +
      'tell place where must while home small hand high keep turn start show every under never last ' +
      'long great little world own old right big still child house point change line part few ' +
      'open seem together next white begin both paper group always music those often until mile river ' +
      'car feet care second book carry took science eat room friend began idea fish mountain stop once ' +
      'base hear horse cut sure watch color face wood main enough plain girl usual young ready above ' +
      'ever red list though feel talk bird soon body dog family direct pose leave song measure door ' +
      'product black short class wind question happen complete ship area half rock order fire south ' +
      'problem piece told knew pass since top whole king space heard best hour better true during ' +
      'hundred five remember step early hold west ground interest reach fast verb sing listen six table ' +
      'travel less morning ten simple several toward war lay against pattern slow center love person ' +
      'money serve appear road map rain rule govern pull cold notice voice unit power town fine certain ' +
      'fly fall lead cry dark machine note wait plan figure star box noun field rest correct able pound ' +
      'done beauty drive stood contain front teach week final gave green quick develop ocean warm free ' +
      'minute strong special mind behind clear tail produce fact street inch nothing course stay wheel ' +
      'full force blue object decide surface deep moon island foot system busy test record boat common ' +
      'gold possible plane dry wonder laugh thousand ago ran check game shape yes hot miss brought heat ' +
      'snow tire bring distant fill east paint language among').split(' ');
    var ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    var opener = document.getElementById('ht-tt-open');
    var modKey = document.getElementById('ht-tt-mod');
    if (modKey && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')) {
      modKey.textContent = '⌥';     // Option
    }

    var overlay = null, ui = {}, wordNodes = [], keyNodes = {};
    var words = [], typed = [], wi = 0;
    var keys = 0, goodKeys = 0;           // letter + space presses, and the ones that were right
    var t0 = 0, tEnd = 0, ticker = 0, running = false, done = false, confirming = false;
    var open = false, lastFocus = null, hideTimer = 0, shift = -1;

    function make(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    function build() {
      overlay = make('div', 'ht-tt');
      overlay.hidden = true;
      overlay.tabIndex = -1;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Typing test');
      overlay.innerHTML =
        '<div class="ht-tt-veil" data-tt="veil"></div>' +
        '<div class="ht-tt-body">' +
          '<div class="ht-tt-stats">' +
            '<div><b data-tt="wpm">0</b><span>wpm</span></div>' +
            '<div><b><span data-tt="acc">100</span><i>%</i></b><span>acc</span></div>' +
            '<div><b><span data-tt="time">0</span><i>s</i></b><span>time</span></div>' +
          '</div>' +
          '<div class="ht-tt-text" aria-hidden="true"><div class="ht-tt-lines" data-tt="lines"></div></div>' +
          '<div class="ht-tt-board" aria-hidden="true" data-tt="board"></div>' +
          '<div class="ht-tt-result" aria-live="polite">' +
            '<div class="ht-tt-main"><b class="ht-tt-big" data-tt="rwpm">0</b><span class="ht-tt-cap">words per minute</span></div>' +
            '<div class="ht-tt-grid">' +
              '<div><b><span data-tt="racc">0</span><i>%</i></b><span>accuracy</span></div>' +
              '<div><b data-tt="rraw">0</b><span>raw</span></div>' +
              '<div><b><span data-tt="rtime">0</span><i>s</i></b><span>time</span></div>' +
            '</div>' +
            '<p class="ht-tt-verdict" data-tt="verdict"></p>' +
            '<button type="button" class="ht-tt-again" data-tt="again"><i class="fas fa-rotate-right" aria-hidden="true"></i> try again</button>' +
          '</div>' +
          '<p class="ht-tt-hint"><span><kbd>tab</kbd> restart</span><span><kbd>esc</kbd> close</span></p>' +
          '<p class="ht-tt-confirm">restart test? <kbd>enter</kbd> confirm <span aria-hidden="true">·</span> <kbd>esc</kbd> cancel</p>' +
        '</div>';
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-tt]'), function (node) {
        ui[node.getAttribute('data-tt')] = node;
      });
      ui.caret = make('span', 'ht-tt-caret');

      var n = 0;
      ROWS.concat([' ']).forEach(function (row) {
        var rowNode = make('div', 'ht-tt-row');
        row.split('').forEach(function (ch) {
          var key = make('span', 'ht-tt-key' + (ch === ' ' ? ' is-space' : ''), ch === ' ' ? 'space' : ch);
          key.style.setProperty('--i', n++);
          keyNodes[ch] = key;
          rowNode.appendChild(key);
        });
        ui.board.appendChild(rowNode);
      });

      ui.veil.addEventListener('click', close);
      ui.again.addEventListener('click', reset);
      document.body.appendChild(overlay);
    }

    function pickWords() {
      var out = [];
      while (out.length < WORD_COUNT) {
        var w = WORDS[Math.floor(Math.random() * WORDS.length)];
        if (w && w !== out[out.length - 1]) out.push(w);
      }
      return out;
    }

    // Letters are a-z only, so building the markup as a string is safe
    function paint(i) {
      var w = words[i], t = typed[i], html = '';
      for (var j = 0; j < Math.max(w.length, t.length); j++) {
        var cls = j >= t.length ? '' : j >= w.length ? 'is-extra' : t[j] === w[j] ? 'is-ok' : 'is-bad';
        html += (cls ? '<span class="' + cls + '">' : '<span>') + (j < w.length ? w[j] : t[j]) + '</span>';
      }
      wordNodes[i].innerHTML = html;
      wordNodes[i].classList.toggle('is-wrong', i < wi && t !== w);
    }
    function renderAll() {
      ui.lines.textContent = '';
      wordNodes = words.map(function (w, i) {
        var node = make('span', 'ht-tt-word');
        ui.lines.appendChild(node);
        return node;
      });
      words.forEach(function (w, i) { paint(i); });
      ui.lines.appendChild(ui.caret);
    }

    function placeCaret() {
      var chars = wordNodes[wi] && wordNodes[wi].children;
      if (!chars || !chars.length) return;
      var j = typed[wi].length, ref = chars[Math.min(j, chars.length - 1)];
      var x = ref.offsetLeft + (j >= chars.length ? ref.offsetWidth : 0);
      var lineH = parseFloat(getComputedStyle(ui.lines).lineHeight) || 40;
      var line = Math.floor((ref.offsetTop + ref.offsetHeight / 2) / lineH);
      var caretH = ui.caret.offsetHeight;
      ui.caret.style.transform = 'translate(' + x + 'px,' + (line * lineH + (lineH - caretH) / 2) + 'px)';
      // Keep the current line second from the top once the first line is done
      var next = Math.max(0, line - 1) * lineH;
      if (next !== shift) { shift = next; ui.lines.style.transform = 'translateY(' + (-next) + 'px)'; }
    }
    function markNext() {
      Object.keys(keyNodes).forEach(function (k) { keyNodes[k].classList.remove('is-next'); });
      if (done) return;
      var w = words[wi], t = typed[wi], want = null;
      if (t.length < w.length) want = w[t.length];
      else if (wi < words.length - 1) want = ' ';
      if (want && keyNodes[want]) keyNodes[want].classList.add('is-next');
    }
    function flash(ch) {
      var key = keyNodes[ch];
      if (!key) return;
      key.classList.add('is-down');
      setTimeout(function () { key.classList.remove('is-down'); }, 110);
    }
    function refresh() { placeCaret(); markNext(); }

    // Characters of fully correct words (plus the space after each), and the correct
    // start of the word in progress. Backspaced mistakes do not count twice.
    function goodChars() {
      var n = 0;
      for (var i = 0; i <= wi; i++) {
        var w = words[i], t = typed[i];
        if (i < wi || done) {
          if (t === w) n += w.length + (i < words.length - 1 ? 1 : 0);
        } else {
          for (var j = 0; j < t.length && t[j] === w[j]; j++) n++;
        }
      }
      return n;
    }
    function allChars() {
      var n = wi;                         // spaces between the words typed so far
      for (var i = 0; i <= wi; i++) n += typed[i].length;
      return n;
    }
    function seconds() { return running ? (performance.now() - t0) / 1000 : done ? (tEnd - t0) / 1000 : 0; }
    function perMinute(chars, s) { return s > 0 ? chars / 5 / (s / 60) : 0; }

    function tick() {
      var s = seconds();
      ui.wpm.textContent = s >= 1 ? Math.round(perMinute(goodChars(), s)) : 0;
      ui.acc.textContent = keys ? Math.round(goodKeys / keys * 100) : 100;
      ui.time.textContent = Math.floor(s);
    }
    function begin() {
      running = true;
      t0 = performance.now();
      overlay.classList.add('is-typing');
      ticker = setInterval(tick, 250);
    }
    function countUp(node, to) {
      if (reduce.matches) { node.textContent = to; return; }
      var start = performance.now();
      (function step(now) {
        var p = Math.min(1, (now - start) / 700);
        node.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1 && open) requestAnimationFrame(step); else node.textContent = to;
      })(start);
    }
    function finish() {
      tEnd = performance.now();
      running = false;
      done = true;
      clearInterval(ticker);
      overlay.classList.remove('is-typing');
      var s = Math.max(0.1, (tEnd - t0) / 1000);
      var wpm = Math.round(perMinute(goodChars(), s));
      ui.racc.textContent = keys ? Math.round(goodKeys / keys * 100) : 100;
      ui.rraw.textContent = Math.round(perMinute(allChars(), s));
      ui.rtime.textContent = s.toFixed(1);
      var beat = wpm > ELVIN_WPM;
      ui.verdict.className = 'ht-tt-verdict' + (beat ? ' is-beat' : '');
      ui.verdict.innerHTML = '<i class="fas fa-' + (beat ? 'check' : 'xmark') + '" aria-hidden="true"></i><span></span>';
      ui.verdict.lastChild.textContent = (beat ? 'you beat elvin' : "you didn't beat elvin") + ' · ' + ELVIN_WPM + ' wpm';
      overlay.classList.add('is-result');
      markNext();
      countUp(ui.rwpm, wpm);
    }

    function setConfirm(on) {
      confirming = on;
      overlay.classList.toggle('is-confirming', on);
    }
    function reset() {
      clearInterval(ticker);
      running = false; done = false;
      keys = goodKeys = 0; wi = 0; shift = -1;
      setConfirm(false);
      overlay.classList.remove('is-result', 'is-typing');
      words = pickWords();
      typed = words.map(function () { return ''; });
      ui.wpm.textContent = '0'; ui.acc.textContent = '100'; ui.time.textContent = '0';
      renderAll();
      refresh();
      overlay.focus({ preventScroll: true });
    }

    function typeLetter(ch) {
      if (done) return;
      var w = words[wi], t = typed[wi];
      if (t.length >= w.length + MAX_EXTRA) return;
      if (!running) begin();
      keys++;
      if (t.length < w.length && w[t.length] === ch) goodKeys++;
      typed[wi] = t + ch;
      paint(wi);
      refresh();
      if (wi === words.length - 1 && typed[wi] === w) finish();   // last word right: done
    }
    function typeSpace() {
      if (done || !running || !typed[wi].length) return;
      keys++;
      if (typed[wi] === words[wi]) goodKeys++;
      if (wi === words.length - 1) { finish(); return; }
      wi++;
      paint(wi - 1);
      refresh();
    }
    function erase(wholeWord) {
      if (done) return;
      if (typed[wi].length) {
        typed[wi] = wholeWord ? '' : typed[wi].slice(0, -1);
      } else if (wi > 0 && typed[wi - 1] !== words[wi - 1]) {
        wi--;                             // step back only into a word that has a mistake
        if (wholeWord) typed[wi] = '';
        paint(wi + 1);
      } else return;
      paint(wi);
      refresh();
    }

    function openTest() {
      if (open) return;
      if (!overlay) build();
      open = true;
      clearTimeout(hideTimer);
      lastFocus = document.activeElement;
      overlay.hidden = false;
      html.classList.add('ht-tt-lock');
      reset();
      requestAnimationFrame(function () { if (open) overlay.classList.add('is-open'); });
      // Web fonts can land after the first measure
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (open) refresh(); });
    }
    function close() {
      if (!open) return;
      open = false;
      clearInterval(ticker);
      running = false;
      setConfirm(false);
      overlay.classList.remove('is-open');
      html.classList.remove('ht-tt-lock');
      hideTimer = setTimeout(function () { overlay.hidden = true; }, reduce.matches ? 0 : 340);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    if (opener) opener.addEventListener('click', openTest);
    window.addEventListener('resize', function () { if (open && !done) refresh(); });

    // Capture phase on window: runs before the page's own shortcuts, so while the test
    // is open no other handler sees the key.
    window.addEventListener('keydown', function (e) {
      var k = e.key;
      if (e.code === 'KeyJ' && e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (open) { e.stopImmediatePropagation(); close(); } else openTest();
        return;
      }
      if (!open) return;
      e.stopImmediatePropagation();
      if (k === 'Escape') { e.preventDefault(); if (confirming) setConfirm(false); else close(); return; }
      if (k === 'Tab') { e.preventDefault(); if (running) setConfirm(true); else reset(); return; }
      if (k === 'Enter') { if (confirming || done) { e.preventDefault(); reset(); } return; }
      if (confirming) { e.preventDefault(); return; }
      if (k === 'Backspace') { e.preventDefault(); flash('backspace'); erase(e.ctrlKey || e.altKey || e.metaKey); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;     // copy, zoom and friends still work
      if (k === ' ') { e.preventDefault(); flash(' '); typeSpace(); return; }   // a stray space never wipes the result
      if (k && k.length === 1) {
        var ch = k.toLowerCase();
        if (ch >= 'a' && ch <= 'z') { e.preventDefault(); flash(ch); typeLetter(ch); }
      }
    }, true);
  })();

  // === Live chat: a corner panel (C toggles it) ===
  // Visitors pick a name and post; messages are stored in Supabase (table portfolio_chat,
  // set up by supabase/chat.sql) and everyone's panel polls for new ones. Between real
  // messages, random Taglish compliments keep the room lively (like the viewer count,
  // those are simulated and never stored). If the table isn't reachable the type box hides
  // and only the random chatter runs.
  (function () {
    var CHAT_API = 'https://irtnucbqbkddvrqbiaru.supabase.co/rest/v1/portfolio_chat';
    var CHAT_KEY = 'sb_publishable_jZsZg8jId_AwSA1LMliBvg_kpGwxNwS';   // public "publishable" key; RLS guards the table
    var COLS = 'id,name,body,is_owner,created_at';
    var KEY = 'ejg-chat';                                   // 'open' | 'min': the visitor's last choice
    var NAME_KEY = 'ejg-chat-name';
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var roomy = window.matchMedia('(min-width: 1500px)');  // wide enough to sit beside the column
    var MAX_SHOWN = 60;
    var FACES = ['fa-user-astronaut', 'fa-user-tie', 'fa-user-graduate', 'fa-user-ninja',
                 'fa-user-secret', 'fa-user-doctor', 'fa-user'];
    var PEOPLE = ['kape_at_code', 'lodi.jm', 'tita_debugger', 'pandesal.js', 'sinigang.py',
                  'bisaya_coder', 'zambo_tech', 'night_shift_ph', 'adobo_stack', 'halo_halo_ui',
                  'kuya_keyboard', 'ate_mae', 'batang_90s', 'jeepney_devops', 'taga_liloy',
                  'ctrl_alt_kain', 'merienda_mode', 'ube_byte', 'boss_404', 'lumpia_loop',
                  'titser_ana', 'barako_brew', 'kalamansi.css', 'tambay_sa_terminal'];
    var LINES = [
      'grabe ang linis ng portfolio mo boss 🔥',
      'sana all ganito ka-organized yung site 😭',
      'idol! yung typing test nakakaadik haha',
      'lodi, pa-share naman ng tips sa web dev',
      'astig nung halftone portrait, sumusunod yung ulo sa cursor ko lol',
      'nakaka-inspire ka po sir, taga-ZN din ako!',
      'solid ng projects, legit pang-production talaga',
      'kung may company lang ako, hired ka na agad',
      'ganda ng dark mode, easy on the eyes',
      'ang smooth ng animations, walang lag kahit sa phone ko',
      "pinakita ko 'to sa classmates ko as inspo hehe",
      'minimal pero may dating, galing ng design',
      'certified IT god 🙌',
      'BSP reporting tapos web dev pa? ang lupet',
      'nilaro namin ng kapatid ko yung Tug of Math, ang saya!',
      'first time ko makakita ng portfolio na may typing test, astig',
      'the vibes are immaculate, sobrang aesthetic',
      'nakaka-motivate mag-aral ulit ng JavaScript',
      'ang galing pero humble pa rin 🙏',
      'proud Zamboanga del Norte! 💪',
      'na-beat ko wpm mo boss hehe, rematch?',
      'dito na lang ako tatambay, ang chill ng site',
      'pa-collab naman sa next project mo',
      'laking tulong nung resume maker, salamat po!',
      'ganda ng font, anong font gamit mo?',
      'sheesh, ang daming certificates 😮',
      'bank IT tapos 13 schools pa gumagamit ng system mo? galing',
      'kinilig ako sa UI, charot 😂',
      'yung tour mode, parang may sariling tour guide haha',
      "bookmark ko 'to, reference ko sa sarili kong portfolio",
      'ang bilis mag-load, walang arte',
      'pang-Silicon Valley yung dating pero gawang Liloy 🇵🇭',
      'sir pa-mentor naman po 🥺',
      'ito yung portfolio na hindi boring basahin',
      'ang ganda ng pagka-organize ng experience section',
      'servers hanggang frontend, sobrang daming alam',
      'na-share ko na sa GC namin, wow daw lahat',
      'nag-dark mode ako tapos light ulit, parehong maganda haha',
      'panalo yung card deck ng projects, ang satisfying i-swipe',
      'ganito pala dapat ang portfolio, take notes ako',
      'boss, open ka ba sa freelance? 👀',
      'ang wholesome ng site, good vibes lang'
    ];
    var AGREE = ['trueee', '+1 dito', 'korek!', 'agree ako dyan', 'real 💯', 'same thoughts',
                 'this ^', 'omsim', "totoo 'to", 'facts'];
    // Short codes raised by the database guard (supabase/chat.sql), in plain words
    var ERRORS = {
      slow_down: 'Easy lang 🙂 wait a few seconds before sending again.',
      too_many: "That's a lot of messages for now. Try again in a bit.",
      duplicate: 'You already sent that one.',
      no_links: "Links aren't allowed in the chat.",
      blocked_word: "Let's keep it friendly 🙂",
      name_taken: 'That name is reserved. Pick another one.'
    };

    var root, panel, pill, list, typingRow, typingWho, hereEl, unreadEl, timer;
    var form, asRow, asName, nameRow, nameInput, msgInput, sendBtn, errEl, countEl;
    var open = false, unread = 0, bag = [], lastPerson = '', lastKind = '';   // 'line' | 'agree' | 'real'
    var online = false, lastId = 0, seen = {}, pollTimer, sending = false;
    var myName = '';
    try { myName = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function faceFor(name) {
      var h = 0;
      for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
      return FACES[Math.abs(h) % FACES.length];
    }
    function nextLine() {
      if (!bag.length) {
        bag = LINES.slice();
        for (var i = bag.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1)), t = bag[i]; bag[i] = bag[j]; bag[j] = t;
        }
      }
      return bag.pop();
    }
    function nextPerson() {
      var p;
      do { p = pick(PEOPLE); } while (p === lastPerson);
      lastPerson = p;
      return p;
    }
    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }
    function tidy(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

    function build() {
      root = el('aside', 'ht-chat');
      root.setAttribute('aria-label', 'Live chat');

      pill = el('button', 'ht-chat-pill');
      pill.type = 'button';
      pill.setAttribute('aria-controls', 'ht-chat-panel');
      pill.setAttribute('aria-label', 'Open live chat');
      pill.innerHTML = '<i class="fas fa-comment-dots" aria-hidden="true"></i><span class="ht-chat-pill-label">Live chat</span>';
      unreadEl = el('b', 'ht-chat-unread');
      unreadEl.hidden = true;
      pill.appendChild(unreadEl);

      panel = el('div', 'ht-chat-panel');
      panel.id = 'ht-chat-panel';
      var head = el('div', 'ht-chat-head');
      head.appendChild(el('span', 'ht-chat-live'));
      head.appendChild(el('span', 'ht-chat-title', 'Live chat'));
      hereEl = el('span', 'ht-chat-here');
      head.appendChild(hereEl);
      var minBtn = el('button', 'ht-chat-min');
      minBtn.type = 'button';
      minBtn.setAttribute('aria-label', 'Minimize chat');
      minBtn.innerHTML = '<i class="fas fa-minus" aria-hidden="true"></i>';
      head.appendChild(minBtn);

      list = el('ol', 'ht-chat-list');
      list.setAttribute('aria-live', 'off');               // a stream of chatter would flood screen readers

      typingRow = el('div', 'ht-chat-typing');
      typingRow.setAttribute('aria-hidden', 'true');
      typingRow.innerHTML = '<span class="ht-chat-dots"><i></i><i></i><i></i></span>';
      typingWho = el('span', 'ht-chat-who');
      typingRow.appendChild(typingWho);
      typingRow.appendChild(document.createTextNode(' is typing'));

      // Type box: a name (remembered on this device) and the message
      form = el('form', 'ht-chat-form');
      form.hidden = true;                                  // shown once the chat server answers
      form.setAttribute('novalidate', '');

      nameRow = el('label', 'ht-chat-namerow');
      nameRow.appendChild(el('span', 'ht-chat-label', 'Name'));
      nameInput = el('input', 'ht-chat-name-input');
      nameInput.type = 'text';
      nameInput.maxLength = 24;
      nameInput.placeholder = 'Your name';
      nameInput.autocomplete = 'nickname';
      nameInput.setAttribute('enterkeyhint', 'next');
      nameRow.appendChild(nameInput);

      asRow = el('div', 'ht-chat-as');
      asRow.appendChild(document.createTextNode('as '));
      asName = el('b');
      asRow.appendChild(asName);
      var change = el('button', 'ht-chat-change', 'change');
      change.type = 'button';
      asRow.appendChild(change);

      var row = el('div', 'ht-chat-row');
      msgInput = el('input', 'ht-chat-input');
      msgInput.type = 'text';
      msgInput.maxLength = 200;
      msgInput.placeholder = 'Say something…';
      msgInput.autocomplete = 'off';
      msgInput.setAttribute('aria-label', 'Message');
      msgInput.setAttribute('enterkeyhint', 'send');
      sendBtn = el('button', 'ht-chat-send');
      sendBtn.type = 'submit';
      sendBtn.setAttribute('aria-label', 'Send');
      sendBtn.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i>';
      row.appendChild(msgInput);
      row.appendChild(sendBtn);

      var foot = el('div', 'ht-chat-foot');
      errEl = el('p', 'ht-chat-err');
      errEl.setAttribute('role', 'status');
      countEl = el('span', 'ht-chat-count');
      foot.appendChild(errEl);
      foot.appendChild(countEl);

      form.appendChild(nameRow);
      form.appendChild(asRow);
      form.appendChild(row);
      form.appendChild(foot);

      panel.appendChild(head);
      panel.appendChild(list);
      panel.appendChild(typingRow);
      panel.appendChild(form);

      root.appendChild(panel);
      root.appendChild(pill);
      document.body.appendChild(root);

      pill.addEventListener('click', function () { setOpen(true, true); });
      minBtn.addEventListener('click', function () { setOpen(false, true); });
      change.addEventListener('click', function () { showName(true); nameInput.focus(); nameInput.select(); });
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); msgInput.focus(); }
      });
      msgInput.addEventListener('input', function () {
        var left = 200 - msgInput.value.length;
        countEl.textContent = left <= 40 ? String(left) : '';
        if (errEl.textContent) say('');
      });
      [nameInput, msgInput].forEach(function (input) {
        input.addEventListener('keydown', function (e) { if (e.key === 'Escape') input.blur(); });
      });
      form.addEventListener('submit', function (e) { e.preventDefault(); send(); });
      showName(!myName);
    }

    function showName(editing) {
      if (editing && nameRow.hidden) nameInput.value = myName;   // "change": start from the saved name
      nameRow.hidden = !editing;
      asRow.hidden = editing;
      asName.textContent = myName;
    }
    function say(text, isError) {
      errEl.textContent = text;
      errEl.classList.toggle('is-error', !!isError);
    }

    function syncHere() {
      var src = document.getElementById('ht-viewer-count');
      hereEl.textContent = (src ? src.textContent : '') + ' here';
    }
    function setOpen(next, remember) {
      open = next;
      root.classList.toggle('is-open', open);
      pill.setAttribute('aria-expanded', String(open));
      if (open) {
        unread = 0;
        unreadEl.hidden = true;
        list.scrollTop = list.scrollHeight;
      } else if (root.contains(document.activeElement)) {
        pill.focus();
      }
      if (remember) { try { localStorage.setItem(KEY, open ? 'open' : 'min'); } catch (e) {} }
      var side = document.getElementById('ht-chat-open');
      if (side) side.setAttribute('aria-expanded', String(open));
      schedulePoll(400);
    }

    function post(msg, opts) {
      opts = opts || {};
      var li = el('li', 'ht-chat-msg' + (opts.quiet || reduce ? '' : ' is-new') + (opts.mine ? ' is-mine' : ''));
      var av = el('span', 'ht-chat-av');
      av.setAttribute('aria-hidden', 'true');
      av.appendChild(el('i', 'fas ' + (msg.is_owner ? 'fa-user-check' : faceFor(msg.name))));
      var body = el('div', 'ht-chat-body');
      var nm = el('span', 'ht-chat-name', msg.name);
      if (msg.is_owner) {
        nm.classList.add('is-owner');
        var badge = el('i', 'fas fa-circle-check');
        badge.setAttribute('aria-label', 'Site owner');
        nm.appendChild(badge);
      }
      body.appendChild(nm);
      body.appendChild(el('p', 'ht-chat-text', msg.body));
      li.appendChild(av);
      li.appendChild(body);

      var nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
      list.appendChild(li);
      while (list.children.length > MAX_SHOWN) list.removeChild(list.firstChild);
      if (nearBottom || opts.quiet || opts.mine) list.scrollTop = list.scrollHeight;

      if (!open && !opts.quiet && !opts.mine) {
        unread = Math.min(unread + 1, 99);
        unreadEl.textContent = String(unread);
        unreadEl.hidden = false;
      }
      lastKind = opts.real ? 'real' : (opts.agree ? 'agree' : 'line');
    }
    function addReal(rows, quiet) {
      rows.forEach(function (r) {
        if (seen[r.id]) return;
        seen[r.id] = true;
        if (r.id > lastId) lastId = r.id;
        post(r, { quiet: quiet, real: true });
      });
    }

    // --- Server: plain REST calls to Supabase (no client library needed) ---
    function api(query, init) {
      init = init || {};
      var headers = { apikey: CHAT_KEY, Accept: 'application/json' };
      if (init.body) { headers['Content-Type'] = 'application/json'; headers.Prefer = 'return=representation'; }
      return fetch(CHAT_API + query, { method: init.method || 'GET', headers: headers, body: init.body })
        .then(function (res) {
          return res.json().catch(function () { return null; }).then(function (data) {
            if (!res.ok) {
              var err = new Error((data && data.message) || ('HTTP ' + res.status));
              err.status = res.status;
              err.code = data && data.code;
              throw err;
            }
            return data;
          });
        });
    }
    function loadHistory() {
      return api('?select=' + COLS + '&order=id.desc&limit=20').then(function (rows) {
        online = true;
        form.hidden = false;
        addReal((rows || []).reverse(), true);
      });
    }
    function poll() {
      if (!online || document.hidden) return schedulePoll();
      api('?select=' + COLS + '&id=gt.' + lastId + '&order=id.asc&limit=30')
        .then(function (rows) { addReal(rows || [], false); })
        .catch(function () {})
        .then(function () { schedulePoll(); });
    }
    function schedulePoll(delay) {
      clearTimeout(pollTimer);
      if (!online) return;
      pollTimer = setTimeout(poll, delay != null ? delay : (open ? 6000 : 30000));
    }

    function send() {
      if (sending) return;
      var name = tidy(nameRow.hidden ? myName : nameInput.value);
      var text = tidy(msgInput.value);
      if (name.length < 2) {
        showName(true);
        say('Pick a name first (2 to 24 characters).', true);
        nameInput.focus();
        return;
      }
      if (!text) { msgInput.focus(); return; }
      sending = true;
      sendBtn.disabled = true;
      say('Sending…');
      api('?select=' + COLS, { method: 'POST', body: JSON.stringify({ name: name, body: text }) })
        .then(function (rows) {
          var row = rows && rows[0];
          myName = name;
          try { localStorage.setItem(NAME_KEY, myName); } catch (e) {}
          showName(false);
          msgInput.value = '';
          countEl.textContent = '';
          say('');
          if (row && !seen[row.id]) {
            seen[row.id] = true;
            if (row.id > lastId) lastId = row.id;
            post(row, { mine: true, real: true });
          }
        })
        .catch(function (err) {
          var msg = ERRORS[err.message];
          if (!msg && err.code === '23514') msg = 'Names need 2 to 24 characters; messages up to 200.';
          if (!msg && err.code === 'PGRST205') msg = 'The chat is offline right now.';
          say(msg || "Couldn't send. Check your connection and try again.", true);
          if (err.message === 'name_taken') { showName(true); nameInput.focus(); nameInput.select(); }
        })
        .then(function () {
          sending = false;
          sendBtn.disabled = false;
          if (open && document.activeElement !== nameInput) msgInput.focus();
        });
    }

    // --- Random chatter: someone "types" for a moment, then a line lands. Paused while the
    // tab is hidden, the typing test is up, or the visitor is typing a message of their own.
    function beat() {
      var busy = document.hidden || html.classList.contains('ht-tt-lock') ||
                 (root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT');
      if (busy) { timer = setTimeout(beat, 3000); return; }
      var agree = lastKind === 'line' && Math.random() < 0.18;   // only ever agree with the chatter
      var name = nextPerson();
      var text = agree ? pick(AGREE) : nextLine();
      typingWho.textContent = name;
      typingRow.classList.add('is-on');
      timer = setTimeout(function () {
        typingRow.classList.remove('is-on');
        syncHere();
        post({ name: name, body: text }, { agree: agree });
        timer = setTimeout(beat, 4500 + Math.random() * 6500);
      }, agree ? 700 : 1000 + Math.random() * 1400);
    }

    build();
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    setOpen(saved ? saved === 'open' : roomy.matches, false);
    syncHere();
    loadHistory()
      .catch(function () {})                               // no table / offline: chatter only
      .then(function () {
        // Start mid-conversation rather than empty
        if (list.children.length < 3) {
          post({ name: nextPerson(), body: nextLine() }, { quiet: true });
          post({ name: nextPerson(), body: nextLine() }, { quiet: true });
        }
        timer = setTimeout(beat, 2500);
        schedulePoll();
      });

    var sideBtn = document.getElementById('ht-chat-open');
    if (sideBtn) {
      sideBtn.setAttribute('aria-controls', 'ht-chat-panel');
      sideBtn.setAttribute('aria-expanded', String(open));
      sideBtn.addEventListener('click', function () { setOpen(!open, true); });
    }
    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      var t = e.target;
      if (t && t.matches && t.matches('input, textarea, select, [contenteditable]')) return;
      if ((e.key || '').toLowerCase() === 'c') setOpen(!open, true);
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) schedulePoll(300); });
  })();
})();
