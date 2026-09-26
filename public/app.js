/* Hello Kulti - progressive enhancement. No dependencies, no build step. */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORAGE_KEY = 'kulti-theme';
  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) root.classList.add('motion-off');

  /* ---------- Theme toggle ---------- */
  var toggle = document.getElementById('theme-toggle');
  var toggleLabel = toggle ? toggle.querySelector('[data-theme-label]') : null;

  function effectiveTheme() {
    var current = root.getAttribute('data-theme');
    if (current === 'light' || current === 'dark') return current;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }

  function syncToggle() {
    if (!toggle) return;
    var isLight = effectiveTheme() === 'light';
    toggle.setAttribute('aria-pressed', String(isLight));
    toggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    if (toggleLabel) toggleLabel.textContent = isLight ? 'Light' : 'Dark';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      /* private mode: theme just will not persist */
    }
    syncToggle();
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      applyTheme(effectiveTheme() === 'light' ? 'dark' : 'light');
    });
  }

  if (window.matchMedia) {
    var scheme = window.matchMedia('(prefers-color-scheme: light)');
    var onSchemeChange = function () {
      var stored = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch (err) {
        stored = null;
      }
      if (stored !== 'light' && stored !== 'dark') syncToggle();
    };
    if (typeof scheme.addEventListener === 'function') {
      scheme.addEventListener('change', onSchemeChange);
    } else if (typeof scheme.addListener === 'function') {
      scheme.addListener(onSchemeChange);
    }
  }

  syncToggle();

  /* ---------- Time-aware greeting ---------- */
  function greetingForHour(hour) {
    if (hour < 5) return 'Still up? Hello, Kulti';
    if (hour < 12) return 'Good morning, Kulti';
    if (hour < 18) return 'Good afternoon, Kulti';
    return 'Good evening, Kulti';
  }

  var greetingEl = document.querySelector('[data-greeting]');
  if (greetingEl) {
    greetingEl.textContent = greetingForHour(new Date().getHours());
    // Prefer the server's own answer when it is reachable.
    fetch('/api/greeting', { headers: { accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status');
        return res.json();
      })
      .then(function (data) {
        if (data && typeof data.message === 'string' && typeof data.timeOfDay === 'string') {
          greetingEl.textContent =
            greetingForHour(new Date().getHours()) + ' \u00b7 ' + data.message;
        }
      })
      .catch(function () {
        /* keep the local greeting */
      });
  }

  /* ---------- Live server status ---------- */
  var healthDot = document.querySelector('[data-health-dot]');
  var healthText = document.querySelector('[data-health-text]');

  function setHealth(state, message) {
    if (healthDot) {
      healthDot.classList.remove('pill__dot--ok', 'pill__dot--down');
      if (state === 'ok') healthDot.classList.add('pill__dot--ok');
      if (state === 'down') healthDot.classList.add('pill__dot--down');
    }
    if (healthText) healthText.textContent = message;
  }

  function checkHealth() {
    fetch('/health', { headers: { accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status');
        return res.json();
      })
      .then(function (data) {
        var up = typeof data.uptimeSeconds === 'number' ? data.uptimeSeconds : 0;
        setHealth('ok', 'Server online \u00b7 up ' + up + 's');
      })
      .catch(function () {
        setHealth('down', 'Server unreachable');
      });
  }

  if (healthText) {
    checkHealth();
    setInterval(checkHealth, 15000);
  }

  /* ---------- Copy to clipboard ---------- */
  var toast = document.getElementById('toast');
  var toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.hidden = true;
    }, 2200);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
    button.addEventListener('click', function () {
      var text = button.getAttribute('data-copy') || '';
      var done = function () {
        showToast('Copied: ' + text);
        button.setAttribute('data-copied', 'true');
        window.setTimeout(function () {
          button.removeAttribute('data-copied');
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          showToast('Copy failed - select the text manually');
        });
      } else {
        showToast('Clipboard unavailable in this browser');
      }
    });
  });

  /* ---------- Scroll reveals ---------- */
  var revealables = document.querySelectorAll('.reveal');
  if (!revealables.length) {
    /* nothing to do */
  } else if (prefersReducedMotion || typeof IntersectionObserver !== 'function') {
    Array.prototype.forEach.call(revealables, function (el) {
      el.classList.add('is-visible');
    });
  } else {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.15 }
    );
    Array.prototype.forEach.call(revealables, function (el) {
      observer.observe(el);
    });
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
