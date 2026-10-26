/*
 * Glacier Theme: Dashboard, Docker tile. A click on a container opens a dialog with its state
 * and everything Unraid's small context menu offers, as large buttons: Open WebUI, Stop,
 * Restart, Pause, Resume or Start, Console, Logs, Update, Edit, Remove and the template's links.
 * The buttons call Unraid's own functions, the ones its menu calls.
 *
 * Ported from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Tunefish, MIT License; see NOTICE.md.
 *
 * The container's details are the arguments of the icon's onclick call (read as text, never
 * run). Unraid 7.3.4's DashboardApps.php writes
 *   addDockerContainerContext(name, imageId, template, running, paused, updateStatus,
 *     autostart, webui, tswebui, shell, id, support, project, registry, donateLink, readme)
 * Whenever the call does not look like that, or Unraid's functions are missing, the click is
 * left alone and Unraid's own menu opens.
 */
(function () {
  'use strict';

  var G = window.Glacier;
  if (!G) return;
  var t = G.t;
  var el = G.el;

  function safeUrl(url) {
    return /^https?:\/\/[^\s"'<>]+$/i.test(url || '') ? url : '';
  }

  // The container behind a chip, or null when anything is unexpected.
  function readChip(chip) {
    // FolderView folders keep their own menu; group chips (scripts/gl-groups.js) are not containers.
    if (!chip || chip.matches('[class*="folder-"], .gl-group-chip')) return null;
    var trigger = chip.querySelector(':scope > span.hand[onclick^="addDockerContainerContext("]');
    if (!trigger) return null;
    var a = G.contextArguments(trigger);
    if (a.length !== 16) return null;
    if (!a[0] || !/^[01]$/.test(a[3]) || !/^[01]$/.test(a[4]) || !/^[0-3]$/.test(a[5]) || !/^(true|false)$/.test(a[6])) return null;
    if (!/^[0-9a-f]{12,64}$/i.test(a[10]) || a[10] !== trigger.id) return null;
    if (typeof window.eventControl !== 'function') return null;
    return {
      trigger: trigger,
      name: a[0], image: a[1], template: a[2],
      running: a[3] === '1', paused: a[4] === '1', update: a[5] === '1', autostart: a[6] === 'true',
      webui: safeUrl(a[7]), tswebui: safeUrl(a[8]), shell: a[9], id: a[10],
      support: safeUrl(a[11]), project: safeUrl(a[12]), registry: safeUrl(a[13]), donate: safeUrl(a[14]), readme: safeUrl(a[15])
    };
  }

  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function () { if (typeof window[name] === 'function') window[name].apply(window, args); };
  }

  function open(ct) {
    var state = ct.running ? (ct.paused ? 'paused' : 'running') : 'stopped';
    var close = function () { if (typeof G.closeModal === 'function') G.closeModal(); };

    function action(icon, label, run, kind) {
      var button = el('button', 'gl-ct-action' + (kind ? ' gl-ct-' + kind : ''));
      button.type = 'button';
      var glyph = el('i', 'fa fa-' + icon);
      glyph.setAttribute('aria-hidden', 'true');
      button.append(glyph, el('span', null, label));
      button.addEventListener('click', function () {
        close();
        run();
      });
      return button;
    }

    function link(icon, label, url, webui) {
      var node = el('a', 'gl-ct-action gl-ct-link');
      if (webui) {
        G.webuiOpener(node, url);
      } else {
        node.href = url;
        node.target = '_blank';
        node.rel = 'noopener noreferrer';
      }
      node.title = url;
      var glyph = el('i', 'fa fa-' + icon);
      glyph.setAttribute('aria-hidden', 'true');
      node.append(glyph, el('span', null, label));
      node.addEventListener('click', function () { setTimeout(close); });
      return node;
    }

    var control = function (verb) {
      return function () { window.eventControl({ action: verb, container: ct.id }, 'loadlist'); };
    };

    var body = el('div', 'gl-ct-body');
    var primary = el('div', 'gl-ct-primary');
    if (state === 'running') {
      if (ct.webui) primary.append(link('globe', t('Open WebUI', "Ouvrir l'interface web"), ct.webui, true));
      primary.append(
        action('stop', t('Stop', 'Arrêter'), control('stop'), 'danger-soft'),
        action('refresh', t('Restart', 'Redémarrer'), control('restart')),
        action('pause', t('Pause', 'Suspendre'), control('pause'))
      );
    } else if (state === 'paused') {
      primary.append(
        action('play', t('Resume', 'Reprendre'), control('resume')),
        action('refresh', t('Restart', 'Redémarrer'), control('restart')),
        action('stop', t('Stop', 'Arrêter'), control('stop'), 'danger-soft')
      );
    } else {
      primary.append(action('play', t('Start', 'Démarrer'), control('start')));
    }
    if (primary.firstElementChild) primary.firstElementChild.classList.add('gl-ct-main');
    body.append(primary);

    var manage = el('div', 'gl-ct-grid');
    if (state === 'running') manage.append(action('terminal', t('Console', 'Console'), call('openTerminal', 'docker', ct.name, ct.shell)));
    manage.append(action('align-left', t('Logs', 'Journaux'), call('openTerminal', 'docker', ct.name, '.log')));
    if (ct.update) manage.append(action('cloud-download', t('Update', 'Mettre à jour'), call('updateContainer', ct.name), 'warn'));
    if (ct.template) manage.append(action('pencil', t('Edit', 'Modifier'), call('editContainer', ct.name, ct.template)));
    manage.append(action('trash', t('Remove', 'Supprimer'), call('rmContainer', ct.name, ct.image, ct.id), 'danger'));
    body.append(el('h3', 'gl-ct-section', t('Manage', 'Gérer')), manage);

    var links = el('div', 'gl-ct-grid');
    if (state === 'running' && ct.tswebui) links.append(link('globe', t('Tailscale WebUI', 'Interface Tailscale'), ct.tswebui, true));
    if (ct.readme) links.append(link('book', t('Read me first', 'À lire en premier'), ct.readme));
    if (ct.project) links.append(link('life-ring', t('Project page', 'Page du projet'), ct.project));
    if (ct.support) links.append(link('question-circle', t('Support', 'Support'), ct.support));
    if (ct.registry) links.append(link('info-circle', t('More info', "Plus d'infos"), ct.registry));
    if (ct.donate) links.append(link('heart', t('Donate', 'Faire un don'), ct.donate));
    if (links.childElementCount) body.append(el('h3', 'gl-ct-section', t('Links', 'Liens')), links);

    G.modal({
      title: ct.name,
      content: body,
      hideConfirm: true,
      hideCancel: true
    });

    // Glacier.modal draws the title; the icon, the tags and a close button go around it.
    var box = body.closest('.gl-modal');
    if (!box) return;
    box.classList.add('gl-ct-modal', 'gl-ct-' + state);
    var title = box.querySelector('.gl-modal-title');
    var head = el('div', 'gl-ct-head');
    var icon = el('div', 'gl-ct-icon');
    var picture = ct.trigger.querySelector('img, i');
    if (picture) {
      var copy = picture.cloneNode(true);
      copy.removeAttribute('id');
      copy.removeAttribute('onerror');
      copy.alt = '';
      icon.append(copy);
    }
    var text = el('div', 'gl-ct-text');
    var tags = el('div', 'gl-ct-tags');
    tags.append(el('span', 'gl-pill gl-ct-state' + (state === 'running' ? ' gl-tone-success' : state === 'paused' ? ' gl-tone-warn' : ''),
      { running: t('Running', 'Démarré'), paused: t('Paused', 'En pause'), stopped: t('Stopped', 'Arrêté') }[state]));
    tags.append(el('span', 'gl-pill', ct.autostart ? t('Autostart on', 'Démarrage auto activé') : t('Autostart off', 'Démarrage auto désactivé')));
    if (ct.update) tags.append(el('span', 'gl-pill gl-tone-warn', t('Update available', 'Mise à jour disponible')));
    title.title = ct.name;
    text.append(title, tags);
    var closeButton = G.iconButton('times', t('Close', 'Fermer'), close, 'gl-ct-close');
    head.append(icon, text, closeButton);
    box.prepend(head);
    var actions = box.querySelector('.gl-modal-actions');
    if (actions && !actions.childElementCount) actions.remove();
    var first = primary.firstElementChild || closeButton;
    first.focus();
  }

  G.feature('dashboard-dialog', function () {
    var view = document.getElementById('docker_view');
    if (!view || view.dataset.glDialog) return;
    view.dataset.glDialog = '1';

    // Each container's icon becomes a keyboard stop that opens the dialog too. Unraid redraws
    // the chips on every refresh; only chips that pass the checks are marked.
    function mark() {
      view.querySelectorAll('span.outer.apps > span.hand[onclick^="addDockerContainerContext("]:not([data-gl-dialog])').forEach(function (hand) {
        var ct = readChip(hand.parentElement);
        hand.setAttribute('data-gl-dialog', ct ? '1' : '0');
        if (!ct) return;
        hand.setAttribute('role', 'button');
        hand.tabIndex = 0;
        hand.setAttribute('aria-haspopup', 'dialog');
        hand.setAttribute('aria-label', ct.name + t(': details and actions', ' : détails et actions'));
      });
    }
    G.watch(view, mark);

    // Captured before Unraid's own handler on the icon, which would open its small menu instead.
    view.addEventListener('click', function (event) {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      var chip = event.target.closest('span.outer.apps');
      if (!chip || !view.contains(chip) || event.target.closest('.gl-group-apps, a[href], input')) return;
      var ct = readChip(chip);
      if (!ct) return;
      event.preventDefault();
      event.stopPropagation();
      open(ct);
    }, true);

    view.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var hand = event.target.closest && event.target.closest('span.hand[data-gl-dialog="1"]');
      if (!hand) return;
      var ct = readChip(hand.parentElement);
      if (!ct) return;
      event.preventDefault();
      open(ct);
    });
  });
})();
