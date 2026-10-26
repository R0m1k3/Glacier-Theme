/*
 * Glacier Theme: the shared kit for the page enhancements (scripts/gl-*.js).
 *
 * Several helpers and the enhancement structure are adapted from Aurora Theme
 * (https://github.com/Tunefish92/Aurora-Theme), Copyright (c) 2026 Chris (Tunefish), MIT License.
 * See NOTICE.md.
 *
 * Each enhancement file registers itself with Glacier.feature(name, fn). They all run once the
 * page is parsed, each in its own try/catch, so one failing feature never stops the others or
 * Unraid's own scripts. Each feature checks for the page it belongs to and returns early
 * elsewhere.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var features = [];
  var started = false;
  var lang = (root.getAttribute('lang') || 'en').slice(0, 2).toLowerCase();

  var Glacier = {
    base: '/plugins/Glacier-Theme',
    lang: lang,

    /** The French text when the webGUI is in French, else the English one. */
    t: function (en, fr) {
      return lang === 'fr' && fr ? fr : en;
    },

    el: function (tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined && text !== null) node.textContent = text;
      return node;
    },

    /** A round icon-only button (Font Awesome 4 icon name without "fa-"). */
    iconButton: function (icon, label, onClick, extraClass) {
      var button = Glacier.el('button', 'gl-icon-button' + (extraClass ? ' ' + extraClass : ''));
      button.type = 'button';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.append(Glacier.el('i', 'fa fa-' + icon));
      if (onClick) button.addEventListener('click', onClick);
      return button;
    },

    debounce: function (fn, wait) {
      var timer;
      return function () {
        clearTimeout(timer);
        timer = setTimeout(fn, wait || 150);
      };
    },

    /**
     * Calls fn now and again (debounced) whenever the target's content changes. Features must
     * only write what changed, or mark what they did, so their own writes do not loop.
     */
    watch: function (target, fn, options) {
      if (!target) return null;
      fn();
      if (!('MutationObserver' in window)) return null;
      var run = Glacier.debounce(fn, options && options.wait);
      var observer = new MutationObserver(run);
      observer.observe(target, { childList: true, subtree: true, characterData: Boolean(options && options.text) });
      return observer;
    },

    /** Unraid's CSRF token, which it checks on every POST. */
    csrf: function () {
      return typeof window.csrf_token === 'string' ? window.csrf_token : '';
    },

    /** POST form fields (with the CSRF token) to one of the theme's endpoints; resolves with JSON. */
    post: function (path, fields) {
      var body = new URLSearchParams(fields || {});
      body.set('csrf_token', Glacier.csrf());
      return fetch(Glacier.base + path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      }).then(function (response) {
        if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
        return response.json();
      });
    },

    getJSON: function (path) {
      return fetch(Glacier.base + path, { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
        return response.json();
      });
    },

    /**
     * Server, tab and sub-page of the current page. "Tower/DisplaySettings" in the title gives
     * the server and page name; GlacierTheme.page hands over Unraid's own page title.
     */
    pageInfo: function () {
      var titleParts = document.title.split('/');
      var active = document.querySelector('#menu .nav-item.active a');
      var tab = active ? active.textContent.trim() : '';
      var tabHref = active ? (active.getAttribute('href') || '').replace(/^\//, '') : '';
      var path = location.pathname.split('/').filter(Boolean);
      var subPage = tabHref && path[0] === tabHref && path.length > 1 ? path[path.length - 1] : '';
      var titles = subPage ? document.querySelectorAll('#displaybox div.title > span.left') : [];
      var sectionName = titles.length === 1 ? titles[0].textContent.replace(/\s+/g, ' ').trim() : '';
      var pageTitle = subPage && typeof window.glacierPageTitle === 'string' ? window.glacierPageTitle : '';
      return {
        server: titleParts.length > 1 ? titleParts[0] : '',
        tab: tab || titleParts[1] || '',
        tabKey: tabHref || path[0] || '',
        subPage: pageTitle || (sectionName && sectionName.length <= 40 ? sectionName
          : subPage.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[._]/g, ' '))
      };
    },

    /**
     * Unraid passes each container's (or VM's) details to its context menu in the icon's
     * onclick call: addDockerContainerContext(name, image, template, started, paused, update,
     * autostart, webui, ...). The arguments are read as text; nothing is executed.
     */
    contextArguments: function (trigger) {
      var call = (trigger && trigger.getAttribute('onclick')) || '';
      var inner = call.slice(call.indexOf('(') + 1, call.lastIndexOf(')'));
      var pattern = /'((?:[^'\\]|\\.)*)'|([^,'\s][^,]*)/g;
      var values = [];
      var match;
      while ((match = pattern.exec(inner))) {
        values.push(match[1] !== undefined ? match[1].replace(/\\(.)/g, '$1') : match[2].trim());
      }
      return values;
    },

    /**
     * Opens Unraid's menu for a container or VM (the click on its icon) from a button at the
     * end of its row; the click is placed left of the button so the menu stays on screen.
     */
    openMenuFrom: function (trigger, button) {
      var box = button.getBoundingClientRect();
      trigger.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
        clientX: Math.max(8, box.right - 260), clientY: box.bottom
      }));
    },

    /**
     * Opens a container's web interface the way Unraid's own menu does (window.open), from an
     * element without href, so Unraid's "external link" warning is not shown for it.
     */
    webuiOpener: function (node, url) {
      node.setAttribute('role', 'link');
      node.tabIndex = 0;
      node.dataset.url = url;
      var open = function (event) {
        event.preventDefault();
        event.stopPropagation();
        window.open(url, '_blank');
      };
      node.addEventListener('click', open);
      node.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') open(event); });
      return node;
    },

    /**
     * A row of key figures. items: [{ label, value, detail, tone: 'success'|'warn'|'danger'|'accent' }].
     * Returns the strip (created on first call, refilled afterwards).
     */
    summaryStrip: function (id, label, items) {
      var strip = document.getElementById(id);
      if (!strip) {
        strip = Glacier.el('section', 'gl-summary');
        strip.id = id;
        strip.setAttribute('aria-label', label);
      }
      strip.replaceChildren.apply(strip, items.map(function (item) {
        var cell = Glacier.el('div', 'gl-summary-item');
        var value = Glacier.el('div', 'gl-summary-value' + (item.tone ? ' gl-tone-' + item.tone : ''));
        value.append(Glacier.el('span', 'gl-summary-number', item.value), Glacier.el('span', 'gl-summary-detail', item.detail || ''));
        cell.append(Glacier.el('div', 'gl-summary-label', item.label), value);
        return cell;
      }));
      return strip;
    },

    /**
     * Themed dialog used instead of the browser's prompt / confirm / alert.
     *   modal({ title, message, input: { value, placeholder, maxLength }, validate,
     *           confirmLabel, cancelLabel, danger, hideCancel, content })
     * message may be a list of paragraphs; content an element shown under them.
     * Resolves with the entered text (or true without input), or null when cancelled.
     */
    modal: function (options) {
      return new Promise(function (resolve) {
        var el = Glacier.el;
        var previousFocus = document.activeElement;
        var backdrop = el('div', 'gl-modal-backdrop');
        var box = el('div', 'gl-modal' + (options.wide ? ' gl-modal-wide' : ''));
        var titleId = 'gl-modal-title-' + Date.now();
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', titleId);
        var title = el('h2', 'gl-modal-title', options.title);
        title.id = titleId;
        box.append(title);
        (Array.isArray(options.message) ? options.message : [options.message]).forEach(function (text) {
          if (text) box.append(el('p', 'gl-modal-message', text));
        });
        if (options.content) box.append(options.content);

        var input = null;
        var problem = el('p', 'gl-modal-problem');
        problem.setAttribute('role', 'alert');
        if (options.input) {
          input = el('input', 'gl-modal-input');
          input.type = 'text';
          input.value = options.input.value || '';
          input.placeholder = options.input.placeholder || '';
          input.maxLength = options.input.maxLength || 200;
          input.setAttribute('aria-label', options.input.placeholder || options.title);
          box.append(input, problem);
        }

        var actions = el('div', 'gl-modal-actions');
        var cancel = el('button', 'gl-modal-button', options.cancelLabel || Glacier.t('Cancel', 'Annuler'));
        cancel.type = 'button';
        var confirm = el('button', 'gl-modal-button ' + (options.danger ? 'gl-modal-danger' : 'gl-modal-primary'), options.confirmLabel || 'OK');
        confirm.type = 'button';
        if (!options.hideCancel) actions.append(cancel);
        if (!options.hideConfirm) actions.append(confirm);
        box.append(actions);
        backdrop.append(box);

        function close(result) {
          document.removeEventListener('keydown', onKey, true);
          backdrop.remove();
          if (previousFocus && previousFocus.focus) previousFocus.focus();
          resolve(result);
        }
        function accept() {
          if (!input) return close(true);
          var text = input.value.trim();
          if (!text) return input.focus();
          var message = options.validate ? options.validate(text) : '';
          if (message) {
            problem.textContent = message;
            return input.focus();
          }
          close(text);
        }
        function onKey(event) {
          if (event.key === 'Escape') {
            event.stopPropagation();
            close(null);
          } else if (event.key === 'Enter' && input) {
            event.preventDefault();
            accept();
          } else if (event.key === 'Tab') {
            // Keep the focus inside the dialog.
            var stops = Array.prototype.slice.call(box.querySelectorAll('button:not([disabled]), input, a[href], [tabindex="0"]'));
            if (!stops.length) return;
            var index = stops.indexOf(document.activeElement);
            event.preventDefault();
            stops[(index + (event.shiftKey ? stops.length - 1 : 1) + stops.length) % stops.length].focus();
          }
        }
        if (input) {
          var sync = function () {
            confirm.disabled = !input.value.trim();
            problem.textContent = '';
          };
          input.addEventListener('input', sync);
          sync();
        }
        cancel.addEventListener('click', function () { close(null); });
        confirm.addEventListener('click', accept);
        // A click on the dimmed area cancels; clicks inside the box must not reach the page.
        backdrop.addEventListener('click', function (event) {
          event.stopPropagation();
          if (event.target === backdrop) close(null);
        });
        document.addEventListener('keydown', onKey, true);
        document.body.append(backdrop);
        Glacier.closeModal = function () { close(null); };
        (input || (options.hideConfirm ? cancel : confirm)).focus();
        if (input) input.select();
      });
    },

    /** Registers an enhancement; it runs once the page is parsed. */
    feature: function (name, fn) {
      features.push({ name: name, fn: fn });
      if (started) run(features[features.length - 1]);
    }
  };

  function run(feature) {
    try {
      feature.fn(Glacier.pageInfo());
    } catch (error) {
      if (window.console) console.error('Glacier Theme, ' + feature.name + ':', error);
    }
  }

  function start() {
    if (started || !root.classList.contains('glacier')) return;
    started = true;
    features.forEach(run);
  }

  window.Glacier = Glacier;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);
})();
