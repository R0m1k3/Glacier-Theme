/*
 * Glacier Theme: Docker container editor (Add / Edit container, and installs from Apps).
 *
 * Ported from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Chris (Tunefish), MIT License; see NOTICE.md.
 *
 * - Every host port field is checked while typing, with a tick or a cross on its right and the
 *   reason under it: a number from 1 to 65535 (or a range such as 8000-8010); not twice in this
 *   form for the same protocol; not used by another container on the server's address (from
 *   Unraid's own list on the page, window.Allocations); not taken by a program on the server
 *   (include/ports.php). A container with its own address (macvlan / ipvlan network) can reuse
 *   ports, so only the first two checks apply there; the port a container already has when it
 *   is edited is accepted as well. The same check runs in Unraid's "Add / Edit Configuration"
 *   dialog. Nothing is ever blocked: the marks only inform.
 * - "Show docker allocations": Unraid's plain list becomes a filterable view with one row per
 *   container: network badge, address and its ports as chips (runs of ports as one chip). Ports
 *   that clash with this form's ports are marked.
 */
(function () {
  'use strict';

  var G = window.Glacier;
  if (!G) return;
  var t = G.t;
  var el = G.el;
  var RANGE = /^(\d+)(?:-(\d+))?$/;

  function parseRange(text) {
    var parts = RANGE.exec(String(text).trim());
    return parts ? [Number(parts[1]), Number(parts[2] || parts[1])] : null;
  }

  function quote(text) {
    return t('"' + text + '"', '« ' + text + ' »');
  }

  // Unraid's list: [{Name, Port: "<span>bridge</span><span>192.168.1.10</span><span>80, 443</span>"}]
  // The HTML is parsed in an inert document (nothing in it runs or loads).
  function readAllocations() {
    if (!Array.isArray(window.Allocations)) return [];
    var parser = new DOMParser();
    return window.Allocations.map(function (entry) {
      var spans = parser.parseFromString(String((entry && entry.Port) || ''), 'text/html').querySelectorAll('span');
      var parts = Array.prototype.map.call(spans, function (span) { return span.textContent.trim(); });
      return {
        name: String((entry && entry.Name) || ''),
        network: parts[0] || '',
        ip: parts[1] || '',
        ports: (parts[2] || '').split(/\s*,\s*/).map(Number).filter(function (port) { return port > 0 && port <= 65535; })
      };
    }).filter(function (entry) { return entry.name; });
  }

  function portRanges(ports) {
    var sorted = ports.filter(function (port, index) { return ports.indexOf(port) === index; }).sort(function (a, b) { return a - b; });
    var ranges = [];
    sorted.forEach(function (port) {
      var last = ranges[ranges.length - 1];
      if (last && port === last[1] + 1) last[1] = port;
      else ranges.push([port, port]);
    });
    return ranges;
  }

  G.feature('docker-ports', function () {
    var nameField = document.querySelector('input[name="contName"]');
    var location = document.getElementById('configLocation');
    if (!nameField || !location || nameField.dataset.glPorts) return;
    nameField.dataset.glPorts = '1';
    var originalName = nameField.value.trim().toLowerCase();
    var network = document.querySelector('select[name="contNetwork"]');
    var listening = [];
    var allocations = readAllocations();

    // Network driver of a network name, from Unraid's own map on the page (drivers['br0']='macvlan').
    function driverOf(name) {
      var drivers = window.drivers && typeof window.drivers === 'object' ? window.drivers : {};
      if (typeof drivers[name] === 'string') return drivers[name];
      return name === 'bridge' || name === 'host' ? name : '';
    }

    // Addresses that are the server's own: the one in the address bar and those Unraid lists
    // for containers on bridge or host networks.
    var hostAddresses = {};
    hostAddresses[window.location.hostname] = true;
    allocations.forEach(function (entry) {
      var driver = driverOf(entry.network);
      if ((driver === 'bridge' || driver === 'host') && entry.ip && entry.ip !== '0.0.0.0') hostAddresses[entry.ip] = true;
    });

    // 'host' (ports on the server's address), 'own' (macvlan / ipvlan: its own address) or
    // 'none' (no network, or another container's).
    function addressMode() {
      var mode = network ? network.value : 'bridge';
      if (mode === 'none' || mode === 'container' || /^container:/.test(mode)) return 'none';
      var driver = driverOf(mode);
      if (driver === 'macvlan' || driver === 'ipvlan') return 'own';
      if (driver === 'null') return 'none';
      return 'host';
    }

    function portRows() {
      return Array.prototype.filter.call(document.querySelectorAll('#configLocation input[name="confType[]"], #configLocationAdvanced input[name="confType[]"]'), function (type) {
        return type.value === 'Port';
      }).map(function (type) {
        var row = type.closest('[id^="ConfigNum"]');
        var field = row && row.querySelector('input[name="confValue[]"]');
        if (!field) return null;
        var value = function (name) {
          var node = row.querySelector('input[name="' + name + '"]');
          return node ? node.value : '';
        };
        return { row: row, field: field, name: value('confName[]'), proto: (value('confMode[]') || 'tcp').toLowerCase() === 'udp' ? 'udp' : 'tcp', required: value('confRequired[]') === 'true' };
      }).filter(Boolean);
    }

    // [ok, message]; ok is null for an empty optional field (no mark).
    function check(item, rows) {
      var text = item.field.value.trim();
      if (!text) return item.required ? [false, t('A port is required here.', 'Un port est requis ici.')] : [null, ''];
      var range = parseRange(text);
      if (!range) return [false, t('Use a port number (1 to 65535) or a range such as 8000-8010.', 'Indiquez un port (1 à 65535) ou une plage comme 8000-8010.')];
      var first = range[0];
      var last = range[1];
      if (first < 1 || first > 65535 || last > 65535) return [false, t('Ports go from 1 to 65535.', 'Les ports vont de 1 à 65535.')];
      if (last < first) return [false, t('A range starts with the lower port.', 'Une plage commence par le plus petit port.')];
      var inRange = function (port) { return port >= first && port <= last; };
      var twin = rows.filter(function (other) {
        var span = other !== item && other.proto === item.proto && parseRange(other.field.value);
        return span && span[0] <= last && span[1] >= first;
      })[0];
      if (twin) {
        var label = twin.name || t('another port', 'un autre port');
        return [false, t('Also used for ' + quote(label) + ' in this container (' + item.proto.toUpperCase() + ').', 'Déjà utilisé pour ' + quote(label) + ' dans ce conteneur (' + item.proto.toUpperCase() + ').')];
      }
      var mode = addressMode();
      if (mode === 'own') return [true, t('Valid. This container has its own address, so the port cannot clash.', 'Valide. Ce conteneur a sa propre adresse, le port ne peut pas entrer en conflit.')];
      if (mode === 'none') return [true, t('Valid.', 'Valide.')];
      var own = item.field.dataset.glOriginal === text;
      var current = nameField.value.trim().toLowerCase();
      var user = allocations.filter(function (entry) {
        var name = entry.name.toLowerCase();
        return name !== current && name !== originalName && hostAddresses[entry.ip] && entry.ports.some(inRange);
      })[0];
      if (user) {
        var taken = user.ports.filter(inRange)[0];
        return [false, t('Port ' + taken + ' is already used by the container ' + quote(user.name) + '.', 'Le port ' + taken + ' est déjà utilisé par le conteneur ' + quote(user.name) + '.')];
      }
      var program = !own && listening.filter(function (entry) { return inRange(entry.port) && entry.proto === item.proto; })[0];
      if (program) {
        return [false, t('Port ' + program.port + ' is in use on the server' + (program.process ? ' by ' + program.process : '') + '.',
          'Le port ' + program.port + ' est utilisé sur le serveur' + (program.process ? ' par ' + program.process : '') + '.')];
      }
      return [true, first === last
        ? t('Port ' + first + ' is free.', 'Le port ' + first + ' est libre.')
        : t('Ports ' + first + ' to ' + last + ' are free.', 'Les ports ' + first + ' à ' + last + ' sont libres.')];
    }

    var counter = 0;
    function decorate(item) {
      var field = item.field;
      if (field.dataset.glPortReady) return;
      field.dataset.glPortReady = '1';
      field.dataset.glOriginal = field.value.trim();
      var wrap = el('span', 'gl-port-field');
      field.before(wrap);
      wrap.append(field);
      var mark = el('span', 'gl-port-mark');
      mark.setAttribute('aria-hidden', 'true');
      wrap.append(mark);
      var message = el('span', 'gl-port-message');
      message.id = 'gl-port-message-' + (++counter);
      message.setAttribute('aria-live', 'polite');
      message.hidden = true;
      field.setAttribute('aria-describedby', message.id);
      var line = wrap.closest('.flex-row') || wrap.parentElement;
      line.after(message);
      field.addEventListener('input', run);
    }

    function run() {
      var rows = portRows();
      rows.forEach(decorate);
      rows.forEach(function (item) {
        var result = check(item, rows);
        var wrap = item.field.parentElement;
        var message = document.getElementById(item.field.getAttribute('aria-describedby'));
        wrap.classList.toggle('gl-port-ok', result[0] === true);
        wrap.classList.toggle('gl-port-bad', result[0] === false);
        item.field.setAttribute('aria-invalid', result[0] === false ? 'true' : 'false');
        if (wrap.title !== result[1]) wrap.title = result[1];
        if (message) {
          var text = result[0] === false ? result[1] : '';
          if (message.textContent !== text) message.textContent = text;
          message.hidden = result[0] !== false;
        }
      });
      renderAllocations();
    }

    // The same check for the host port in Unraid's "Add / Edit Configuration" dialog.
    document.addEventListener('focusin', function (event) {
      var field = event.target;
      if (field.matches && field.matches('.ui-dialog input[name="Value"]') && field.dataset.glStart === undefined) field.dataset.glStart = field.value.trim();
    });
    document.addEventListener('input', function (event) {
      var field = event.target;
      if (!field.matches || !field.matches('.ui-dialog input[name="Value"]')) return;
      var dialog = field.closest('.ui-dialog');
      var type = dialog.querySelector('select[name="Type"]');
      var wrap = field.closest('.gl-port-field');
      if (!type || type.value !== 'Port') {
        if (wrap) wrap.classList.remove('gl-port-ok', 'gl-port-bad');
        return;
      }
      if (!wrap) {
        wrap = el('span', 'gl-port-field');
        field.before(wrap);
        var mark = el('span', 'gl-port-mark');
        mark.setAttribute('aria-hidden', 'true');
        wrap.append(field, mark);
        field.focus();
      }
      var mode = dialog.querySelector('select[name="Mode"]');
      // When editing, the row being edited is not a duplicate of itself: Unraid's edit dialog
      // starts with that row's name and value (the value is noted when the field gets focus).
      var nameInput = dialog.querySelector('input[name="Name"]');
      var editedName = nameInput ? nameInput.value.trim() : '';
      var start = field.dataset.glStart || '';
      var item = { field: field, name: '', proto: mode && mode.value === 'udp' ? 'udp' : 'tcp', required: true };
      var result = check(item, portRows().filter(function (row) {
        return !(editedName && row.name === editedName && row.field.value.trim() === start);
      }));
      wrap.classList.toggle('gl-port-ok', result[0] === true);
      wrap.classList.toggle('gl-port-bad', result[0] === false);
      field.setAttribute('aria-invalid', result[0] === false ? 'true' : 'false');
      wrap.title = result[1];
    });

    // ---- "Show docker allocations" as a filterable list.
    var box = document.getElementById('dockerAllocations');
    var filterText = '';
    function renderAllocations() {
      if (!box || !allocations.length) return;
      var view = box.querySelector(':scope > .gl-alloc');
      if (!view) {
        view = el('div', 'gl-alloc');
        var head = el('div', 'gl-alloc-head');
        var search = el('input', 'gl-search gl-alloc-search');
        search.type = 'search';
        search.placeholder = t('Filter by container, network, address or port…', 'Filtrer par conteneur, réseau, adresse ou port…');
        search.setAttribute('aria-label', search.placeholder);
        search.value = filterText;
        search.addEventListener('input', function () {
          filterText = search.value;
          renderAllocations();
        });
        var count = el('span', 'gl-alloc-count');
        count.setAttribute('aria-live', 'polite');
        head.append(search, count);
        var columns = el('div', 'gl-alloc-row gl-alloc-columns');
        columns.setAttribute('aria-hidden', 'true');
        [t('Container', 'Conteneur'), t('Network', 'Réseau'), t('Address', 'Adresse'), t('Ports', 'Ports')].forEach(function (label) { columns.append(el('span', null, label)); });
        view.append(head, columns, el('div', 'gl-alloc-list'));
        box.prepend(view);
      }
      box.querySelectorAll(':scope > dl:not([hidden])').forEach(function (list) { list.hidden = true; });

      var current = nameField.value.trim().toLowerCase();
      var clashCheck = addressMode() === 'host';
      var formRanges = portRows().map(function (item) { return parseRange(item.field.value); }).filter(Boolean);
      var words = filterText.trim().toLowerCase().split(/\s+/).filter(Boolean);
      var list = view.querySelector('.gl-alloc-list');
      var rows = [];
      allocations.forEach(function (entry) {
        var ranges = portRanges(entry.ports);
        var portText = ranges.map(function (range) { return range[0] === range[1] ? String(range[0]) : range[0] + '-' + range[1]; }).join(' ');
        var haystack = (entry.name + ' ' + entry.network + ' ' + entry.ip + ' ' + portText).toLowerCase();
        var match = words.every(function (word) {
          if (/^\d+$/.test(word) && ranges.some(function (range) { return Number(word) >= range[0] && Number(word) <= range[1]; })) return true;
          return haystack.indexOf(word) >= 0;
        });
        if (!match) return;
        var self = entry.name.toLowerCase() === current || entry.name.toLowerCase() === originalName;
        var row = el('div', 'gl-alloc-row' + (self ? ' gl-alloc-self' : ''));
        var name = el('span', 'gl-alloc-name');
        name.append(el('span', 'gl-alloc-name-text', entry.name));
        if (self) name.append(el('span', 'gl-pill gl-tone-accent', t('This container', 'Ce conteneur')));
        var driver = driverOf(entry.network);
        var kind = entry.network === 'bridge' ? 'bridge' : entry.network === 'host' ? 'host' : driver === 'macvlan' || driver === 'ipvlan' ? 'own' : 'custom';
        var net = el('span', 'gl-alloc-net');
        net.append(el('span', 'gl-pill gl-alloc-' + kind, entry.network || '?'));
        var ports = el('span', 'gl-alloc-ports');
        if (!ranges.length) ports.append(el('span', 'gl-alloc-none', entry.network === 'host' ? t('Host network: uses the ports it opens', "Réseau hôte : utilise les ports qu'il ouvre") : t('No published ports', 'Aucun port publié')));
        ranges.forEach(function (range) {
          var chip = el('span', 'gl-alloc-port', range[0] === range[1] ? String(range[0]) : range[0] + '–' + range[1]);
          if (range[0] !== range[1]) chip.title = (range[1] - range[0] + 1) + ' ports';
          var clash = clashCheck && !self && hostAddresses[entry.ip] && formRanges.some(function (own) { return own[0] <= range[1] && own[1] >= range[0]; });
          if (clash) {
            chip.classList.add('gl-alloc-clash');
            chip.title = t("Also used in this container's settings", 'Aussi utilisé dans les réglages de ce conteneur');
          }
          ports.append(chip);
        });
        row.append(name, net, el('span', 'gl-alloc-ip', entry.ip || '—'), ports);
        rows.push(row);
      });
      if (!rows.length) rows.push(el('p', 'gl-alloc-empty', t('No container matches this filter.', 'Aucun conteneur ne correspond à ce filtre.')));
      list.replaceChildren.apply(list, rows);
      var shown = rows[0].classList.contains('gl-alloc-empty') ? 0 : rows.length;
      var countText = (words.length ? shown + t(' of ', ' sur ') : '') + allocations.length + ' ' + t(allocations.length === 1 ? 'container' : 'containers', allocations.length === 1 ? 'conteneur' : 'conteneurs');
      var countNode = view.querySelector('.gl-alloc-count');
      if (countNode.textContent !== countText) countNode.textContent = countText;
    }
    if (box) {
      new MutationObserver(function () {
        // Unraid fills the box (again) with its own list; the view is put back on top.
        if (!box.querySelector(':scope > .gl-alloc') || box.querySelector(':scope > dl:not([hidden])')) renderAllocations();
      }).observe(box, { childList: true });
    }

    if (network) network.addEventListener('change', run);
    nameField.addEventListener('input', run);
    // Ports added or removed through the dialog, and rows Unraid rebuilds (when the template or
    // network changes); only the rows' list is watched, not the marks this script adds.
    var watchRows = function (target) {
      if (target) new MutationObserver(G.debounce(run, 150)).observe(target, { childList: true });
    };
    watchRows(location);
    watchRows(document.getElementById('configLocationAdvanced'));
    run();
    G.getJSON('/include/ports.php').then(function (data) {
      listening = Array.isArray(data && data.listening) ? data.listening.filter(function (entry) {
        return entry && typeof entry.port === 'number' && (entry.proto === 'tcp' || entry.proto === 'udp');
      }) : [];
      run();
    }).catch(function (error) {
      if (window.console) console.warn('Glacier Theme, port check: the server ports are not available.', error && error.message);
    });
  });
})();
