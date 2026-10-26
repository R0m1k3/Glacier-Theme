/*
 * Glacier Theme: page heading (eyebrow, title and a one-line subtitle) above each tab's content.
 *
 * Adapted from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Chris (Tunefish), MIT License; see NOTICE.md.
 *
 * A main tab shows its group as the eyebrow, its menu name as the title and a short subtitle.
 * A sub-page (/Settings/DiskSettings) shows the tab as the eyebrow and the page's own title.
 * The Dashboard has the greeting card instead. Other features put their tools (a search field,
 * buttons) into the heading's .gl-heading-tools slot.
 */
(function () {
  'use strict';

  var t = function (en, fr) { return window.Glacier.t(en, fr); };

  // Eyebrow and subtitle of the stock tabs, keyed by the menu link ("/Settings" -> "Settings").
  function tabs() {
    return {
      Main: [t('Storage', 'Stockage'), t('Array devices, pools and boot device.', "Disques de l'array, pools et périphérique de démarrage.")],
      Shares: [t('Storage', 'Stockage'), t('User shares and how they are exported and stored.', 'Les partages utilisateur, leur export et leur stockage.')],
      Users: [t('Access', 'Accès'), t('Accounts that can reach the shares and the web interface.', "Les comptes qui accèdent aux partages et à l'interface web.")],
      Settings: [t('Configuration', 'Configuration'), t('System, network, services and preferences.', 'Système, réseau, services et préférences.')],
      Plugins: [t('Extensions', 'Extensions'), t('Installed plugins and the updates available for them.', 'Les plugins installés et leurs mises à jour disponibles.')],
      Docker: [t('Applications', 'Applications'), t('Manage containers, follow their resources and keep services healthy.', 'Gérez les conteneurs, suivez leurs ressources et gardez vos services en forme.')],
      VMs: [t('Virtualization', 'Virtualisation'), t('Virtual machines and the resources assigned to them.', 'Les machines virtuelles et les ressources qui leur sont attribuées.')],
      Apps: [t('Community Applications', 'Applications communautaires'), t('Browse container templates and install them in one step.', 'Parcourez les modèles de conteneurs et installez-les en une étape.')],
      Stats: [t('Monitoring', 'Supervision'), t('Processor, memory, network and disk activity over time.', 'Activité du processeur, de la mémoire, du réseau et des disques dans le temps.')],
      Tools: [t('Maintenance', 'Maintenance'), t('Diagnostics, system information and maintenance utilities.', 'Diagnostics, informations système et outils de maintenance.')],
      Favorites: [t('Shortcuts', 'Raccourcis'), t('The pages you added to your favorites.', 'Les pages que vous avez ajoutées à vos favoris.')]
    };
  }

  var normal = function (text) { return (text || '').replace(/\s+/g, ' ').trim().toLowerCase(); };

  window.Glacier.feature('heading', function (info) {
    var el = window.Glacier.el;
    var box = document.getElementById('displaybox');
    if (!box || !info.tab || box.querySelector(':scope > .gl-heading')) return;
    if (info.tabKey === 'Dashboard' && !info.subPage) return;
    // Only above Unraid's own page frame: tabs or the content card.
    if (!box.querySelector(':scope > nav.tabs, :scope > .content, :scope > .tab-content')) return;

    var known = tabs()[info.tabKey];
    var heading = el('header', 'gl-heading');
    var text = el('div', 'gl-heading-text');
    var eyebrow = info.subPage ? info.tab : known && known[0];
    if (eyebrow) text.append(el('p', 'gl-eyebrow', eyebrow));
    var title = el('h1', 'gl-heading-title', info.subPage || info.tab);
    title.id = 'gl-heading-title';
    text.append(title);
    if (known && !info.subPage) text.append(el('p', 'gl-subtitle', known[1]));
    var tools = el('div', 'gl-heading-tools');
    heading.append(text, tools);
    box.prepend(heading);

    // A page without tabs often repeats its name in its first section title ("Users"); that
    // title is hidden when it only says the same thing as the heading and holds no controls.
    var first = box.querySelector(':scope > .content > div.title:first-child');
    if (first && normal(first.textContent) === normal(title.textContent) && !first.querySelector('.right *')) {
      first.classList.add('gl-heading-dup');
    }
  });
})();
