/*
 * Glacier Theme: Users tab as cards.
 *
 * Adapted from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Chris (Tunefish), MIT License; see NOTICE.md.
 *
 * Unraid's small avatar tiles become cards (picture or initials, name, role, description),
 * grouped as Administrators and Share users, with key figures above them, a search field and
 * an "Add user" button in the page heading. The cards stay Unraid's links to each user's page;
 * "Add user" submits Unraid's own form (the POST to UserAdd).
 */
(function () {
  'use strict';

  var G = window.Glacier;
  var t = function (en, fr) { return G.t(en, fr); };
  var TONES = 6;

  function fold(text) {
    var lower = String(text || '').toLowerCase();
    return lower.normalize ? lower.normalize('NFD').replace(/[̀-ͯ]/g, '') : lower;
  }

  function hash(text) {
    var value = 0;
    for (var i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0;
    return value;
  }

  function initials(name) {
    var parts = name.split(/[\s._-]+/).filter(Boolean);
    var letters = parts.length > 1 ? parts[0].charAt(0) + parts[1].charAt(0) : name.replace(/[^A-Za-z0-9À-ɏ]/g, '').slice(0, 2);
    return (letters || '?').toUpperCase();
  }

  function titleBefore(group) {
    var previous = group.previousElementSibling;
    return previous && previous.matches('div.title') ? previous : null;
  }

  function addButton(className, onClick) {
    var button = G.el('button', className);
    button.type = 'button';
    var icon = G.el('i', 'fa fa-user-plus');
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, G.el('span', null, t('Add user', 'Ajouter un utilisateur')));
    button.addEventListener('click', onClick);
    return button;
  }

  // One user tile: <div class="user-list"><a href=".../UserEdit?name=x"><img><br>x<span>desc</span></a></div>
  function card(item, admin) {
    var link = item.querySelector(':scope > a[href]');
    if (!link) return null;
    var picture = link.querySelector('img');
    var detail = link.querySelector(':scope > span');
    var description = detail ? detail.textContent.replace(/\s+/g, ' ').trim() : '';
    var name = Array.prototype.filter.call(link.childNodes, function (node) { return node.nodeType === 3; })
      .map(function (node) { return node.textContent; }).join(' ').replace(/\s+/g, ' ').trim();
    if (!name) return null;

    var avatar = G.el('span', 'gl-user-avatar');
    avatar.setAttribute('aria-hidden', 'true');
    if (picture && !/\/user\.png(\?|$)/.test(picture.getAttribute('src') || '')) {
      picture.removeAttribute('width');
      picture.removeAttribute('height');
      picture.removeAttribute('border');
      picture.alt = '';
      avatar.append(picture);
    } else {
      avatar.classList.add('gl-user-initials', 'gl-avatar-tone-' + (hash(name) % TONES));
      avatar.textContent = initials(name);
    }

    var text = G.el('span', 'gl-user-text');
    var top = G.el('span', 'gl-user-top');
    top.append(G.el('strong', 'gl-user-name', name),
      G.el('span', 'gl-pill ' + (admin ? 'gl-tone-accent' : 'gl-tone-success') + ' gl-user-role',
        admin ? t('Administrator', 'Administrateur') : t('Share access', 'Accès aux partages')));
    var desc = G.el('span', 'gl-user-desc', description ||
      (admin ? t('Console and web interface login', "Connexion à la console et à l'interface web") : t('No description', 'Aucune description')));
    if (!description) desc.classList.add('is-empty');
    text.append(top, desc);
    var go = G.el('span', 'gl-user-go');
    go.setAttribute('aria-hidden', 'true');
    go.append(G.el('i', 'fa fa-chevron-right'));

    link.className = 'gl-user-card';
    link.setAttribute('aria-label', t('Edit user ' + name, "Modifier l'utilisateur " + name) + (description ? ', ' + description : ''));
    link.replaceChildren(avatar, text, go);
    item.classList.add('gl-user');
    return { item: item, text: fold(name + ' ' + description), admin: admin };
  }

  G.feature('users', function (info) {
    if (info.tabKey !== 'Users' || info.subPage) return;
    var box = document.getElementById('displaybox');
    var content = box && box.querySelector(':scope > .content');
    if (!content || content.querySelector('.gl-users')) return;
    var tiles = content.querySelectorAll('.Panels > .user-list');
    if (!tiles.length) return;

    var form = Array.prototype.find.call(content.querySelectorAll('form'), function (candidate) {
      return /\/UserAdd$/.test(candidate.getAttribute('action') || '');
    });
    var submit = form && form.querySelector('input[type="submit"]');
    var addUser = function () {
      if (form.requestSubmit) form.requestSubmit(submit || undefined);
      else form.submit();
    };

    var people = [];
    var groups = [];
    content.querySelectorAll('.Panels').forEach(function (group) {
      var items = Array.prototype.filter.call(group.children, function (child) { return child.matches('.user-list'); });
      if (!items.length) return;
      // The group holding root is "Management Access", whatever the language.
      var admin = items.some(function (item) { return /[?&]name=root(&|$)/.test((item.querySelector('a') || {}).search || ''); });
      groups.push({ group: group, admin: admin, title: titleBefore(group), items: items });
    });
    if (!groups.length) return;

    // "Shares Access" without users has a paragraph instead of a group; the cards need one.
    if (!groups.some(function (entry) { return !entry.admin; }) && form) {
      var titles = content.querySelectorAll(':scope > div.title:not(.gl-heading-dup)');
      var shareTitle = titles.length > 1 ? titles[titles.length - 1] : null;
      if (shareTitle) {
        var emptyGroup = G.el('div', 'Panels');
        var paragraph = shareTitle.nextElementSibling;
        if (paragraph && paragraph.tagName === 'P') paragraph.classList.add('gl-users-none');
        (paragraph && paragraph.tagName === 'P' ? paragraph : shareTitle).after(emptyGroup);
        groups.push({ group: emptyGroup, admin: false, title: shareTitle, items: [] });
      }
    }

    groups.forEach(function (entry) {
      entry.group.classList.add('gl-users');
      entry.group.setAttribute('role', 'list');
      entry.items.forEach(function (item) {
        var person = card(item, entry.admin);
        if (!person) return;
        item.setAttribute('role', 'listitem');
        people.push(person);
      });
      if (entry.title) {
        entry.title.classList.add('gl-users-title');
        var left = entry.title.querySelector('.left') || entry.title;
        var icon = left.querySelector('i');
        var count = entry.items.length;
        left.replaceChildren();
        if (icon) {
          icon.className = 'fa ' + (entry.admin ? 'fa-shield' : 'fa-users') + ' title';
          left.append(icon);
        }
        left.append(document.createTextNode(entry.admin ? t('Administrators', 'Administrateurs') : t('Share users', 'Utilisateurs des partages')),
          G.el('span', 'gl-pill gl-users-count', String(count)));
        entry.title.title = entry.admin
          ? t('Can log in to the console and this web interface', "Peut se connecter à la console et à cette interface web")
          : t('Can reach the shares they are given access to', 'Accède aux partages qui lui sont ouverts');
      }
      entry.group.setAttribute('aria-label', entry.admin ? t('Administrators', 'Administrateurs') : t('Share users', 'Utilisateurs des partages'));
      if (!entry.admin && form) {
        var add = addButton('gl-user-add', addUser);
        add.setAttribute('role', 'listitem');
        entry.group.append(add);
      }
    });

    var admins = people.filter(function (person) { return person.admin; }).length;
    var strip = G.summaryStrip('gl-users-summary', t('Users overview', 'Aperçu des utilisateurs'), [
      { label: t('Accounts', 'Comptes'), value: String(people.length), detail: t('in total', 'au total') },
      { label: t('Administrators', 'Administrateurs'), value: String(admins), detail: t('web interface', 'interface web'), tone: 'accent' },
      { label: t('Share users', 'Utilisateurs des partages'), value: String(people.length - admins), detail: t('share access', 'accès aux partages'), tone: 'success' }
    ]);
    var heading = box.querySelector(':scope > .gl-heading');
    if (heading) heading.after(strip);
    else content.prepend(strip);

    // Search and "Add user" in the heading (or above the cards without one).
    var tools = heading ? heading.querySelector('.gl-heading-tools') : null;
    var bar = tools || G.el('div', 'gl-users-tools');
    var wrap = G.el('div', 'gl-panel-search gl-users-search');
    wrap.setAttribute('role', 'search');
    var search = G.el('input', 'gl-search gl-panel-search-input');
    search.type = 'search';
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.placeholder = t('Search users…', 'Rechercher un utilisateur…');
    search.setAttribute('aria-label', t('Search users', 'Rechercher un utilisateur'));
    var found = G.el('span', 'gl-panel-search-count');
    found.setAttribute('aria-live', 'polite');
    wrap.append(search, found);
    bar.append(wrap);
    if (form) {
      bar.append(addButton('gl-users-add', addUser));
      // Unraid's Add User / Done buttons: the buttons above take their place.
      form.classList.add('gl-users-form');
    }
    if (!tools) strip.after(bar);
    var empty = G.el('p', 'gl-panel-search-empty', t('No user matches this search.', 'Aucun utilisateur ne correspond à cette recherche.'));
    empty.hidden = true;
    groups[groups.length - 1].group.after(empty);

    function filter() {
      var words = fold(search.value).trim().split(/\s+/).filter(Boolean);
      var shown = 0;
      people.forEach(function (person) {
        var match = words.every(function (word) { return person.text.indexOf(word) >= 0; });
        person.item.classList.toggle('gl-filtered-out', !match);
        if (match) shown += 1;
      });
      groups.forEach(function (entry) {
        var visible = !words.length || entry.items.some(function (item) { return !item.classList.contains('gl-filtered-out'); });
        entry.group.classList.toggle('gl-filtered-out', !visible);
        if (entry.title) entry.title.classList.toggle('gl-filtered-out', !visible);
      });
      wrap.classList.toggle('is-searching', words.length > 0);
      found.textContent = words.length ? t(shown + ' of ' + people.length, shown + ' sur ' + people.length) : '';
      empty.hidden = !words.length || shown > 0;
    }
    search.addEventListener('input', filter);
    search.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && search.value) {
        event.preventDefault();
        search.value = '';
        filter();
      }
    });
  });
})();
