/*
 * Glacier Theme: application groups, named sets of containers (Docker tab, Dashboard Docker
 * tile) or VMs (VMs tab, Dashboard VM tile), shown as collapsible sections.
 *
 * Ported from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Chris (Tunefish), MIT License; see NOTICE.md.
 *
 * This file is the shared part (Glacier.groups): the store (include/groups.php, handed over in
 * the page by include/head-groups.php), the section headers, the members' icon strips, the lock
 * state, Unraid's start order, and the Docker list's sections. The VMs tab (gl-vm.js) and the
 * Dashboard (gl-groups-dashboard.js) use it too.
 *
 * - Groups are kept on the server, so every browser sees the same; which sections are closed is
 *   remembered per browser (localStorage).
 * - Changing the groups in a way that moves containers or VMs saves Unraid's own order of the
 *   list as it now stands (UserPrefs.php, as Unraid's drag and drop does), so they start in the
 *   order they are listed. Nothing is saved when the order does not change.
 * - Off while a FolderView plugin is installed: it arranges these lists itself.
 * - Moving a group (grip, up / down) follows Unraid's lock button in the menu.
 */
(function () {
  'use strict';

  var G = window.Glacier;
  if (!G) return;
  var t = G.t;
  var el = G.el;
  var UNGROUPED = '\u0000ungrouped';

  function folderView() {
    return window.glacierFolderView === true || Boolean(document.querySelector('script[src*="/folder.view"]'));
  }

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  function validGroups(list) {
    return Array.isArray(list) ? list.filter(function (group) {
      return group && typeof group.name === 'string' && group.name && Array.isArray(group.containers);
    }).map(function (group) {
      return { name: group.name, containers: group.containers.filter(function (name) { return typeof name === 'string' && name; }) };
    }) : [];
  }

  function nouns(type) {
    return type === 'vm'
      ? { one: 'VM', many: 'VMs' }
      : { one: t('container', 'conteneur'), many: t('containers', 'conteneurs') };
  }

  function count(n, type) {
    var noun = nouns(type);
    return n + ' ' + (n === 1 ? noun.one : noun.many);
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

  // ---- Which sections are closed, per browser (shared by a tab and the Dashboard).
  function collapsedState(storageKey) {
    var read = function () {
      try {
        var value = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return Array.isArray(value) ? value : [];
      } catch (error) { return []; }
    };
    return {
      has: function (key) { return read().indexOf(key) >= 0; },
      toggle: function (key) {
        var keys = read();
        var next = keys.indexOf(key) >= 0 ? keys.filter(function (entry) { return entry !== key; }) : keys.concat(key);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (error) { /* storage blocked */ }
      }
    };
  }

  // ---- A small menu next to a button: [{ icon, label, checked, run }] (null: a divider).
  var openMenu = null;
  function closeMenu(restoreFocus) {
    if (!openMenu) return;
    var menu = openMenu;
    openMenu = null;
    menu.node.remove();
    if (restoreFocus && menu.anchor && menu.anchor.isConnected) menu.anchor.focus();
  }
  document.addEventListener('click', function (event) {
    if (openMenu && !openMenu.node.contains(event.target)) closeMenu(false);
  });
  window.addEventListener('resize', function () { closeMenu(false); });

  function popupMenu(anchor, label, items) {
    closeMenu(false);
    var node = el('div', 'gl-menu');
    node.setAttribute('role', 'menu');
    node.setAttribute('aria-label', label);
    var buttons = [];
    items.forEach(function (item) {
      if (!item) {
        node.append(el('div', 'gl-menu-divider'));
        return;
      }
      var button = el('button', 'gl-menu-item' + (item.checked ? ' gl-checked' : ''));
      button.type = 'button';
      button.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemradio');
      if (item.checked !== undefined) button.setAttribute('aria-checked', String(Boolean(item.checked)));
      var icon = el('i', 'fa fa-fw fa-' + item.icon);
      icon.setAttribute('aria-hidden', 'true');
      button.append(icon, el('span', null, item.label));
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        closeMenu(true);
        item.run();
      });
      buttons.push(button);
      node.append(button);
    });
    node.addEventListener('keydown', function (event) {
      var index = buttons.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        var step = event.key === 'ArrowDown' ? 1 : -1;
        buttons[(index + step + buttons.length) % buttons.length].focus();
      } else if (event.key === 'Tab') {
        closeMenu(false);
      }
    });
    document.body.append(node);
    var box = anchor.getBoundingClientRect();
    node.style.top = Math.max(8, Math.min(box.bottom + 6, window.innerHeight - node.offsetHeight - 8)) + 'px';
    node.style.left = Math.max(8, Math.min(box.right - node.offsetWidth, window.innerWidth - node.offsetWidth - 8)) + 'px';
    openMenu = { node: node, anchor: anchor };
    if (buttons[0]) buttons[0].focus();
  }

  // ---- The store of one kind of groups ('docker' or 'vm').
  //   hooks: { changed() redraw; order() the list's names in order, or null; saveOrder(names) }
  // A change that may move members (assign, move, delete, drag) saves Unraid's order when the
  // list's order is different afterwards.
  function store(type, hooks) {
    var preset = window.glacierGroups && window.glacierGroups[type];
    var api = {
      type: type,
      groups: validGroups(preset),
      load: function () {
        if (Array.isArray(preset)) return;
        G.getJSON('/include/groups.php?type=' + type).then(function (data) {
          api.groups = validGroups(data && data.groups);
          hooks.changed();
        }).catch(function (error) {
          if (window.console) console.warn('Glacier Theme, groups:', error && error.message);
        });
      },
      save: function (reorder) {
        var before = reorder && hooks.order ? hooks.order() : null;
        hooks.changed();
        if (before && hooks.saveOrder) {
          var after = hooks.order();
          if (after && after.join('\n') !== before.join('\n')) hooks.saveOrder(after);
        }
        G.post('/include/groups.php', { type: type, groups: JSON.stringify(api.groups) }).catch(function (error) {
          if (window.console) console.error('Glacier Theme, groups:', error);
          G.modal({
            title: t('Group change not saved', 'Modification du groupe non enregistrée'),
            message: t('The server did not accept the change. It will be lost when the page reloads.', "Le serveur n'a pas accepté la modification. Elle sera perdue au rechargement de la page."),
            hideCancel: true
          });
        });
      },
      of: function (name) {
        return api.groups.filter(function (group) { return group.containers.indexOf(name) >= 0; })[0] || null;
      },
      // Asks for a name; resolves with the new group, an existing group of that name, or null.
      create: function () {
        var noun = type === 'vm' ? t('VMs', 'Les VMs') : t('Containers', 'Les conteneurs');
        return G.modal({
          title: t('New group', 'Nouveau groupe'),
          message: t(noun + ' are added to it from their folder button, or by dragging them into it while the list is unlocked.',
            noun + " s'y ajoutent avec leur bouton dossier, ou en les glissant dedans quand la liste est déverrouillée."),
          input: { placeholder: t('Group name', 'Nom du groupe'), maxLength: 60 },
          confirmLabel: t('Create group', 'Créer le groupe')
        }).then(function (name) {
          if (!name) return null;
          var existing = api.groups.filter(function (group) { return group.name.toLowerCase() === name.toLowerCase(); })[0];
          if (existing) return existing;
          var group = { name: name, containers: [] };
          api.groups.push(group);
          return group;
        });
      },
      assign: function (name, group) {
        api.groups.forEach(function (other) {
          other.containers = other.containers.filter(function (entry) { return entry !== name; });
        });
        if (group) group.containers.push(name);
        api.save(true);
      },
      move: function (group, step) {
        var from = api.groups.indexOf(group);
        var to = from + step;
        if (from < 0 || to < 0 || to >= api.groups.length) return;
        api.groups.splice(to, 0, api.groups.splice(from, 1)[0]);
        api.save(true);
      },
      rename: function (group) {
        G.modal({
          title: t('Rename group', 'Renommer le groupe'),
          input: { value: group.name, placeholder: t('Group name', 'Nom du groupe'), maxLength: 60 },
          validate: function (name) {
            var taken = api.groups.some(function (other) { return other !== group && other.name.toLowerCase() === name.toLowerCase(); });
            return taken ? t('A group with that name already exists.', 'Un groupe porte déjà ce nom.') : '';
          },
          confirmLabel: t('Rename', 'Renommer')
        }).then(function (name) {
          if (!name || name === group.name) return;
          group.name = name;
          api.save(false);
        });
      },
      remove: function (group) {
        G.modal({
          title: t('Delete "' + group.name + '"?', 'Supprimer « ' + group.name + ' » ?'),
          message: type === 'vm'
            ? t('Only the group is removed. Its VMs are kept and become ungrouped.', 'Seul le groupe est supprimé. Ses VMs sont conservées et deviennent sans groupe.')
            : t('Only the group is removed. Its containers are kept and become ungrouped.', 'Seul le groupe est supprimé. Ses conteneurs sont conservés et deviennent sans groupe.'),
          confirmLabel: t('Delete group', 'Supprimer le groupe'),
          danger: true
        }).then(function (confirmed) {
          if (!confirmed) return;
          api.groups = api.groups.filter(function (other) { return other !== group; });
          api.save(true);
        });
      },
      // Menu of a member's folder button: pick a group, make a new one, or leave the group.
      menu: function (anchor, name) {
        var current = api.of(name);
        var items = api.groups.map(function (group) {
          return { icon: group === current ? 'check' : 'folder-o', label: group.name, checked: group === current, run: function () { if (group !== current) api.assign(name, group); } };
        });
        if (items.length) items.push(null);
        items.push({ icon: 'plus', label: t('New group…', 'Nouveau groupe…'), run: function () {
          api.create().then(function (group) { if (group) api.assign(name, group); });
        } });
        if (current) items.push({ icon: 'times', label: t('Remove from group', 'Retirer du groupe'), run: function () { api.assign(name, null); } });
        popupMenu(anchor, t('Group of ', 'Groupe de ') + name, items);
      },
      // The folder button at the end of a member's row.
      button: function (name) {
        var button = G.iconButton('folder-o', t('Group of ', 'Groupe de ') + name, function (event) {
          event.stopPropagation();
          api.menu(event.currentTarget, name);
        }, 'gl-group-button');
        button.setAttribute('aria-haspopup', 'menu');
        return button;
      }
    };
    return api;
  }

  // ---- A group's members as small icons: those with an update first, then running, paused,
  // stopped. The first `max` are shown and "+n" for the rest; each icon's tooltip is the
  // member's name, and an icon with a target (the element whose click opens its menu) opens it.
  //   apps: [{ name, src, state: 'running' | 'paused' | 'stopped', update, target }]
  var STRIP_ORDER = { running: 0, paused: 1, stopped: 2 };
  function appStrip(strip, list, max) {
    var apps = list.slice().sort(function (a, b) { return (b.update ? 1 : 0) - (a.update ? 1 : 0) || STRIP_ORDER[a.state] - STRIP_ORDER[b.state]; });
    // The targets are replaced on every call: Unraid rebuilds its rows and chips on refresh.
    strip.glTargets = {};
    apps.forEach(function (app) { strip.glTargets[app.name] = app.target; });
    if (!strip.glBound) {
      strip.glBound = true;
      strip.addEventListener('click', openFromStrip);
      strip.addEventListener('keydown', openFromStrip);
    }
    var signature = apps.map(function (app) { return app.name + ':' + app.state + (app.update ? ':u' : '') + (app.target ? '' : ':-') + ':' + (app.src || ''); }).join('|');
    if (strip.dataset.apps === signature) return;
    strip.dataset.apps = signature;
    var stateText = { running: '', paused: t(' (paused)', ' (en pause)'), stopped: t(' (stopped)', ' (arrêté)') };
    var shown = apps.slice(0, max).map(function (app) {
      var item = el('span', 'gl-app-icon gl-app-' + app.state + (app.update ? ' gl-app-update' : ''));
      item.dataset.name = app.name;
      item.title = app.name + stateText[app.state] + (app.update ? t(', update available', ', mise à jour disponible') : '');
      if (app.target) {
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.setAttribute('aria-label', item.title);
      }
      if (app.src) {
        var image = el('img');
        image.src = app.src;
        image.alt = '';
        image.loading = 'lazy';
        item.append(image);
      } else {
        item.append(el('span', 'gl-app-letter', app.name.charAt(0).toUpperCase()));
      }
      return item;
    });
    if (apps.length > max) shown.push(el('span', 'gl-app-more', '+' + (apps.length - max)));
    strip.replaceChildren.apply(strip, shown);
    strip.hidden = !apps.length;
  }

  // A click (or Enter) on an icon of a strip goes to the member's own element, at the icon's
  // position, so its menu (or the Dashboard dialog) opens there; it goes no further (the strip
  // sits inside a group's header or chip, which would open or close the group).
  function openFromStrip(event) {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    var icon = event.target.closest('.gl-app-icon');
    var target = icon && event.currentTarget.glTargets && event.currentTarget.glTargets[icon.dataset.name];
    if (!target || !target.isConnected) return;
    event.preventDefault();
    event.stopPropagation();
    var box = icon.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      clientX: event.clientX || box.left, clientY: event.clientY || box.bottom
    }));
  }

  // ---- Unraid's lock button (in the menu) turns rearranging the Docker and VM lists on and off
  // and remembers "unlocked" in its lockbutton cookie. html.gl-unlocked follows it; the groups'
  // move controls show only then.
  function listsUnlocked() {
    return /(?:^|;\s*)lockbutton=/.test(document.cookie);
  }

  function lockState() {
    var sync = function () { document.documentElement.classList.toggle('gl-unlocked', listsUnlocked()); };
    sync();
    // The Docker and VMs pages clear the cookie when they start, in a jQuery ready handler that
    // may run after this one.
    if (window.jQuery) window.jQuery(function () { setTimeout(sync); });
    setTimeout(sync, 500);
    if (typeof window.LockButton === 'function' && !window.LockButton.glWrapped) {
      var original = window.LockButton;
      window.LockButton = function () {
        var result = original.apply(this, arguments);
        sync();
        return result;
      };
      window.LockButton.glWrapped = true;
    }
  }

  // ---- Unraid's own order of the Docker or VM list (the one its lock button lets you drag; the
  // containers start in it and the Dashboard shows it), saved like its drag and drop does.
  function saveUnraidOrder(type, names) {
    if (folderView() || !names || !names.length) return;
    var body = new URLSearchParams({
      names: names.join(';') + ';',
      index: names.map(function (name, index) { return index; }).join(';') + ';',
      csrf_token: G.csrf()
    });
    fetch('/plugins/dynamix.' + (type === 'vm' ? 'vm' : 'docker') + '.manager/include/UserPrefs.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).catch(function (error) {
      if (window.console) console.error('Glacier Theme, start order:', error);
    });
  }

  // ---- A section's header row on the Docker or VMs tab: open / close with the name and count,
  // the members' icons, start or stop the whole section, and for a group: move it (grip, up,
  // down), rename it, delete it. The row's glItems are the section's members, set on every
  // refresh ({ name, running, paused, ... }).
  //   options: { type, onToggle(), start(items), stop(items), load (CPU and memory totals) }
  function sectionHeader(groups, group, options) {
    var row = el('tr', 'gl-group');
    var cell = el('td');
    cell.colSpan = 20;
    var head = el('div', 'gl-group-head');
    var toggle = el('button', 'gl-group-toggle');
    toggle.type = 'button';
    var chevron = el('i', 'fa fa-chevron-down gl-group-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    var folder = el('span', 'gl-group-icon');
    folder.setAttribute('aria-hidden', 'true');
    folder.append(el('i', 'fa ' + (group ? 'fa-folder-open' : 'fa-inbox')));
    var titles = el('span', 'gl-group-titles');
    titles.append(el('span', 'gl-group-name'), el('span', 'gl-group-count'));
    toggle.append(chevron, folder, titles);
    toggle.addEventListener('click', options.onToggle);
    if (group) {
      row.glGroup = group;
      var grip = el('span', 'gl-group-grip');
      grip.title = t('Drag to move the group', 'Glisser pour déplacer le groupe');
      grip.setAttribute('aria-hidden', 'true');
      grip.append(el('i', 'fa fa-arrows-v'));
      dragGroup(row, grip, groups);
      head.append(grip);
    }
    head.append(toggle, el('span', 'gl-group-apps'));
    if (options.load) {
      var load = el('span', 'gl-group-load');
      var cpu = el('span', 'gl-group-cpu');
      var mem = el('span', 'gl-group-mem');
      cpu.title = t('CPU of the running containers', 'CPU des conteneurs démarrés');
      mem.title = t('Memory of the running containers', 'Mémoire des conteneurs démarrés');
      load.append(cpu, mem);
      head.append(load);
    }
    var actions = el('div', 'gl-row-actions gl-group-actions');
    var members = function () { return row.glItems || []; };
    var noun = nouns(options.type);
    actions.append(G.iconButton('play', t('Start all stopped ' + noun.many + ' in this section', 'Démarrer les ' + noun.many + ' arrêtés de cette section'), function () {
      var stopped = members().filter(function (item) { return !item.running && !item.paused; });
      if (stopped.length) options.start(stopped);
    }, 'gl-group-start'));
    actions.append(G.iconButton('stop', t('Stop all running ' + noun.many + ' in this section', 'Arrêter les ' + noun.many + ' démarrés de cette section'), function () {
      var running = members().filter(function (item) { return item.running; });
      if (!running.length) return;
      G.modal({
        title: t('Stop ' + count(running.length, options.type) + '?', 'Arrêter ' + count(running.length, options.type) + ' ?'),
        message: t('These will be stopped: ', 'Seront arrêtés : ') + running.map(function (item) { return item.name; }).join(', ') + '.',
        confirmLabel: t('Stop', 'Arrêter'),
        danger: true
      }).then(function (confirmed) {
        if (confirmed) options.stop(running);
      });
    }, 'gl-danger gl-group-stop'));
    if (group) {
      row.glUp = G.iconButton('arrow-up', t('Move group up', 'Monter le groupe'), function () { groups.move(group, -1); }, 'gl-group-move');
      row.glDown = G.iconButton('arrow-down', t('Move group down', 'Descendre le groupe'), function () { groups.move(group, 1); }, 'gl-group-move');
      actions.append(row.glUp, row.glDown);
      actions.append(G.iconButton('pencil', t('Rename group', 'Renommer le groupe'), function () { groups.rename(group); }));
      actions.append(G.iconButton('trash-o', t('Delete group (its ' + noun.many + ' stay)', 'Supprimer le groupe (ses ' + noun.many + ' restent)'), function () { groups.remove(group); }, 'gl-danger'));
    }
    head.append(actions);
    cell.append(head);
    row.append(cell);
    return row;
  }

  // Fills in a section header: name, count, icons, open or closed, which move buttons work.
  //   section: { title, items, collapsed, index }   options: { type, groupCount, app(item) }
  function updateSectionHeader(header, section, options) {
    var running = section.items.filter(function (item) { return item.running; }).length;
    setText(header.querySelector('.gl-group-name'), section.title);
    var countText = count(section.items.length, options.type) + ' · ' + running + ' ' + t('running', running === 1 ? 'démarré' : 'démarrés');
    setText(header.querySelector('.gl-group-count'), countText);
    var toggle = header.querySelector('.gl-group-toggle');
    var label = section.title + ', ' + countText;
    if (toggle.getAttribute('aria-label') !== label) toggle.setAttribute('aria-label', label);
    if (toggle.getAttribute('aria-expanded') !== String(!section.collapsed)) toggle.setAttribute('aria-expanded', String(!section.collapsed));
    appStrip(header.querySelector('.gl-group-apps'), section.items.map(options.app), 8);
    if (header.classList.contains('gl-collapsed') !== section.collapsed) header.classList.toggle('gl-collapsed', section.collapsed);
    var startButton = header.querySelector('.gl-group-start');
    var stopButton = header.querySelector('.gl-group-stop');
    startButton.disabled = !section.items.some(function (item) { return !item.running && !item.paused; });
    stopButton.disabled = !running;
    if (header.glUp) {
      header.glUp.disabled = section.index === 0;
      header.glDown.disabled = section.index === options.groupCount - 1;
    }
  }

  // Moves a group by dragging its grip (mouse, pen or touch) above or below another group; its
  // members move with it. A line shows where it will go. "Ungrouped" stays last.
  function dragGroup(row, grip, groups) {
    grip.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || !listsUnlocked()) return;
      var list = row.parentElement;
      var others = list ? Array.prototype.filter.call(list.querySelectorAll(':scope > tr.gl-group'), function (header) { return header.glGroup && header !== row; }) : [];
      if (!others.length) return;
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      row.classList.add('gl-group-dragging');
      var line = el('div', 'gl-group-drop-line');
      document.body.append(line);
      var place = -1;
      var update = function (y) {
        place = others.filter(function (header) {
          var box = header.getBoundingClientRect();
          return box.top + box.height / 2 < y;
        }).length;
        var next = others[place];
        var lineY;
        if (next) {
          lineY = next.getBoundingClientRect().top;
        } else {
          var end = others[others.length - 1];
          for (var sibling = end.nextElementSibling; sibling && !(sibling.classList.contains('gl-group') && sibling !== row); sibling = sibling.nextElementSibling) {
            if (sibling.offsetParent && sibling !== row) end = sibling;
          }
          lineY = end.getBoundingClientRect().bottom;
        }
        var box = list.getBoundingClientRect();
        line.style.cssText = 'top:' + (lineY - 1) + 'px;left:' + box.left + 'px;width:' + box.width + 'px';
      };
      var onMove = function (moveEvent) {
        if (moveEvent.clientY < 60) window.scrollBy(0, -12);
        else if (moveEvent.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
        update(moveEvent.clientY);
      };
      var finish = function (endEvent) {
        grip.removeEventListener('pointermove', onMove);
        grip.removeEventListener('pointerup', finish);
        grip.removeEventListener('pointercancel', finish);
        row.classList.remove('gl-group-dragging');
        line.remove();
        if (endEvent.type !== 'pointerup' || place < 0) return;
        var order = others.map(function (header) { return header.glGroup; });
        order.splice(place, 0, row.glGroup);
        var current = groups.groups.filter(function (entry) { return order.indexOf(entry) >= 0; });
        if (order.every(function (entry, index) { return entry === current[index]; })) return;
        groups.groups = order.concat(groups.groups.filter(function (entry) { return order.indexOf(entry) < 0; }));
        groups.save(true);
      };
      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', finish);
      grip.addEventListener('pointercancel', finish);
      update(event.clientY);
    });
  }

  // ---- Unraid's drag and drop (jQuery UI sortable, on while the list is unlocked). Dropped in
  // another group's section, the container or VM joins that group (or leaves its group in
  // "Ungrouped"). While a row is dragged, list.glSorting is set and the tab leaves the list alone
  // (its placeholder row would be moved away); redraw() runs once the row is dropped. Unraid's
  // sortable keeps a dragged row within the list's rows; it may also move over the table head, so
  // a row can be dropped first. Nothing happens without jQuery UI.
  function dropIntoSections(list, groups, nameOfRow, redraw) {
    var jq = window.jQuery;
    if (!jq || !jq.fn || !jq.fn.sortable) return;
    var table = list.closest('table');
    var widen = function () {
      if (table && jq(list).data('ui-sortable')) jq(list).sortable('option', 'containment', table);
    };
    jq(list).on('sortcreate', widen);
    widen();
    jq(list).on('sortstart', function () { list.glSorting = true; });
    jq(list).on('sortstop', function () {
      list.glSorting = false;
      setTimeout(redraw);
    });
    jq(list).on('sortupdate', function (event, ui) {
      var row = ui && ui.item && ui.item[0];
      if (!row || !groups.groups.length) return;
      var header = row.previousElementSibling;
      while (header && !header.classList.contains('gl-group')) header = header.previousElementSibling;
      header = header || list.querySelector(':scope > tr.gl-group');
      if (!header || !header.glKey) return;
      var name = nameOfRow(row);
      var target = header.glKey === UNGROUPED ? null : groups.groups.filter(function (group) { return 'g:' + group.name === header.glKey; })[0] || null;
      if (name && target !== groups.of(name)) groups.assign(name, target);
    });
  }

  // ---- Sections of a list (Docker or VMs tab). Puts the headers and their members in order at
  // the top of the list: the groups in their saved order, then "Ungrouped"; the members in each
  // section in Unraid's order. Moves nothing when the order is already right.
  //   options: { list, groups, type, collapsed, headers (Map), header(key, group), app(item),
  //              rowsOf(item) (the rows that move with a member), after(header, section) }
  function arrangeSections(items, options) {
    var groups = options.groups;
    var sections = groups.groups.map(function (group) {
      return { key: 'g:' + group.name, group: group, title: group.name, items: items.filter(function (item) { return group.containers.indexOf(item.name) >= 0; }) };
    });
    if (sections.length) {
      var rest = items.filter(function (item) { return !groups.of(item.name); });
      if (rest.length) sections.push({ key: UNGROUPED, group: null, title: t('Ungrouped', 'Sans groupe'), items: rest });
    }
    var wanted = {};
    sections.forEach(function (section) { wanted[section.key] = true; });
    options.headers.forEach(function (row, key) {
      if (!wanted[key] || row.glGroup !== (groups.groups.filter(function (group) { return 'g:' + group.name === key; })[0] || undefined)) {
        row.remove();
        options.headers.delete(key);
      }
    });
    var order = [];
    sections.forEach(function (section, index) {
      var header = options.header(section.key, section.group);
      header.glItems = section.items;
      header.glKey = section.key;
      section.index = index;
      section.collapsed = options.collapsed.has(section.key);
      updateSectionHeader(header, section, { type: options.type, groupCount: groups.groups.length, app: options.app });
      if (options.after) options.after(header, section);
      order.push(header);
      section.items.forEach(function (item) {
        item.collapsed = section.collapsed;
        (options.rowsOf ? options.rowsOf(item) : [item.row]).forEach(function (row) { order.push(row); });
      });
    });
    if (!sections.length) {
      items.forEach(function (item) { item.collapsed = false; });
      return sections;
    }
    var list = options.list;
    order.forEach(function (node, index) {
      if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null);
    });
    return sections;
  }

  // ---- "New group" button for a tab's toolbar.
  function newGroupButton(groups, type) {
    var button = el('button', 'gl-tool-button gl-new-group');
    button.type = 'button';
    var icon = el('i', 'fa fa-plus');
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, el('span', null, t('Group', 'Groupe')));
    button.title = type === 'vm' ? t('Create a group of VMs', 'Créer un groupe de VMs') : t('Create an application group', "Créer un groupe d'applications");
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', function () {
      groups.create().then(function (group) { if (group) groups.save(false); });
    });
    return button;
  }

  // Starts or stops several containers or VMs one after another, then lets Unraid reload the
  // list once. post(item) returns the request's promise.
  function runAll(items, post) {
    var spinner = document.querySelector('div.spinner.fixed');
    if (spinner) spinner.style.display = 'block';
    var chain = Promise.resolve();
    items.forEach(function (item) {
      chain = chain.then(function () { return post(item).catch(function () { /* next one */ }); });
    });
    chain.then(function () {
      if (typeof window.loadlist === 'function') window.loadlist();
      else if (spinner) spinner.style.display = '';
    });
  }

  function postForm(url, fields) {
    var body = new URLSearchParams(fields);
    body.set('csrf_token', G.csrf());
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  }

  // ---- Docker tab: sections in the container list (used by gl-docker.js).
  //   ctx: { table, list, toolbar, render }
  // Returns { rowButton(name), layout(items), filter(filtering) }.
  var UNITS = { B: 1, KIB: 1024, MIB: 1048576, GIB: 1073741824, TIB: 1099511627776, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
  function dockerList(ctx) {
    if (folderView()) return null;
    var list = ctx.list;
    var collapsed = collapsedState('glacier-docker-collapsed');
    var headers = new Map();
    var names = function () {
      return Array.prototype.map.call(list.querySelectorAll(':scope > tr > td.ct-name .appname'), function (node) { return node.textContent.trim(); }).filter(Boolean);
    };
    var groups = store('docker', {
      changed: function () { ctx.render(); },
      order: names,
      saveOrder: function (order) { saveUnraidOrder('docker', order); }
    });
    lockState();
    ctx.table.classList.add('gl-with-groups');
    ctx.toolbar.append(newGroupButton(groups, 'docker'));

    var decimal = function () { return window.glacierDecimalMark === ',' ? ',' : '.'; };
    var number = function (text) { return parseFloat(String(text).replace(',', '.')) || 0; };
    function sectionLoad(items) {
      var cpu = 0;
      var bytes = 0;
      var limit = 0;
      var running = 0;
      var toBytes = function (text) {
        var value = String(text).trim().match(/^([\d.,]+)\s*([KMGT]?i?B)$/i);
        return value ? number(value[1]) * (UNITS[value[2].toUpperCase()] || 1) : 0;
      };
      items.forEach(function (item) {
        if (!item.running) return;
        running++;
        var cpuNode = item.row.querySelector('[class^="cpu-"]');
        var memNode = item.row.querySelector('[class^="mem-"]');
        if (cpuNode) cpu += number(cpuNode.textContent);
        var parts = memNode ? memNode.textContent.split('/') : [];
        bytes += toBytes(parts[0] || '');
        limit = Math.max(limit, toBytes(parts[1] || ''));
      });
      if (!running) return { cpu: '', mem: '' };
      var size = function (value) {
        var unit = ['TiB', 'GiB', 'MiB', 'KiB'].filter(function (name) { return value >= UNITS[name.toUpperCase()]; })[0] || 'B';
        var amount = value / UNITS[unit.toUpperCase()];
        return (amount >= 100 || unit === 'B' ? String(Math.round(amount)) : amount.toFixed(1).replace('.', decimal())) + unit;
      };
      return { cpu: cpu.toFixed(2).replace('.', decimal()) + '%', mem: bytes ? size(bytes) + (limit ? ' / ' + size(limit) : '') : '' };
    }

    function header(key, group) {
      if (headers.has(key)) return headers.get(key);
      var row = sectionHeader(groups, group, {
        type: 'docker',
        load: true,
        onToggle: function () {
          collapsed.toggle(key);
          ctx.render();
        },
        start: function (items) { runAll(items, function (item) { return postForm(window.eventURL || '/plugins/dynamix.docker.manager/include/Events.php', { action: 'start', container: item.id }); }); },
        stop: function (items) { runAll(items, function (item) { return postForm(window.eventURL || '/plugins/dynamix.docker.manager/include/Events.php', { action: 'stop', container: item.id }); }); }
      });
      headers.set(key, row);
      return row;
    }

    dropIntoSections(list, groups, function (row) {
      var name = row.querySelector('td.ct-name .appname');
      return name ? name.textContent.trim() : '';
    }, ctx.render);

    return {
      groups: groups,
      rowButton: function (name) { return groups.button(name); },
      layout: function (items) {
        arrangeSections(items, {
          list: list,
          groups: groups,
          type: 'docker',
          collapsed: collapsed,
          headers: headers,
          header: header,
          app: function (item) {
            var image = item.row.querySelector('td.ct-name img.img');
            return { name: item.name, src: image && image.src, state: item.paused ? 'paused' : item.running ? 'running' : 'stopped', update: item.update, target: item.trigger };
          },
          after: function (row, section) {
            var load = sectionLoad(section.items);
            setText(row.querySelector('.gl-group-cpu'), load.cpu);
            setText(row.querySelector('.gl-group-mem'), load.mem);
            row.querySelector('.gl-group-mem').hidden = !load.mem;
            row.querySelector('.gl-group-load').hidden = !load.cpu;
          }
        });
      },
      // A section whose containers are all filtered away is hidden with them; an empty group
      // stays visible so it can be filled, unless a filter or search is active.
      filter: function (filtering) {
        headers.forEach(function (row) {
          var items = row.glItems || [];
          var show = items.length ? items.some(function (item) { return item.visible; }) : !filtering;
          if (row.classList.contains('gl-filtered-out') === show) row.classList.toggle('gl-filtered-out', !show);
        });
      }
    };
  }

  var api = {
    UNGROUPED: UNGROUPED,
    follow: follow,
    folderView: folderView,
    collapsedState: collapsedState,
    store: store,
    appStrip: appStrip,
    sectionHeader: sectionHeader,
    updateSectionHeader: updateSectionHeader,
    arrangeSections: arrangeSections,
    dropIntoSections: dropIntoSections,
    lockState: lockState,
    saveUnraidOrder: saveUnraidOrder,
    newGroupButton: newGroupButton,
    runAll: runAll,
    postForm: postForm,
    dockerList: dockerList
  };
  G.groups = api;
  (G.groupsWaiting || []).splice(0).forEach(function (fn) {
    try { fn(api); } catch (error) { if (window.console) console.error('Glacier Theme, groups:', error); }
  });
})();
