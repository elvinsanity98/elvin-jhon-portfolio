document.addEventListener('DOMContentLoaded', function () {
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear().toString();

  window.addEventListener('load', function () {
    var loader = document.getElementById('loader');
    if (loader) {
      setTimeout(function () {
        loader.style.opacity = '0';
        loader.style.visibility = 'hidden';
        setTimeout(function () { loader.remove(); }, 500);
      }, 800);
    }
  });

  var menuToggle = document.getElementById('menu-toggle');
  var mobileMenu = document.getElementById('mobile-menu');
  var hamburger = document.getElementById('hamburger');
  var menuOpen = false;

  if (menuToggle && mobileMenu && hamburger) {
    menuToggle.addEventListener('click', function () {
      menuOpen = !menuOpen;
      if (menuOpen) {
        mobileMenu.style.maxHeight = mobileMenu.scrollHeight + 'px';
        mobileMenu.style.opacity = '1';
      } else {
        mobileMenu.style.maxHeight = '0';
        mobileMenu.style.opacity = '0';
      }
      var bars = hamburger.querySelectorAll('span');
      if (menuOpen) {
        bars[0].style.transform = 'translateY(8px) rotate(45deg)';
        bars[1].style.opacity = '0';
        bars[2].style.transform = 'translateY(-8px) rotate(-45deg)';
        bars[2].style.width = '20px';
      } else {
        bars[0].style.transform = '';
        bars[1].style.opacity = '1';
        bars[2].style.transform = '';
        bars[2].style.width = '12px';
      }
    });
    document.querySelectorAll('.mobile-link').forEach(function (link) {
      link.addEventListener('click', function () {
        menuOpen = false;
        mobileMenu.style.maxHeight = '0';
        mobileMenu.style.opacity = '0';
        var bars = hamburger.querySelectorAll('span');
        bars[0].style.transform = '';
        bars[1].style.opacity = '1';
        bars[2].style.transform = '';
        bars[2].style.width = '12px';
      });
    });
  }

  var navbar = document.getElementById('navbar');
  var lastScroll = 0;
  window.addEventListener('scroll', function () {
    var s = window.pageYOffset;
    if (navbar) {
      if (s > lastScroll && s > 500) navbar.style.transform = 'translateY(-100%)';
      else navbar.style.transform = 'translateY(0)';
    }
    lastScroll = s;
  });

  var revealEls = document.querySelectorAll('.reveal');
  var revealObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry, i) {
      if (entry.isIntersecting) {
        setTimeout(function () {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, i * 100);
        revealObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  revealEls.forEach(function (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(40px)';
    el.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
    revealObs.observe(el);
  });

  var counters = document.querySelectorAll('[data-count]');
  var counterObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var t = parseInt(entry.target.getAttribute('data-count') || '0');
        var c = 0, inc = t / 60;
        var timer = setInterval(function () {
          c += inc;
          if (c >= t) { c = t; clearInterval(timer); }
          entry.target.textContent = Math.floor(c) + '+';
        }, 33);
        counterObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(function (c) { counterObs.observe(c); });

  var backToTop = document.getElementById('back-to-top');
  window.addEventListener('scroll', function () {
    if (backToTop) {
      if (window.pageYOffset > 500) {
        backToTop.style.opacity = '1';
        backToTop.style.transform = 'translateY(0)';
        backToTop.style.pointerEvents = 'all';
      } else {
        backToTop.style.opacity = '0';
        backToTop.style.transform = 'translateY(16px)';
        backToTop.style.pointerEvents = 'none';
      }
    }
  });
  if (backToTop) backToTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var id = this.getAttribute('href');
      var el = document.querySelector(id);
      if (el) {
        var pos = el.getBoundingClientRect().top + window.pageYOffset - 100;
        window.scrollTo({ top: pos, behavior: 'smooth' });
      }
    });
  });

  var form = document.getElementById('contact-form');
  var status = document.getElementById('form-status');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var data = { name: fd.get('name'), email: fd.get('email'), message: fd.get('message') };
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Sending...'; }
      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (status) {
          status.classList.remove('hidden');
          status.className = 'text-center py-3 rounded-xl text-sm font-medium bg-green-500/10 text-green-400 border border-green-500/20';
          status.innerHTML = '<i class="fas fa-check-circle mr-2"></i>' + (res.message || 'Sent!');
          form.reset();
        }
      })
      .catch(function () {
        if (status) {
          status.classList.remove('hidden');
          status.className = 'text-center py-3 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20';
          status.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i>Something went wrong.';
        }
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Send Message'; }
        setTimeout(function () { if (status) status.classList.add('hidden'); }, 5000);
      });
    });
  }

  if (window.matchMedia('(pointer: fine)').matches) {
    var cur = document.createElement('div');
    cur.style.cssText = 'position:fixed;width:384px;height:384px;border-radius:50%;pointer-events:none;z-index:1;background:radial-gradient(circle,rgba(14,165,233,0.06) 0%,transparent 70%);transform:translate(-50%,-50%);transition:left 0.3s,top 0.3s;';
    document.body.appendChild(cur);
    document.addEventListener('mousemove', function (e) {
      cur.style.left = e.clientX + 'px';
      cur.style.top = e.clientY + 'px';
    });
  }
});