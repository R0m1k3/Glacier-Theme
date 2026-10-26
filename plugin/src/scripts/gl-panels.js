/*
 * Glacier Theme: Settings and Tools tabs, a search field and favourite panels.
 *
 * Adapted from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Chris (Tunefish), MIT License; see NOTICE.md.
 *
 * - Favourites: each panel gets a star button; a starred panel moves into a "Favourites" section
 *   above the others and goes back to its place when the star is removed. The list is kept on
 *   the flash drive (include/favourites.php), so every browser sees the same one;
 *   include/head-favourites.php hands it to the page with the "Favorites enabled" setting.
 * - Search: typing filters the panels by name and page name (accents and case ignored);
 *   sections without a match are hidden with their title. "/" focuses the field, Escape clears it.
 */
(function () {
  'use strict';

  var G = window.Glacier;
  var t = function (en, fr) { return G.t(en, fr); };
  var MOVED = 'gl-panels-moved';

  // Lower case without accents, so "parametres" finds "Paramètres".
  function fold(text) {
    var lower = String(text || '').toLowerCase();
    return lower.normalize ? lower.normalize('NFD').replace(/[̀-ͯ]/g, '') : lower;
  }

  function titleBefore(group) {
    var previous = group.previousElementSibling;
    return previous && previous.matches('div.title') ? previous : null;
  }

  function panelName(panel) {
    var text = panel.querySelector('.PanelText');
    return (text || panel).textContent.replace(/\s+/g, ' ').trim();
  }

  // "Settings/Identification" from the panel's link.
  function keyOf(panel) {
    var link = panel.querySelector('a[href]');
    if (!link) return '';
    try {
      return new URL(link.getAttribute('href'), location.href).pathname.replace(/^\/+|\/+$/g, '');
    } catch (error) {
      return '';
    }
  }

  // ---- Favourites ------------------------------------------------------------------------
  function favourites(box, panels) {
    var config = window.glacierFavourites;
    // Display Settings, "Favorites enabled: No".
    if (config && config.enabled === false) return;

    var cards = [];
    panels.forEach(function (panel, index) {
      var key = keyOf(panel);
      if (!key || panel.querySelector('.gl-fav-toggle')) return;
      var star = G.el('button', 'gl-fav-toggle');
      star.type = 'button';
      var icon = G.el('i', 'fa fa-star-o');
      icon.setAttribute('aria-hidden', 'true');
      star.append(icon);
      star.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggle(key);
      });
      panel.classList.add('gl-fav-card');
      panel.append(star);
      cards.push({ panel: panel, key: key, star: star, icon: icon, name: panelName(panel), home: panel.parentElement, order: index });
    });
    if (!cards.length) return;

    var firstGroup = panels[0].parentElement;
    var anchor = titleBefore(firstGroup) || firstGroup;
    var title = G.el('div', 'title gl-fav-title');
    var left = G.el('span', 'left');
    var titleIcon = G.el('i', 'fa fa-star title');
    titleIcon.setAttribute('aria-hidden', 'true');
    left.append(titleIcon, document.createTextNode(t('Favourites', 'Favoris')));
    title.append(left);
    var group = G.el('div', 'Panels gl-fav-panels');
    group.setAttribute('aria-label', t('Favourites', 'Favoris'));
    var hint = G.el('p', 'gl-fav-hint', t(
      'Star a panel to pin it here. It leaves its own section until the star is removed.',
      'Cliquez sur l’étoile d’un panneau pour l’épingler ici. Il quitte sa section tant que l’étoile est active.'));
    anchor.before(title, group, hint);

    var list = cleanList(config && config.list);
    var confirmed = list.slice();
    var saving = Promise.resolve();

    function cleanList(value) {
      return Array.isArray(value) ? value.filter(function (item, index, all) { return typeof item === 'string' && all.indexOf(item) === index; }) : [];
    }

    function place() {
      cards.forEach(function (card) {
        var starred = list.indexOf(card.key) >= 0;
        var label = starred
          ? t('Remove ' + card.name + ' from favourites', 'Retirer ' + card.name + ' des favoris')
          : t('Add ' + card.name + ' to favourites', 'Ajouter ' + card.name + ' aux favoris');
        card.star.classList.toggle('is-on', starred);
        card.star.setAttribute('aria-pressed', starred ? 'true' : 'false');
        if (card.star.title !== label) {
          card.star.title = label;
          card.star.setAttribute('aria-label', label);
        }
        card.icon.className = 'fa ' + (starred ? 'fa-star' : 'fa-star-o');
        card.panel.classList.toggle('gl-fav-on', starred);
      });
      // Favourites in the order they were starred; every other panel back at its own place.
      list.forEach(function (key) {
        var card = cards.find(function (item) { return item.key === key; });
        if (card) group.append(card.panel);
      });
      cards.filter(function (card) { return list.indexOf(card.key) < 0; })
        .sort(function (a, b) { return a.order - b.order; })
        .forEach(function (card) { card.home.append(card.panel); });
      hint.hidden = group.children.length > 0;
      box.querySelectorAll('.Panels').forEach(function (section) {
        var empty = section !== group && !section.querySelector('.Panel');
        section.classList.toggle('gl-empty-section', empty);
        var sectionTitle = titleBefore(section);
        if (sectionTitle) sectionTitle.classList.toggle('gl-empty-section', empty);
      });
      document.dispatchEvent(new CustomEvent(MOVED));
    }

    function failed(error) {
      if (window.console) console.error('Glacier Theme, favourites:', error);
      list = confirmed.slice();
      place();
      G.modal({
        title: t('Favourite not saved', 'Favori non enregistré'),
        message: t('The server did not accept the change, so the panel is back where it was.',
          'Le serveur n’a pas accepté la modification ; le panneau a repris sa place.'),
        confirmLabel: 'OK',
        hideCancel: true
      });
    }

    function toggle(key) {
      list = list.indexOf(key) >= 0 ? list.filter(function (item) { return item !== key; }) : list.concat(key);
      place();
      var sent = list.slice();
      // One save at a time, each with the list as it was when the star was clicked.
      saving = saving.then(function () {
        return G.post('/include/favourites.php', { favourites: JSON.stringify(sent) }).then(function (data) {
          confirmed = cleanList(data && data.favourites);
        });
      }).catch(failed);
    }

    place();
    if (!config || !Array.isArray(config.list)) {
      // No list from the page (head-favourites.php missing): ask the server.
      G.getJSON('/include/favourites.php').then(function (data) {
        list = cleanList(data && data.favourites);
        confirmed = list.slice();
        place();
      }).catch(function (error) {
        if (window.console) console.error('Glacier Theme, favourites:', error);
      });
    }
  }

  // ---- Search ----------------------------------------------------------------------------
  function search(info, box, panels) {
    var items = panels.map(function (panel) {
      var link = panel.querySelector('a');
      var page = link ? (link.getAttribute('href') || '').split('/').pop().replace(/([a-z0-9])([A-Z])/g, '$1 $2') : '';
      return { panel: panel, text: fold(panelName(panel) + ' ' + page) };
    });

    var wrap = G.el('div', 'gl-panel-search');
    wrap.setAttribute('role', 'search');
    var field = G.el('input', 'gl-search gl-panel-search-input');
    field.type = 'search';
    field.id = 'gl-panel-search';
    field.autocomplete = 'off';
    field.spellcheck = false;
    var label = info.tabKey === 'Tools' ? t('Search tools', 'Rechercher un outil') : t('Search settings', 'Rechercher un réglage');
    field.placeholder = label + '…';
    field.setAttribute('aria-label', label);
    field.setAttribute('aria-keyshortcuts', '/');
    var key = G.el('kbd', 'gl-panel-search-key', '/');
    key.setAttribute('aria-hidden', 'true');
    var count = G.el('span', 'gl-panel-search-count');
    count.setAttribute('aria-live', 'polite');
    wrap.append(field, key, count);
    var empty = G.el('p', 'gl-panel-search-empty', t('Nothing matches this search.', 'Aucun résultat pour cette recherche.'));
    empty.hidden = true;

    var tools = box.querySelector(':scope > .gl-heading .gl-heading-tools');
    var firstGroup = panels[0].parentElement;
    var firstTitle = box.querySelector('.gl-fav-title') || titleBefore(firstGroup) || firstGroup;
    if (tools) tools.append(wrap);
    else firstTitle.before(wrap);
    firstTitle.before(empty);

    function filter() {
      var words = fold(field.value).trim().split(/\s+/).filter(Boolean);
      var shown = 0;
      items.forEach(function (item) {
        var match = words.every(function (word) { return item.text.indexOf(word) >= 0; });
        item.panel.classList.toggle('gl-filtered-out', !match);
        if (match) shown += 1;
      });
      // Worked out each time: favourites move panels between sections.
      box.querySelectorAll('.Panels').forEach(function (group) {
        var favourites = group.classList.contains('gl-fav-panels');
        // Favourites (with its hint) stays visible while nothing is searched.
        var visible = (!words.length && favourites) || Array.prototype.some.call(group.children, function (child) {
          return child.matches('.Panel') && !child.classList.contains('gl-filtered-out');
        });
        group.classList.toggle('gl-filtered-out', !visible);
        var title = titleBefore(group);
        if (title) title.classList.toggle('gl-filtered-out', !visible);
      });
      wrap.classList.toggle('is-searching', words.length > 0);
      var text = words.length ? t(shown + ' of ' + items.length, shown + ' sur ' + items.length) : '';
      if (count.textContent !== text) count.textContent = text;
      empty.hidden = !words.length || shown > 0;
    }

    field.addEventListener('input', filter);
    document.addEventListener(MOVED, filter);
    field.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (field.value) {
        event.preventDefault();
        field.value = '';
        filter();
      } else {
        field.blur();
      }
    });
    // "/" jumps to the field, as on many sites, unless the user is typing somewhere else.
    document.addEventListener('keydown', function (event) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      var active = document.activeElement;
      if (active && (/^(input|textarea|select)$/i.test(active.tagName) || active.isContentEditable)) return;
      if (document.querySelector('.gl-modal-backdrop, .sweet-alert.visible')) return;
      event.preventDefault();
      field.focus();
      field.select();
    });
  }

  G.feature('panels', function (info) {
    if (info.subPage || !/^(Settings|Tools)$/.test(info.tabKey)) return;
    var box = document.getElementById('displaybox');
    if (!box || box.querySelector('.gl-panel-search')) return;
    var panels = Array.prototype.slice.call(box.querySelectorAll('.Panels > .Panel'));
    if (!panels.length) return;
    favourites(box, panels);
    search(info, box, panels);
  });
})();
