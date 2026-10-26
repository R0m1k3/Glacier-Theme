/*
 * Glacier Theme: the Docker tab (Docker > Docker Containers).
 *
 * Ported from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Tunefish, MIT License; see NOTICE.md.
 *
 * - Key figures above the list: containers, running, stopped, updates.
 * - Filter buttons with counts (all, running, stopped, updates) and a search field.
 * - Unraid's Basic / Advanced switch as a two-part control (it clicks Unraid's own switch).
 * - A compact container list (icon, name and image, web UI, state, version, CPU, memory, ports,
 *   autostart, actions), or Unraid's full table; remembered per browser. The compact list only
 *   switches on while Unraid's table has exactly the columns of 7.3.4, otherwise the stock table
 *   stays as it is. On phones each container becomes a card.
 * - A loading line while Unraid asks Docker for the list.
 * - Application groups (scripts/gl-groups.js), unless FolderView arranges the list.
 *
 * Unraid's own rows and cells stay in place (its scripts update them by id every few seconds);
 * cells are only added and classed. Unraid rebuilds the rows on each refresh, so new rows are
 * decorated as they arrive. Rows done are marked (data-gl-docker), and text is only written
 * when it changed, so the list's observer settles after one more pass.
 */
(function () {
  'use strict';

  var G = window.Glacier;
  if (!G) return;
  var t = G.t;
  var el = G.el;

  // DockerContainers.page (7.3.4): Application, Version, Network, Container IP, Container Port,
  // LAN IP:Port, Volume Mappings, CPU & Memory load (th.load), Autostart (th.nine), Uptime (th.five).
  var COLUMNS = ['name', 'version', 'network', 'ip', 'cport', 'ports', 'volumes', 'load', 'auto', 'uptime'];
  var VIEW_KEY = 'glacier-docker-view';
  var FILTER_KEY = 'glacier-docker-filter';
  var WEBUI = /^https?:\/\/[^\s\[\]'"<>]+$/i;

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (error) { /* storage blocked */ }
  }

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  function toggleClass(node, name, on) {
    if (node.classList.contains(name) !== Boolean(on)) node.classList.toggle(name, Boolean(on));
  }

  // FolderView (folder.view, .view2, .view3) turns rows into folders; the theme then leaves the
  // rows to it (no compact list, filters, search or groups) and only adds the key figures.
  function folderView() {
    return window.glacierFolderView === true || Boolean(document.querySelector('script[src*="/folder.view"]'));
  }

  function headMatches(headRow) {
    if (!headRow || headRow.children.length !== COLUMNS.length) return false;
    var cells = headRow.children;
    return cells[7].classList.contains('load') && cells[8].classList.contains('nine') && cells[9].classList.contains('five');
  }

  function rowMatches(row) {
    var cells = row.children;
    return cells.length === COLUMNS.length
      && cells[0].matches('td.ct-name')
      && cells[1].matches('td.updatecolumn')
      && Boolean(cells[7].querySelector('[class^="cpu-"]'))
      && Boolean(cells[7].querySelector('[class^="mem-"]'));
  }

  // One of Unraid's rows as data. The state comes from the icon Unraid colours (it keeps its
  // started / paused / stopped class while a spinner shows), the rest from the arguments of the
  // icon's addDockerContainerContext(name, image, template, started, paused, update, ...) call.
  function describe(row) {
    var cell = row.querySelector('td.ct-name');
    var trigger = cell.querySelector('span.hand[onclick*="addDockerContainerContext"]');
    var args = G.contextArguments(trigger);
    var nameNode = cell.querySelector('.appname');
    var stateIcon = cell.querySelector('.inner > i.started, .inner > i.paused, .inner > i.stopped');
    var running = stateIcon ? stateIcon.classList.contains('started') || stateIcon.classList.contains('paused') : args[3] === '1';
    var paused = stateIcon ? stateIcon.classList.contains('paused') : args[4] === '1';
    var updateCell = row.querySelector('td.updatecolumn');
    var update = args.length >= 11 ? args[5] === '1' : Boolean(updateCell && updateCell.querySelector('.orange-text .fa-flash'));
    return {
      row: row,
      cell: cell,
      trigger: trigger,
      args: args,
      name: nameNode ? nameNode.textContent.trim() : (args[0] || ''),
      id: trigger ? trigger.id : '',
      running: running && !paused,
      paused: paused,
      stopped: !running,
      update: update,
      text: ''
    };
  }

  // "linuxserver/sonarr:latest" from the advanced block of the name cell ("By: <a>repo</a>" or
  // "By: repo") and the version line of the update cell; empty when either is missing.
  function imageLine(row) {
    var block = row.querySelector('td.ct-name > div.advanced');
    var last = block && block.lastChild;
    if (!last) return '';
    var repo = last.nodeType === 1 ? last.textContent.trim() : last.textContent.split(': ').pop().trim();
    var tag = row.querySelector('td.updatecolumn div.advanced > i.fa-info-circle');
    var version = tag && tag.parentElement ? tag.parentElement.textContent.trim() : '';
    if (!repo || /\s/.test(repo)) return '';
    return repo + (version && !/\s/.test(version) ? ':' + version : '');
  }

  G.feature('docker', function () {
    var table = document.getElementById('docker_containers');
    var list = document.getElementById('docker_list');
    if (!table || !list || table.dataset.glDocker) return;
    table.dataset.glDocker = '1';

    var anchor = table.closest('.TableContainer') || table;
    var headRow = table.querySelector('thead tr');
    var fv = folderView();
    var canCompact = !fv && headMatches(headRow);
    var state = {
      filter: 'all',
      compact: canCompact && readStorage(VIEW_KEY) !== 'full',
      groups: null,
      ready: false
    };
    var stored = readStorage(FILTER_KEY);
    if (!fv && /^(all|running|stopped|updates)$/.test(stored || '')) state.filter = stored;
    var decimalMark = window.glacierDecimalMark === ',' ? ',' : '.';

    // ---- Extra header cells for the compact list (hidden in the full table).
    if (canCompact) {
      Array.prototype.forEach.call(headRow.children, function (cell, index) { cell.classList.add('gl-c-' + COLUMNS[index]); });
      // The web UI and actions columns hold round buttons; their headings are for screen readers.
      [['webui', t('Web interface', 'Interface web'), true], ['status', t('Status', 'État')], ['cpu', 'CPU'], ['mem', t('Memory', 'Mémoire')], ['actions', t('Actions', 'Actions'), true]].forEach(function (extra) {
        var th = el('th', 'gl-extra gl-c-' + extra[0]);
        if (extra[2]) th.append(el('span', 'gl-visually-hidden', extra[1]));
        else th.textContent = extra[1];
        headRow.append(th);
      });
    }

    // ---- One row of the compact list: image line, web UI, state and actions cells.
    function decorate(item) {
      var row = item.row;
      if (!canCompact || row.dataset.glDocker || !rowMatches(row)) return;
      row.dataset.glDocker = '1';
      row.classList.add('gl-ct');
      Array.prototype.forEach.call(row.children, function (cell, index) { cell.classList.add('gl-c-' + COLUMNS[index]); });
      var name = item.name;

      var inner = item.cell.querySelector('.inner');
      var image = imageLine(row);
      if (inner && image) {
        var line = el('span', 'gl-ct-image', image);
        line.title = image;
        inner.append(line);
      }
      // Update links and words in the version column may end in "…"; the whole text is the tooltip.
      row.querySelectorAll('td.updatecolumn a.exec > span, td.updatecolumn > span, td.updatecolumn > div:not(.advanced) > span').forEach(function (node) {
        if (!node.title) node.title = node.textContent.trim();
      });
      var cpu = row.querySelector('[class^="cpu-"]');
      var mem = row.querySelector('[class^="mem-"]');
      if (cpu) cpu.setAttribute('data-gl-label', 'CPU');
      if (mem) mem.setAttribute('data-gl-label', t('Memory', 'Mémoire'));

      // Web UI: Unraid fills in the real address only while the container runs; a stopped one
      // still has placeholders such as [IP] and [PORT:8080] in it.
      var webui = item.args[7] || '';
      var webuiCell = el('td', 'gl-extra gl-c-webui');
      if (item.running && WEBUI.test(webui)) {
        var link = G.webuiOpener(el('a', 'gl-webui'), webui);
        link.title = t('Open ', 'Ouvrir ') + webui;
        link.setAttribute('aria-label', t('Open the web interface of ', "Ouvrir l'interface web de ") + name);
        link.append(el('i', 'fa fa-external-link'));
        webuiCell.append(link);
      } else {
        var none = el('span', 'gl-webui-none', '—');
        none.setAttribute('aria-hidden', 'true');
        webuiCell.append(none);
      }

      var stateNode = item.cell.querySelector('.inner > .state');
      var stateText = stateNode && stateNode.firstChild ? stateNode.firstChild.textContent.trim() : '';
      var statusCell = el('td', 'gl-extra gl-c-status');
      statusCell.append(el('span', 'gl-pill' + (item.running ? ' gl-tone-success' : item.paused ? ' gl-tone-warn' : ''),
        stateText || (item.running ? t('Running', 'Démarré') : item.paused ? t('Paused', 'En pause') : t('Stopped', 'Arrêté'))));

      var actions = el('div', 'gl-row-actions');
      var control = function (action) {
        return function () {
          if (typeof window.eventControl === 'function' && item.id) window.eventControl({ action: action, container: item.id }, 'loadlist');
        };
      };
      actions.append(G.iconButton('navicon', t('Logs of ', 'Journaux de ') + name, function () {
        if (typeof window.openTerminal === 'function') window.openTerminal('docker', name, '.log');
      }));
      if (item.paused) {
        actions.append(G.iconButton('play', t('Resume ', 'Reprendre ') + name, control('resume'), 'gl-primary'));
      } else if (item.running) {
        actions.append(G.iconButton('refresh', t('Restart ', 'Redémarrer ') + name, control('restart')));
        actions.append(G.iconButton('stop', t('Stop ', 'Arrêter ') + name, control('stop'), 'gl-danger'));
      } else {
        actions.append(G.iconButton('play', t('Start ', 'Démarrer ') + name, control('start'), 'gl-primary'));
      }
      if (state.groups) actions.append(state.groups.rowButton(name));
      // Unraid's full menu (console, edit, remove, links...) opens from the container's icon;
      // the click is passed on next to this button.
      actions.append(G.iconButton('ellipsis-h', t('More actions for ', "Plus d'actions pour ") + name, function (event) {
        event.stopPropagation();
        if (item.trigger && item.trigger.isConnected) G.openMenuFrom(item.trigger, event.currentTarget);
      }));
      var actionsCell = el('td', 'gl-extra gl-c-actions');
      actionsCell.append(actions);
      row.append(webuiCell, statusCell, actionsCell);
    }

    // Unraid writes a container's CPU as "0%" or "1.5%" every few seconds; it is written with
    // two decimals, in the decimal mark of Display Settings, like the groups' totals.
    function cpuText(value) {
      return value.toFixed(2).replace('.', decimalMark) + '%';
    }

    function formatCpu(items) {
      items.forEach(function (item) {
        var node = item.row.querySelector('[class^="cpu-"]');
        if (!node) return;
        var text = node.textContent.trim();
        if (!/^[\d.,]+%$/.test(text)) return;
        if (text.indexOf(',') >= 0) decimalMark = ',';
        setText(node, cpuText(parseFloat(text.replace(',', '.')) || 0));
      });
    }

    // ---- Toolbar: filters, search, detail level, list view.
    var toolbar = el('div', 'gl-toolbar gl-docker-toolbar');
    var filters = el('div', 'gl-segment gl-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', t('Show containers', 'Afficher les conteneurs'));
    var counts = {};
    [['all', t('All', 'Tous')], ['running', t('Running', 'Démarrés')], ['stopped', t('Stopped', 'Arrêtés')], ['updates', t('Updates', 'Mises à jour')]].forEach(function (filter) {
      var button = el('button', 'gl-seg', filter[1]);
      button.type = 'button';
      button.dataset.filter = filter[0];
      counts[filter[0]] = el('span', 'gl-seg-count', '0');
      button.append(counts[filter[0]]);
      button.addEventListener('click', function () {
        state.filter = filter[0];
        writeStorage(FILTER_KEY, filter[0]);
        render();
      });
      filters.append(button);
    });

    var search = el('input', 'gl-search');
    search.type = 'search';
    search.placeholder = t('Search containers', 'Rechercher un conteneur');
    search.setAttribute('aria-label', search.placeholder);
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.addEventListener('input', render);
    search.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && search.value) {
        search.value = '';
        render();
      }
    });

    var tools = el('div', 'gl-tools');
    tools.append(search);

    // Unraid's Basic / Advanced switch: the original stays in the page (hidden) and is clicked
    // for real, so Unraid's own script does the switching and remembers the choice.
    var nativeToggle = document.querySelector('.ToggleViewMode input.advancedview');
    var nativeSwitch = nativeToggle && nativeToggle.parentElement.querySelector('.switch-button-background');
    var detailButtons = [];
    if (nativeToggle && nativeSwitch) {
      var detail = el('div', 'gl-segment');
      detail.setAttribute('role', 'group');
      detail.setAttribute('aria-label', t('Detail level', 'Niveau de détail'));
      detailButtons = [t('Basic', 'Basique'), t('Advanced', 'Avancée')].map(function (label, index) {
        var button = el('button', 'gl-seg', label);
        button.type = 'button';
        button.addEventListener('click', function () {
          if (nativeToggle.checked !== Boolean(index)) nativeSwitch.click();
          render();
        });
        detail.append(button);
        return button;
      });
      tools.append(detail);
      nativeToggle.addEventListener('change', function () { setTimeout(render); });
    }

    var viewButtons = [];
    if (canCompact) {
      var view = el('div', 'gl-segment');
      view.setAttribute('role', 'group');
      view.setAttribute('aria-label', t('List view', 'Affichage de la liste'));
      viewButtons = [[true, 'th-list', t('Compact', 'Compacte')], [false, 'table', t('All columns', 'Toutes les colonnes')]].map(function (option) {
        var button = el('button', 'gl-seg');
        button.type = 'button';
        var icon = el('i', 'fa fa-' + option[1]);
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon, el('span', 'gl-seg-label', option[2]));
        button.title = option[2];
        button.setAttribute('aria-label', option[2]);
        button.addEventListener('click', function () {
          state.compact = option[0];
          writeStorage(VIEW_KEY, state.compact ? 'compact' : 'full');
          render();
        });
        view.append(button);
        return button;
      });
      tools.append(view);
    }

    if (fv) {
      filters.hidden = true;
      search.hidden = true;
    }
    toolbar.append(filters, tools);
    if (detailButtons.length) nativeToggle.closest('.ToggleViewMode').classList.add('gl-native-hidden');

    var empty = el('p', 'gl-docker-empty', t('No container matches.', 'Aucun conteneur ne correspond.'));
    empty.hidden = true;
    empty.setAttribute('role', 'status');

    // ---- Everything that follows Unraid's rows; runs after every change of the list.
    var items = [];
    function render() {
      if (list.glSorting) return;
      items = Array.prototype.map.call(list.querySelectorAll(':scope > tr > td.ct-name:not(.folder-name)'), function (cell) { return describe(cell.parentElement); });
      formatCpu(items);
      items.forEach(function (item) {
        var nameNode = item.cell.querySelector('.appname');
        if (nameNode && nameNode.title !== item.name) nameNode.title = item.name;
        toggleClass(item.row, 'gl-has-update', item.update);
        if (!fv) decorate(item);
        item.text = item.row.textContent.toLowerCase();
      });
      if (state.groups) state.groups.layout(items);

      toggleClass(table, 'gl-compact', state.compact);
      toggleClass(table, 'gl-advanced', Boolean(nativeToggle && nativeToggle.checked));
      toggleClass(anchor, 'gl-compact-wrap', state.compact);
      detailButtons.forEach(function (button, index) {
        button.setAttribute('aria-pressed', String(Boolean(nativeToggle.checked) === Boolean(index)));
      });
      viewButtons.forEach(function (button, index) {
        button.setAttribute('aria-pressed', String(state.compact === (index === 0)));
      });

      var running = items.filter(function (item) { return item.running; }).length;
      var paused = items.filter(function (item) { return item.paused; }).length;
      var stopped = items.filter(function (item) { return item.stopped; }).length;
      var updates = items.filter(function (item) { return item.update; }).length;
      if (items.length || state.ready) {
        var strip = G.summaryStrip('gl-docker-summary', t('Docker summary', 'Résumé Docker'), [
          { label: t('Containers', 'Conteneurs'), value: items.length, detail: t('installed', 'installés') },
          { label: t('Running', 'Démarrés'), value: running + paused, detail: paused ? paused + ' ' + t('paused', 'en pause') : t('started', 'en marche'), tone: running + paused ? 'success' : '' },
          { label: t('Stopped', 'Arrêtés'), value: stopped, detail: t('not running', "à l'arrêt") },
          { label: t('Updates', 'Mises à jour'), value: updates, detail: updates ? t('ready to apply', 'à appliquer') : t('all up to date', 'tout est à jour'), tone: updates ? 'warn' : '' }
        ]);
        if (!strip.isConnected) anchor.before(strip);
        if (!toolbar.isConnected) anchor.before(toolbar);
        if (!empty.isConnected) anchor.after(empty);
      }

      setText(counts.all, String(items.length));
      setText(counts.running, String(running + paused));
      setText(counts.stopped, String(stopped));
      setText(counts.updates, String(updates));
      filters.querySelectorAll('.gl-seg').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
      });
      if (fv) return;

      var query = search.value.trim().toLowerCase();
      var shown = 0;
      items.forEach(function (item) {
        var match = state.filter === 'all'
          || (state.filter === 'running' && !item.stopped)
          || (state.filter === 'stopped' && item.stopped)
          || (state.filter === 'updates' && item.update);
        item.visible = match && (!query || item.text.indexOf(query) >= 0);
        if (item.visible) shown++;
        toggleClass(item.row, 'gl-filtered-out', !item.visible || item.collapsed);
      });
      if (state.groups) state.groups.filter(state.filter !== 'all' || query !== '');
      empty.hidden = !items.length || shown > 0;
    }

    // ---- Loading line under the table header while Unraid asks Docker for the list; a longer
    // wait gets a message saying so. The empty placeholder row is hidden meanwhile; the list is
    // shown again as soon as rows arrive, after 2 s by CSS, and after 2.5 s by script.
    var loading = el('div', 'gl-docker-loading');
    loading.setAttribute('role', 'status');
    var loadingText = el('span', 'gl-docker-loading-text', t('Loading containers…', 'Chargement des conteneurs…'));
    var spinner = el('span', 'gl-loader');
    spinner.setAttribute('aria-hidden', 'true');
    loading.append(spinner, loadingText);
    var timers = [
      [3000, t('Still loading. Docker is taking a moment to list the containers.', 'Toujours en cours. Docker prend un moment pour lister les conteneurs.')],
      [10000, t('Docker has not answered yet. The service may still be starting, or a container is busy.', "Docker n'a pas encore répondu. Le service démarre peut-être encore, ou un conteneur est occupé.")]
    ].map(function (step) {
      return setTimeout(function () { setText(loadingText, step[1]); }, step[0]);
    });
    function reveal() {
      list.classList.remove('gl-pending');
    }
    function markReady() {
      if (state.ready || !(list.querySelector('td.ct-name') || list.textContent.trim())) return;
      state.ready = true;
      timers.forEach(clearTimeout);
      loading.remove();
      reveal();
      document.body.classList.remove('gl-docker-loading-on');
      render();
    }
    if (!list.querySelector('td.ct-name') && !list.textContent.trim()) {
      list.classList.add('gl-pending');
      table.after(loading);
      // Unraid's own spinner would cover it after half a second.
      document.body.classList.add('gl-docker-loading-on');
      setTimeout(reveal, 2500);
    }

    // Unraid's rows are decorated (and grouped) as soon as they are inserted, before the browser
    // paints them; render() only writes what changed, so its own changes settle at once.
    new MutationObserver(function () {
      render();
      markReady();
    }).observe(list, { childList: true, subtree: true });

    // Application groups (scripts/gl-groups.js), when that file is there and FolderView is not.
    if (!fv) {
      var attach = function (api) {
        if (state.groups || !api || typeof api.dockerList !== 'function') return;
        var adapter = api.dockerList({ table: table, list: list, toolbar: tools, render: render });
        if (!adapter) return;
        state.groups = adapter;
        // Rows decorated before the groups came get their group button now.
        list.querySelectorAll('tr.gl-ct .gl-row-actions').forEach(function (actions) {
          var row = actions.closest('tr');
          var nameNode = row.querySelector('td.ct-name .appname');
          var more = actions.lastElementChild;
          if (nameNode && more && !actions.querySelector('.gl-group-button')) actions.insertBefore(state.groups.rowButton(nameNode.textContent.trim()), more);
        });
        render();
      };
      if (G.groups) attach(G.groups);
      else (G.groupsWaiting = G.groupsWaiting || []).push(attach);
    }

    render();
    markReady();
  });
})();
