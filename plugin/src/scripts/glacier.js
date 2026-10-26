/*
 * Glacier Theme: page enhancements that CSS alone cannot do.
 * Loaded with "defer" by GlacierTheme.page, so the page's own markup is in place.
 *
 * - Dashboard: a greeting card above the tiles with the server name, the array status
 *   (read from the footer) and the uptime (read from the server tile, kept in step).
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
      array: 'Array', uptime: 'En ligne depuis', version: 'Version', apps: 'Installer une app', docker: 'Conteneurs'
    },
    en: {
      morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening',
      healthy: 'is online.', attention: 'needs your attention.', stopped: 'has its array stopped.',
      array: 'Array', uptime: 'Up for', version: 'Version', apps: 'Install an app', docker: 'Containers'
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

  buildHero();
})();
