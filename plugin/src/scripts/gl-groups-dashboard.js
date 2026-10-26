/*
 * Glacier Theme: Dashboard, Docker and Virtual Machines tiles. The application groups
 * (scripts/gl-groups.js) as rows that open and close a panel with their members: the groups in
 * their saved order, then "Ungrouped" (only while a group has members); the members in Unraid's
 * order. Each group row shows its members' icons, which open their menus (or the container
 * dialog). Open and closed is shared with the Docker and VMs tabs. Off while FolderView is
 * installed.
 *
 * Ported from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Chris (Tunefish), MIT License; see NOTICE.md.
 *
 * Unraid's chips are moved (with their ids and handlers), never copied; Unraid replaces them on
 * every refresh, and they are arranged again before the next paint.
 */
(function () {
  'use strict';

  var G = window.Glacier;
  if (!G) return;
  var t = G.t;
  var el = G.el;

  // A chip's name: the container's name element, or the VM's name text.
  function chipName(chip) {
    var inner = chip.querySelector(':scope > .inner');
    if (!inner) return '';
    var named = inner.querySelector(':scope > span');
    if (named && chip.classList.contains('apps')) return named.textContent.trim();
    return inner.firstChild ? inner.firstChild.textContent.trim() : '';
  }

  function chipApps(chips, groups) {
    return chips.map(function (chip) {
      var hand = chip.querySelector(':scope > span.hand');
      var image = hand && hand.querySelector('img');
      var args = hand ? G.contextArguments(hand) : [];
      var docker = hand && /^addDockerContainerContext\(/.test(hand.getAttribute('onclick') || '');
      return {
        name: chipName(chip),
        src: image && image.src,
        state: chip.classList.contains('paused') ? 'paused' : chip.classList.contains('started') ? 'running' : 'stopped',
        update: Boolean(docker && args.length === 16 && args[5] === '1'),
        target: hand
      };
    });
  }

  function tile(view, type, groups) {
    var kind = type === 'vm' ? 'vms' : 'apps';
    var collapsed = groups.collapsedState(type === 'vm' ? 'glacier-vm-collapsed' : 'glacier-docker-collapsed');
    var store = groups.store(type, { changed: function () { arrange(); } });
    var parts = new Map();

    function part(name, key) {
      if (parts.has(key)) return parts.get(key);
      var chip = el('span', 'outer solid ' + kind + ' gl-group-chip');
      chip.setAttribute('role', 'button');
      chip.tabIndex = 0;
      var icon = el('span', 'gl-group-chip-icon');
      icon.setAttribute('aria-hidden', 'true');
      var glyph = el('i', 'fa fa-folder-open');
      icon.append(glyph);
      var text = el('span', 'gl-group-chip-text');
      var label = el('span', 'gl-group-chip-name', name);
      var counter = el('span', 'gl-group-chip-count');
      text.append(label, counter);
      var apps = el('span', 'gl-group-apps');
      var caret = el('i', 'fa fa-chevron-down gl-group-chip-caret');
      caret.setAttribute('aria-hidden', 'true');
      chip.append(icon, text, apps, caret);
      var panel = el('div', 'gl-group-panel');
      panel.id = 'gl-group-panel-' + type + '-' + parts.size;
      chip.setAttribute('aria-controls', panel.id);
      var toggle = function () {
        collapsed.toggle(key);
        arrange();
      };
      chip.addEventListener('click', function (event) {
        if (event.target.closest('.gl-app-icon')) return;
        toggle();
      });
      chip.addEventListener('keydown', function (event) {
        if (event.target === chip && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          toggle();
        }
      });
      var entry = { chip: chip, panel: panel, name: label, glyph: glyph, count: counter, apps: apps };
      parts.set(key, entry);
      return entry;
    }

    function arrange() {
      var first = view.querySelector('td > span.outer.' + kind + ':not(.gl-group-chip), td > .gl-group-panel');
      if (!first) return;
      var cell = first.parentElement;
      var chips = Array.prototype.slice.call(cell.querySelectorAll(':scope > span.outer.' + kind + ':not(.gl-group-chip), :scope > .gl-group-panel > span.outer.' + kind));
      var placed = new Set();
      var sections = store.groups.map(function (group) {
        var members = chips.filter(function (chip) { return !placed.has(chip) && group.containers.indexOf(chipName(chip)) >= 0; });
        members.forEach(function (chip) { placed.add(chip); });
        return { name: group.name, key: 'g:' + group.name, members: members };
      });
      if (sections.some(function (section) { return section.members.length; })) {
        sections.push({ name: t('Ungrouped', 'Sans groupe'), key: groups.UNGROUPED, members: chips.filter(function (chip) { return !placed.has(chip); }) });
      } else {
        sections = [];
        placed.clear();
      }
      var keys = {};
      sections.forEach(function (section) { if (section.members.length) keys[section.key] = true; });
      parts.forEach(function (entry, key) {
        if (keys[key]) return;
        entry.chip.remove();
        // Members still in a panel that goes away are put back in the cell first.
        Array.prototype.slice.call(entry.panel.children).forEach(function (chip) { cell.append(chip); });
        entry.panel.remove();
        parts.delete(key);
      });
      var wanted = [];
      sections.forEach(function (section) {
        if (!section.members.length) return;
        var entry = part(section.name, section.key);
        var members = section.members;
        members.forEach(function (chip) { placed.add(chip); });
        if (entry.panel.children.length !== members.length || members.some(function (chip, index) { return entry.panel.children[index] !== chip; })) {
          entry.panel.replaceChildren.apply(entry.panel, members);
        }
        var isCollapsed = collapsed.has(section.key);
        var running = members.filter(function (chip) { return chip.classList.contains('started'); }).length;
        var noun = type === 'vm' ? (members.length === 1 ? 'VM' : 'VMs') : t(members.length === 1 ? 'container' : 'containers', members.length === 1 ? 'conteneur' : 'conteneurs');
        var countText = members.length + ' ' + noun + ' · ' + running + ' ' + t('running', running === 1 ? 'démarré' : 'démarrés');
        if (entry.count.textContent !== countText) entry.count.textContent = countText;
        groups.appStrip(entry.apps, chipApps(members), 5);
        var title = section.name + ', ' + countText;
        if (entry.chip.getAttribute('aria-label') !== title) entry.chip.setAttribute('aria-label', title);
        if (entry.chip.getAttribute('aria-expanded') !== String(!isCollapsed)) entry.chip.setAttribute('aria-expanded', String(!isCollapsed));
        if (entry.chip.classList.contains('gl-collapsed') !== isCollapsed) entry.chip.classList.toggle('gl-collapsed', isCollapsed);
        var glyphClass = 'fa ' + (isCollapsed ? 'fa-folder' : 'fa-folder-open');
        if (entry.glyph.className !== glyphClass) entry.glyph.className = glyphClass;
        entry.panel.hidden = isCollapsed;
        wanted.push(entry.chip, entry.panel);
      });
      chips.forEach(function (chip) { if (!placed.has(chip) && chip.parentElement !== cell) cell.append(chip); });
      var loose = chips.filter(function (chip) { return !placed.has(chip); });
      wanted = wanted.concat(loose);
      wanted.forEach(function (node, index) {
        if (cell.children[index] !== node) cell.insertBefore(node, cell.children[index] || null);
      });
      // Long names end in "…"; the whole name is the tooltip.
      chips.forEach(function (chip) {
        var inner = chip.querySelector(':scope > .inner');
        var name = chipName(chip);
        if (inner && name && inner.title !== name) inner.title = name;
      });
    }

    // Arranged as soon as Unraid inserts its chips, before the browser paints them; arrange()
    // only moves or writes what changed, so its own changes settle at once.
    groups.follow(view, arrange, { childList: true, subtree: true }, 'Dashboard ' + (type === 'vm' ? 'VM' : 'Docker') + ' groups');
    store.load();
    arrange();
  }

  G.feature('dashboard-groups', function () {
    var docker = document.getElementById('docker_view');
    var vms = document.getElementById('vm_view');
    if (!docker && !vms) return;
    var start = function (groups) {
      if (!groups || groups.folderView()) return;
      if (docker && !docker.dataset.glGroups) {
        docker.dataset.glGroups = '1';
        tile(docker, 'docker', groups);
      }
      if (vms && !vms.dataset.glGroups) {
        vms.dataset.glGroups = '1';
        tile(vms, 'vm', groups);
      }
    };
    if (G.groups) start(G.groups);
    else (G.groupsWaiting = G.groupsWaiting || []).push(start);
  });
})();
