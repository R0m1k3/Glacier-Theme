/*
 * Glacier Theme: the VMs tab (VMs > Virtual Machines).
 *
 * Ported from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Chris (Tunefish), MIT License; see NOTICE.md.
 *
 * - An actions column, as on the Docker tab: start, or stop and restart (resume when paused),
 *   the VM's group, and Unraid's full menu (the VM icon's menu, opened next to the button). Start
 *   is not offered while Unraid has start disabled (PCI devices changed, SR-IOV).
 * - A chevron in front of each VM opens its details (disks, interfaces, snapshots), as a click on
 *   its name does in Unraid, which is easy to miss. In the details, a "Create snapshot" button
 *   and Revert / Remove / more buttons on each snapshot.
 * - Application groups (scripts/gl-groups.js), unless FolderView arranges the list.
 *
 * Every button calls Unraid's own functions, with the arguments its menus use. The actions
 * column is only added while the table has the eight columns of 7.3.4.
 */
(function () {
  'use strict';

  var G = window.Glacier;
  if (!G) return;
  var t = G.t;
  var el = G.el;
  var VMAJAX = '/plugins/dynamix.vm.manager/include/VMajax.php';

  function folderView() {
    return window.glacierFolderView === true || Boolean(document.querySelector('script[src*="/folder.view"]'));
  }

  // Follows a list Unraid redraws. If the list keeps changing (more than 100 calls within a
  // second, which a redraw never does), it stops following it rather than hold up the page.
  function follow(target, fn, options, label) {
    var calls = 0;
    var since = Date.now();
    var observer = new MutationObserver(function () {
      var now = Date.now();
      if (now - since > 1000) {
        since = now;
        calls = 0;
      }
      if (++calls > 100) {
        observer.disconnect();
        if (window.console) console.error('Glacier Theme, ' + label + ': the list kept changing; stopped following it.');
        return;
      }
      fn();
    });
    observer.observe(target, options);
    return observer;
  }

  // VMMachines.page (7.3.4): Name (th1), Description (th2), CPUs, Memory, vDisks / vCDs,
  // Graphics, IP Address, Autostart (th3).
  function headMatches(headRow) {
    return Boolean(headRow) && headRow.children.length === 8 && headRow.children[0].classList.contains('th1') && headRow.children[7].classList.contains('th3');
  }

  // A VM's row as data. Its icon's call (VMMachines.php):
  //   addVMContext(name, uuid, template, state, vmrcurl, protocol, log, fstype, console, usage, webui, pcierror)
  function describe(row) {
    var cell = row.querySelector(':scope > td.vm-name');
    if (!cell) return null;
    var trigger = cell.querySelector('span.hand[id^="vm-"]');
    var link = cell.querySelector('.inner > a');
    var args = G.contextArguments(trigger && trigger.getAttribute('onclick') && /^addVMContext\(/.test(trigger.getAttribute('onclick')) ? trigger : null);
    var name = link ? link.textContent.trim() : '';
    if (!name || !trigger) return null;
    return {
      row: row,
      cell: cell,
      trigger: trigger,
      args: args,
      name: name,
      uuid: trigger.id.slice(3),
      state: args[3] || '',
      running: Boolean(cell.querySelector('.inner > i.started')),
      paused: Boolean(cell.querySelector('.inner > i.paused')),
      blocked: args[11] === '1' || args[11] === 'true' || Boolean(cell.querySelector('.inner > i.fa-warning'))
    };
  }

  // A VM's row and the rows under it (its details), up to the next VM or section.
  function rowsOf(item) {
    var rows = [item.row];
    for (var next = item.row.nextElementSibling; next && !next.hasAttribute('parent-id') && !next.classList.contains('gl-group'); next = next.nextElementSibling) rows.push(next);
    return rows;
  }

  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function () { if (typeof window[name] === 'function') window[name].apply(window, args); };
  }

  G.feature('vms', function () {
    var table = document.getElementById('kvm_table');
    var list = document.getElementById('kvm_list');
    if (!table || !list || table.dataset.glVm) return;
    table.dataset.glVm = '1';
    var anchor = table.closest('.TableContainer') || table;
    var headRow = table.querySelector('thead tr');
    var columns = headMatches(headRow);
    var fv = folderView();
    var groups = null;

    if (columns) {
      var th = el('th', 'gl-vm-actions');
      th.append(el('span', 'gl-visually-hidden', t('Actions', 'Actions')));
      headRow.append(th);
    }

    // ---- Actions column
    function decorate(item) {
      if (!columns || item.row.querySelector(':scope > td.gl-vm-actions') || item.row.children.length !== 8) return;
      var name = item.name;
      var dispatch = function (action) {
        return function () {
          if (typeof window.ajaxVMDispatch === 'function') window.ajaxVMDispatch({ action: action, uuid: item.uuid }, 'loadlist');
        };
      };
      var actions = el('div', 'gl-row-actions');
      if (item.paused) {
        actions.append(G.iconButton('play', t('Resume ', 'Reprendre ') + name, dispatch(item.state === 'pmsuspended' ? 'domain-pmwakeup' : 'domain-resume'), 'gl-primary'));
      } else if (item.running) {
        actions.append(G.iconButton('refresh', t('Restart ', 'Redémarrer ') + name, dispatch('domain-restart')));
        actions.append(G.iconButton('stop', t('Stop ', 'Arrêter ') + name, dispatch('domain-stop'), 'gl-danger'));
      } else {
        var start = G.iconButton('play', t('Start ', 'Démarrer ') + name, dispatch('domain-start'), 'gl-primary');
        if (item.blocked) {
          start.disabled = true;
          start.title = t('Start is disabled: PCI devices changed', 'Démarrage désactivé : les périphériques PCI ont changé');
          start.setAttribute('aria-label', start.title + ' (' + name + ')');
        }
        actions.append(start);
      }
      if (groups) actions.append(groups.groups.button(name));
      actions.append(G.iconButton('ellipsis-h', t('More actions for ', "Plus d'actions pour ") + name, function (event) {
        event.stopPropagation();
        if (item.trigger.isConnected) G.openMenuFrom(item.trigger, event.currentTarget);
      }));
      var cell = el('td', 'gl-vm-actions');
      cell.append(actions);
      item.row.append(cell);
      item.row.classList.add('gl-vm');
    }

    // ---- Details: chevron button and snapshot tools
    function details(item) {
      var row = item.row;
      if (row.dataset.glExpand || typeof window.toggle_id !== 'function') return;
      var id = 'name-' + row.getAttribute('parent-id');
      var box = document.getElementById(id);
      if (!box) return;
      row.dataset.glExpand = '1';
      var button = el('button', 'gl-vm-expand');
      button.type = 'button';
      button.setAttribute('aria-controls', id);
      var icon = el('i', 'fa fa-chevron-right');
      icon.setAttribute('aria-hidden', 'true');
      button.append(icon);
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        window.toggle_id(id);
      });
      var outer = item.cell.querySelector(':scope > span.outer');
      if (outer) outer.before(button);
      else item.cell.prepend(button);
      for (var next = box; next && !next.hasAttribute('parent-id') && !next.classList.contains('gl-group'); next = next.nextElementSibling) next.classList.add('gl-vm-details');
      snapshotTools(item, box);
      var sync = function () {
        var open = box.style.display !== 'none';
        button.classList.toggle('gl-open', open);
        row.classList.toggle('gl-vm-open', open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        var label = (open ? t('Hide the details of ', 'Masquer les détails de ') : t('Show disks, interfaces and snapshots of ', 'Afficher disques, interfaces et snapshots de ')) + item.name;
        button.title = label;
        button.setAttribute('aria-label', label);
      };
      new MutationObserver(sync).observe(box, { attributes: true, attributeFilter: ['style'] });
      sync();
    }

    function snapshotTools(item, box) {
      var inner = box.querySelector('table');
      var vm = item.args;
      if (vm.length < 8 || !inner || typeof window.selectsnapshot !== 'function') return;
      var name = vm[0];
      var uuid = vm[1];
      var state = vm[3];
      var fstype = vm[7] || 'QEMU';
      if (uuid !== item.uuid) return;
      var small = function (icon, label, run, extra) {
        var button = el('button', 'gl-snap-button' + (extra ? ' ' + extra : ''));
        button.type = 'button';
        button.title = label;
        button.setAttribute('aria-label', label);
        var glyph = el('i', 'fa fa-' + icon);
        glyph.setAttribute('aria-hidden', 'true');
        button.append(glyph);
        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          run(event);
        });
        return button;
      };
      var heading = Array.prototype.filter.call(inner.querySelectorAll('thead th'), function (cell) { return cell.querySelector('i.fa-clone'); })[0];
      if (!heading) {
        // No snapshots yet: Unraid leaves the section out; it is added with a note.
        var head = el('thead', 'child gl-snap-added');
        var headRow = el('tr');
        heading = el('th');
        heading.colSpan = 6;
        var clone = el('i', 'fa fa-clone');
        clone.setAttribute('aria-hidden', 'true');
        heading.append(clone, ' ', el('b', null, t('Snapshots', 'Snapshots')));
        headRow.append(heading);
        head.append(headRow);
        var body = el('tbody', 'child gl-snap-added');
        var emptyRow = el('tr');
        var emptyCell = el('td', 'gl-snap-empty', t('No snapshots yet.', 'Aucun snapshot pour le moment.'));
        emptyCell.colSpan = 6;
        emptyRow.append(emptyCell);
        body.append(emptyRow);
        inner.append(head, body);
      }
      if (!heading.querySelector('.gl-snap-create')) {
        var create = el('button', 'gl-snap-create');
        create.type = 'button';
        var plus = el('i', 'fa fa-plus');
        plus.setAttribute('aria-hidden', 'true');
        create.append(plus, el('span', null, t('Create snapshot', 'Créer un snapshot')));
        create.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          window.selectsnapshot(uuid, name, '--generate', 'create', false, state, fstype);
        });
        heading.append(create);
      }
      inner.querySelectorAll('span.hand[id^="vmsnap-"][onclick^="addVMSnapContext("]').forEach(function (span) {
        // addVMSnapContext(name, uuid, template, state, snapshotname, method)
        var snap = G.contextArguments(span);
        var cell = span.closest('td');
        if (snap.length !== 6 || snap[1] !== uuid || !cell || cell.querySelector('.gl-snap-actions')) return;
        var snapshot = snap[4];
        var method = snap[5] || 'QEMU';
        var busy = function () {
          var hand = document.getElementById('vm-' + uuid);
          if (hand) hand.querySelectorAll('i').forEach(function (i) { i.classList.remove('fa-play', 'fa-square', 'fa-pause'); i.classList.add('fa-refresh', 'fa-spin'); });
        };
        var actions = el('span', 'gl-snap-actions');
        actions.append(
          small('fast-backward', t('Revert ' + name + ' to snapshot ' + snapshot, 'Restaurer ' + name + ' au snapshot ' + snapshot), function () { window.selectsnapshot(uuid, name, snapshot, 'revert', true, state, method); }),
          small('trash', t('Remove snapshot ' + snapshot, 'Supprimer le snapshot ' + snapshot), function () { busy(); window.selectsnapshot(uuid, name, snapshot, 'remove', true); }, 'gl-snap-danger'),
          // Block commit / pull and the rest stay in Unraid's menu, opened here as well.
          small('ellipsis-h', t('More actions for snapshot ' + snapshot, "Plus d'actions pour le snapshot " + snapshot), function (event) {
            span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: event.clientX, clientY: event.clientY }));
          })
        );
        cell.append(actions);
      });
    }

    // ---- Groups
    var collapsedState = null;
    var headers = new Map();
    function attachGroups(api) {
      if (groups || fv || !api) return;
      collapsedState = api.collapsedState('glacier-vm-collapsed');
      var names = function () {
        return Array.prototype.map.call(list.querySelectorAll(':scope > tr[parent-id] > td.vm-name .inner > a'), function (node) { return node.textContent.trim(); }).filter(Boolean);
      };
      var store = api.store('vm', {
        changed: function () { render(); },
        order: names,
        saveOrder: function (order) { api.saveUnraidOrder('vm', order); }
      });
      groups = { api: api, groups: store };
      api.lockState();
      table.classList.add('gl-with-groups');
      var toolbar = el('div', 'gl-toolbar gl-vm-toolbar');
      var tools = el('div', 'gl-tools');
      tools.append(api.newGroupButton(store, 'vm'));
      toolbar.append(tools);
      groups.toolbar = toolbar;
      api.dropIntoSections(list, store, function (row) {
        var link = row.querySelector('td.vm-name .inner > a');
        return link ? link.textContent.trim() : '';
      }, render);
      store.load();
      // Rows already decorated get their group button now.
      list.querySelectorAll(':scope > tr.gl-vm > td.gl-vm-actions .gl-row-actions').forEach(function (actions) {
        var item = describe(actions.closest('tr'));
        if (item && !actions.querySelector('.gl-group-button')) actions.insertBefore(store.button(item.name), actions.lastElementChild);
      });
      render();
    }

    function header(key, group) {
      if (headers.has(key)) return headers.get(key);
      var api = groups.api;
      var row = api.sectionHeader(groups.groups, group, {
        type: 'vm',
        onToggle: function () {
          collapsedState.toggle(key);
          render();
        },
        start: function (items) {
          api.runAll(items.filter(function (item) { return !item.blocked; }), function (item) { return api.postForm(VMAJAX, { action: 'domain-start', uuid: item.uuid }); });
        },
        stop: function (items) {
          api.runAll(items, function (item) { return api.postForm(VMAJAX, { action: 'domain-stop', uuid: item.uuid }); });
        }
      });
      headers.set(key, row);
      return row;
    }

    function render() {
      if (list.glSorting) return;
      var items = Array.prototype.map.call(list.querySelectorAll(':scope > tr[parent-id]'), describe).filter(Boolean);
      if (!items.length) return;
      if (columns) {
        // The detail rows (and Unraid's "no VMs" row) span the new column too.
        list.querySelectorAll(':scope > tr:not([parent-id]):not(.gl-group) > td[colspan="8"]').forEach(function (cell) { cell.colSpan = 9; });
      }
      items.forEach(function (item) {
        decorate(item);
        details(item);
      });
      if (!groups) return;
      if (!groups.toolbar.isConnected) anchor.before(groups.toolbar);
      groups.api.arrangeSections(items, {
        list: list,
        groups: groups.groups,
        type: 'vm',
        collapsed: collapsedState,
        headers: headers,
        header: header,
        rowsOf: rowsOf,
        app: function (item) {
          var image = item.trigger.querySelector('img');
          return { name: item.name, src: image && image.src, state: item.paused ? 'paused' : item.running ? 'running' : 'stopped', target: item.trigger };
        }
      });
      items.forEach(function (item) {
        rowsOf(item).forEach(function (row) {
          if (row.classList.contains('gl-filtered-out') !== Boolean(item.collapsed)) row.classList.toggle('gl-filtered-out', Boolean(item.collapsed));
        });
      });
    }

    // Unraid replaces the rows on every refresh; they are decorated and grouped before they are
    // painted. render() only moves or writes what changed.
    follow(list, render, { childList: true }, 'VM list');
    if (!fv) {
      if (G.groups) attachGroups(G.groups);
      else (G.groupsWaiting = G.groupsWaiting || []).push(attachGroups);
    }
    render();
  });
})();
