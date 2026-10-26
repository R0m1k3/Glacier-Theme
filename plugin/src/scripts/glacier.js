/*
 * Glacier Theme: page enhancements that CSS alone cannot do.
 * Loaded with "defer" by GlacierTheme.page, so the page's own markup is in place.
 *
 * - Dashboard: a greeting card above the tiles with the server name, the array status
 *   (read from the footer) and the uptime (read from the server tile, kept in step).
 * - Badges for disk temperatures and file systems in tables. Unraid rewrites those tables
 *   every few seconds, so new rows are marked as they arrive.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  if (!root.classList.contains('glacier')) return;

  var lang = (root.getAttribute('lang') || 'en').slice(0, 2).toLowerCase();
  var TEXT = {
    fr: {
      morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir',
      healthy: 'est en ligne.', attention: 'demande votre attention.', stopped: "a l'array arrêté.",
      array: 'Array', uptime: 'En ligne depuis', version: 'Version', apps: 'Installer une app', docker: 'Conteneurs',
      updates: 'Mises à jour', upToDate: 'Tout est à jour', container: ['conteneur', 'conteneurs'], plugin: ['plugin', 'plugins']
    },
    en: {
      morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening',
      healthy: 'is online.', attention: 'needs your attention.', stopped: 'has its array stopped.',
      array: 'Array', uptime: 'Up for', version: 'Version', apps: 'Install an app', docker: 'Containers',
      updates: 'Updates', upToDate: 'All up to date', container: ['container', 'containers'], plugin: ['plugin', 'plugins']
    }
  };
  var t = TEXT[lang] || TEXT.en;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function text(selector) {
    var node = document.querySelector(selector);
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function greeting() {
    var hour = new Date().getHours();
    if (hour < 12) return t.morning;
    if (hour < 18) return t.afternoon;
    return t.evening;
  }

  // "Array Started" / "Array Stopped" / "Array Starting", as the footer shows it.
  function arrayState() {
    var status = document.querySelector('#statusbar > span');
    var label = status ? status.textContent.replace(/\s+/g, ' ').trim() : '';
    var kind = 'ok';
    if (status && status.classList.contains('red')) kind = 'stopped';
    else if (status && status.classList.contains('orange')) kind = 'warn';
    return { label: label, kind: kind };
  }

  function buildHero() {
    if (!root.classList.contains('gl-hero-on')) return;
    var frame = document.querySelector('#displaybox > .content > .frame');
    if (!frame || frame.querySelector('.gl-hero') || document.querySelector('.gl-hero')) return;

    // Server name: the tile title, else the page title ("Tower/Dashboard").
    var server = text('#tile1 h3.tile-header-main') || document.title.split('/')[0] || 'Unraid';
    var comment = text('#tile1 .tile-header-left .section > span');
    var version = text('#header unraid-header-os-version span[role="button"][aria-haspopup]');
    var state = arrayState();

    var hero = el('section', 'gl-hero');
    hero.setAttribute('aria-label', server);

    var top = el('div', 'gl-hero-top');
    var copy = el('div', 'gl-hero-text');
    var pill = el('span', 'gl-hero-status' + (state.kind === 'warn' ? ' is-warn' : state.kind === 'stopped' ? ' is-stopped' : ''), state.label || t.array);
    var title = el('h1', null, greeting() + '. ' + server + ' ' + (state.kind === 'ok' ? t.healthy : state.kind === 'warn' ? t.attention : t.stopped));
    copy.append(pill, title);
    if (comment) copy.append(el('p', null, comment));

    var actions = el('div', 'gl-hero-actions');
    var menuApps = document.querySelector('#menu .nav-item a[href="/Apps"]');
    if (menuApps) {
      var apps = el('a', 'gl-primary', t.apps);
      apps.href = '/Apps';
      actions.append(apps);
    }
    var menuDocker = document.querySelector('#menu .nav-item a[href="/Docker"]');
    if (menuDocker) {
      var docker = el('a', null, t.docker);
      docker.href = '/Docker';
      actions.append(docker);
    }
    top.append(copy);
    if (actions.childElementCount) top.append(actions);

    var facts = el('dl', 'gl-hero-facts');
    function fact(label, value) {
      var box = el('div');
      var dd = el('dd', null, value || '—');
      box.append(el('dt', null, label), dd);
      facts.append(box);
      return dd;
    }
    fact(t.array, state.label);
    var uptime = fact(t.uptime, text('#tile1 .uptime'));
    var updates = window.glacierUpdates;
    if (updates) {
      var parts = [];
      if (updates.docker) parts.push(updates.docker + ' ' + t.container[updates.docker > 1 ? 1 : 0]);
      if (updates.plugins) parts.push(updates.plugins + ' ' + t.plugin[updates.plugins > 1 ? 1 : 0]);
      var pending = fact(t.updates, parts.length ? parts.join(' · ') : t.upToDate);
      if (parts.length) pending.className = 'is-warn';
    }
    if (version) fact(t.version, version);

    hero.append(top, facts);
    frame.prepend(hero);

    // The server tile updates its uptime every few seconds; follow it.
    var source = document.querySelector('#tile1 .uptime');
    if (source && 'MutationObserver' in window) {
      new MutationObserver(function () {
        uptime.textContent = source.textContent.replace(/\s+/g, ' ').trim() || '—';
      }).observe(source, { childList: true, characterData: true, subtree: true });
    }
  }

  // ---- Badges -------------------------------------------------------------------------
  // "34 °C", or "4.20 W / 34 °C" when power is shown; Unraid puts a thin space before the degree.
  var TEMP = /^\s*(?:[\d.,]+\s*W\s*\/\s*)?(-?\d+(?:[.,]\d+)?)\s*°\s*([CF])\s*$/;
  var FS = /^\s*(?:luks:)?(?:xfs|btrfs|zfs|reiserfs|vfat|exfat|ntfs|ext[234]|f2fs)\s*$/i;
  // Warning and critical disk temperatures from Disk Settings (°C), handed over by GlacierTheme.page.
  var limits = window.glacierTemp || { hot: 45, max: 55 };

  function celsius(value, unit) {
    var n = parseFloat(value.replace(',', '.'));
    return unit === 'F' ? (n - 32) * 5 / 9 : n;
  }

  function mark(node) {
    if (node.childElementCount || node.classList.contains('gl-badge')) return;
    var raw = node.textContent;
    if (!raw || raw.length > 40) return;
    var kind = null;
    var temp = raw.match(TEMP);
    if (temp) kind = 'gl-temp';
    else if (FS.test(raw)) kind = 'gl-fs';
    if (!kind) return;
    // The cell (or a fixed-width span in a Dashboard tile) keeps its layout; its text goes into
    // a badge inside it.
    var target = el('span', 'gl-badge ' + kind, raw.trim());
    node.textContent = '';
    node.append(target);
    if (temp) {
      var c = celsius(temp[1], temp[2]);
      if (limits.max > 0 && c >= limits.max) target.classList.add('is-max');
      else if (limits.hot > 0 && c >= limits.hot) target.classList.add('is-hot');
    }
  }

  function markWithin(scope) {
    if (scope.nodeType !== 1) return;
    if (scope.matches('#displaybox table td, #displaybox table td span')) mark(scope);
    scope.querySelectorAll('#displaybox table td, #displaybox table td span').forEach(mark);
  }

  var pending = new Set();
  var scheduled = false;
  function flush() {
    scheduled = false;
    pending.forEach(markWithin);
    pending.clear();
  }

  function watchBadges() {
    var box = document.getElementById('displaybox');
    if (!box) return;
    markWithin(box);
    if (!('MutationObserver' in window)) return;
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        pending.add(record.target);
        record.addedNodes.forEach(function (node) { if (node.nodeType === 1) pending.add(node); });
      });
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    }).observe(box, { childList: true, subtree: true });
  }

  // ---- Update counters on the Docker and Plugins menu entries ---------------------------
  function markMenuCounts() {
    var updates = window.glacierUpdates;
    if (!updates) return;
    [['/Docker', updates.docker], ['/Plugins', updates.plugins]].forEach(function (entry) {
      if (!entry[1]) return;
      var link = document.querySelector('#menu .nav-item a[href="' + entry[0] + '"]');
      if (link) link.setAttribute('data-gl-count', String(entry[1]));
    });
  }

  // ---- Theme credit with its version at the end of the footer ---------------------------
  function addCredit() {
    var footer = document.getElementById('copyright');
    if (!footer || footer.querySelector('.gl-credit')) return;
    var link = el('a', 'gl-credit', 'Glacier ' + (window.glacierVersion || ''));
    link.href = '/Settings/GlacierThemeSettings';
    link.title = 'Glacier Theme';
    footer.append(link);
  }

  // ---- Date and time in the middle of the header card -----------------------------------
  // The browser's clock, in the webGUI's language; refreshed when the minute changes.
  function addClock() {
    var header = document.getElementById('header');
    if (!header || header.querySelector('.gl-clock')) return;
    var locale = root.getAttribute('lang') || undefined;
    var clock = el('div', 'gl-clock');
    clock.setAttribute('aria-hidden', 'true');
    var time = el('span', 'gl-clock-time');
    var date = el('span', 'gl-clock-date');
    clock.append(time, date);
    var logo = header.querySelector('unraid-header-os-version');
    if (logo) logo.after(clock); else header.prepend(clock);
    function tick() {
      var now = new Date();
      try {
        time.textContent = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        var text = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        date.textContent = text.charAt(0).toUpperCase() + text.slice(1);
      } catch (error) {
        time.textContent = now.toTimeString().slice(0, 5);
        date.textContent = now.toDateString();
      }
      setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
    }
    tick();
  }

  markMenuCounts();
  addClock();
  addCredit();
  buildHero();
  watchBadges();
})();
