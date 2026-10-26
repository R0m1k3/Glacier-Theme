/*
 * Glacier Theme: Dashboard enhancements.
 *
 * Adapted from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Tunefish, MIT License; see NOTICE.md.
 *
 * - Key figures (CPU load, memory, array use; the uptime too when the greeting card is off)
 *   under the greeting card, kept in step with Unraid's tiles.
 * - Load charts (SmoothieCharts on a canvas) in the theme's colours, light or dark.
 * - Containers with an update ready: a badge on their icon.
 * - Processor tile: the cores as a grid of small tiles, power and temperature as chips.
 * - Airflow tile: one small card per fan. VM usage tile: one card per running VM.
 * - System tile: the usage rings in the theme's colours.
 *
 * Unraid keeps writing into its own elements by id or class, so elements are moved, never
 * copied, and every value is only written when it changed, so the observers do not loop.
 */
(function () {
  'use strict';

  var G = window.Glacier;
  var t = function (en, fr) { return G.t(en, fr); };

  function text(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function observe(node, fn, options) {
    if (!node || !('MutationObserver' in window)) return;
    new MutationObserver(fn).observe(node, options || { childList: true, characterData: true, subtree: true });
  }

  function number(value) {
    var n = parseFloat(String(value).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Unraid's warning and critical levels (Display Settings), from include/head-dashboard.php.
  function tone(percent) {
    var limits = window.glacierDashboard || { warning: 70, critical: 90 };
    if (percent === null) return 'accent';
    if (limits.critical > 0 && percent >= limits.critical) return 'danger';
    if (limits.warning > 0 && percent >= limits.warning) return 'warn';
    return 'accent';
  }

  function onDashboard() {
    return Boolean(document.getElementById('db_box1'));
  }

  // ---- Key figures -----------------------------------------------------------------------
  G.feature('dashboard-summary', function () {
    var frame = document.querySelector('#displaybox > .content > .frame');
    var grid = frame && frame.querySelector(':scope > .grid');
    if (!grid || !onDashboard()) return;

    var uptime = document.querySelector('#tile1 span.uptime');
    var cpu = document.querySelector('span.cpu.load');
    var memory = document.querySelector('span.sys0_.load');
    var memoryTile = memory && memory.closest('tbody');
    var memoryInfo = memoryTile && memoryTile.querySelector('.head_info');
    var arrayHeader = document.querySelector('#array_list .tile-header-left .section > span');
    var menuBar = document.querySelector('#menu .usage-bar > span');
    var last = '';

    function render() {
      var items = [];
      // The greeting card already shows the uptime.
      if (!frame.querySelector(':scope > .gl-hero') && text(uptime)) {
        var parts = text(uptime).match(/^(\d+\s+[^\s,]+),?\s*(.*)$/);
        items.push({ label: t('Uptime', 'Disponibilité'), value: parts ? parts[1] : text(uptime), detail: parts ? parts[2] : '' });
      }
      var cpuText = text(cpu);
      if (cpuText) items.push({ label: t('CPU load', 'Charge CPU'), value: cpuText, detail: t('overall', 'globale'), tone: tone(number(cpuText)) });
      var memText = text(memory);
      if (memText) {
        // "Memory: 64 GiB DDR5 ..." in any language: the first size after the colon.
        var info = text(memoryInfo);
        var size = (info.slice(info.indexOf(':') + 1).match(/\d[\d.,]*\s*[A-Za-z]+/) || [])[0] || '';
        items.push({ label: t('Memory', 'Mémoire'), value: memText, detail: size ? t('of ', 'sur ') + size : t('in use', 'utilisée'), tone: tone(number(memText)) });
      }
      // "13.0 TB used of 68 TB (48 %)", translated: the sizes and the percentage, in that order.
      var array = text(arrayHeader);
      var percent = array.match(/(\d[\d.,]*)\s*%/);
      var sizes = array.replace(/\([^)]*%\s*\)/, '').match(/\d[\d.,]*\s*[KMGTPE]?i?[BOo]\b/g) || [];
      if (!percent && text(menuBar)) percent = text(menuBar).match(/(\d[\d.,]*)\s*%/);
      if (percent) {
        var value = number(percent[1]);
        items.push({
          label: t('Array', 'Array'),
          value: (value === null ? percent[1] : value.toLocaleString(G.lang, { maximumFractionDigits: 1 })) + '%',
          detail: sizes.length >= 2 ? sizes[0] + ' ' + t('of', 'sur') + ' ' + sizes[1] : t('used', 'utilisé'),
          tone: tone(value) === 'accent' ? 'success' : tone(value)
        });
      }
      var signature = JSON.stringify(items);
      if (!items.length || signature === last) return;
      last = signature;
      var strip = G.summaryStrip('gl-dashboard-summary', t('Server summary', 'Résumé du serveur'), items);
      if (!strip.isConnected) {
        var hero = frame.querySelector(':scope > .gl-hero');
        if (hero) hero.after(strip);
        else grid.before(strip);
      }
    }

    var later = G.debounce(render, 200);
    [uptime, cpu, memory, arrayHeader].forEach(function (node) { observe(node, later); });
    render();
  });

  // ---- Load charts ------------------------------------------------------------------------
  // Canvas colours must be real colours: a token is resolved through a hidden element, then
  // drawn on a 1x1 canvas, which gives plain rgba() whatever the token holds (color-mix too).
  function colourResolver() {
    var probe = G.el('span');
    probe.hidden = true;
    document.body.append(probe);
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    return function (token, alpha) {
      probe.style.color = 'var(' + token + ')';
      var css = getComputedStyle(probe).color;
      if (!ctx) return css;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      var d = ctx.getImageData(0, 0, 1, 1).data;
      var a = (d[3] / 255) * (alpha === undefined ? 1 : alpha);
      return 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + Math.round(a * 1000) / 1000 + ')';
    };
  }

  G.feature('dashboard-charts', function () {
    var charts = [window.cpuchart, window.netchart].filter(function (chart) {
      return chart && chart.options && Array.isArray(chart.seriesSet);
    });
    if (!charts.length || !onDashboard()) return;
    var colour = colourResolver();

    function apply() {
      var font = getComputedStyle(document.documentElement).getPropertyValue('--gl-font').trim();
      var series = [colour('--gl-accent'), colour('--gl-warn')];
      charts.forEach(function (chart) {
        chart.options.interpolation = 'bezier';
        if (chart.options.grid) {
          chart.options.grid.strokeStyle = colour('--gl-border');
          chart.options.grid.fillStyle = 'transparent';
          chart.options.grid.borderVisible = false;
        }
        if (chart.options.labels) {
          chart.options.labels.fillStyle = colour('--gl-muted');
          if (font) chart.options.labels.fontFamily = font;
        }
        chart.seriesSet.forEach(function (entry, index) {
          var stroke = series[index % series.length];
          entry.options.strokeStyle = stroke;
          entry.options.lineWidth = 2;
          // A soft fill under a chart's only line.
          entry.options.fillStyle = chart.seriesSet.length === 1 ? colour('--gl-accent', 0.14) : undefined;
        });
      });
    }
    apply();
    // Follows a switch between light and dark without a reload.
    var classes = document.documentElement.className;
    observe(document.documentElement, function () {
      if (document.documentElement.className === classes) return;
      classes = document.documentElement.className;
      apply();
    }, { attributes: true, attributeFilter: ['class'] });
  });

  // ---- Containers with an update ready --------------------------------------------------
  // The update flag is the 6th argument of the icon's addDockerContainerContext(...) call;
  // Unraid also colours the name (blue-text) then. Unraid redraws the chips on each refresh.
  G.feature('dashboard-updates', function () {
    var view = document.getElementById('docker_view');
    if (!view || !onDashboard()) return;
    var label = t('Update available', 'Mise à jour disponible');
    function mark() {
      view.querySelectorAll('span.outer.apps').forEach(function (chip) {
        var hand = chip.querySelector(':scope > span.hand');
        var update = Boolean(chip.querySelector('.inner > span.blue-text')) ||
          Boolean(hand && /addDockerContainerContext/.test(hand.getAttribute('onclick') || '') && G.contextArguments(hand)[5] === '1');
        if (chip.classList.contains('gl-update') !== update) chip.classList.toggle('gl-update', update);
        // The tooltip is only taken away again when it is ours.
        if (hand && update && !hand.title) hand.title = label;
        else if (hand && !update && hand.title === label) hand.removeAttribute('title');
      });
    }
    mark();
    observe(view, mark, { childList: true, subtree: true });
  });

  // ---- Processor tile ----------------------------------------------------------------------
  G.feature('dashboard-cores', function () {
    var total = document.getElementById('cpu-total-power');
    var tile = total && total.closest('tbody');
    if (!tile || tile.classList.contains('gl-cpu-tile')) return;
    tile.classList.add('gl-cpu-tile');

    var missing = function (value) { return !value.trim() || /N\/A|^\s*-/.test(value); };
    var afterColon = function (value) { return value.indexOf(':') >= 0 ? value.slice(value.lastIndexOf(':') + 1).trim() : value.trim(); };
    var plain = function (value) { return value.trim(); };

    // A chip that shows the value of a source element, hidden while there is none. The value
    // is a <b>, not a span: glacier.js turns temperatures in table spans into badges.
    function chip(icon, title, source, valueOf) {
      var node = G.el('span', 'gl-cpu-chip');
      var glyph = G.el('i', 'fa ' + icon);
      glyph.setAttribute('aria-hidden', 'true');
      var value = G.el('b', 'gl-cpu-chip-value');
      node.title = title;
      node.append(glyph, G.el('span', 'gl-sr-only', title + ' '), value);
      var sync = function () {
        var current = valueOf(source.textContent.replace(/\s+/g, ' '));
        var hide = missing(current);
        if (node.hidden !== hide) node.hidden = hide;
        if (value.textContent !== current) value.textContent = current;
      };
      observe(source, sync);
      sync();
      return node;
    }

    // Summary chips: total power and, with one processor package, its temperature.
    var stats = G.el('span', 'gl-cpu-stats');
    stats.append(chip('fa-bolt', t('Total power', 'Puissance totale'), total, afterColon));
    var temp0 = document.getElementById('cpu-temp0');
    var headTemp = temp0 && temp0.closest('.head_info');
    if (headTemp) stats.append(chip('fa-thermometer-half', t('Temperature', 'Température'), temp0, plain));
    var headInfo = total.closest('.head_info');
    if (headInfo) {
      headInfo.before(stats);
      headInfo.classList.add('gl-cpu-source');
      if (headTemp) headTemp.classList.add('gl-cpu-source');
    }

    // Several packages: a short "CPU n" line with power and temperature chips each.
    tile.querySelectorAll('span.cpu_open [id^="cpu-power"]').forEach(function (power) {
      var index = power.id.replace('cpu-power', '');
      var line = power.closest('span.cpu_open');
      var row = line.closest('tr');
      var temp = document.getElementById('cpu-temp' + index);
      var chips = [chip('fa-bolt', t('Power', 'Puissance'), power, plain)];
      if (temp && line.contains(temp)) chips.push(chip('fa-thermometer-half', t('Temperature', 'Température'), temp, plain));
      Array.prototype.slice.call(line.childNodes).forEach(function (node) { node.remove(); });
      var hidden = G.el('span', 'gl-cpu-source');
      hidden.append(power);
      if (temp && chips.length > 1) hidden.append(temp);
      line.append.apply(line, [G.el('span', 'gl-cpu-pkg-name', 'CPU ' + index)].concat(chips, [hidden]));
      if (row) row.classList.add('gl-cpu-pkg');
      var update = function () {
        if (row) row.classList.toggle('gl-cpu-pkg-empty', chips.every(function (node) { return node.hidden; }));
      };
      chips.forEach(function (node) { observe(node, update, { attributes: true, attributeFilter: ['hidden'] }); });
      update();
    });
    tile.querySelectorAll('td.thin').forEach(function (cell) { cell.closest('tr').classList.add('gl-cpu-gap'); });

    // Core rows: "CPU 3" / "CPU 0 - HT 16" become "3" / "0 · 16"; the full text is the tooltip.
    // Intel hybrid processors add "(P-Core)" / "(E-Core)", shown as a small P / E badge.
    tile.querySelectorAll('tr.cpu_open').forEach(function (row) {
      var label = row.querySelector('span.w26');
      if (!label) return;
      var full = text(label);
      var match = full.match(/^CPU\s+(\d+)\s*(\([^)]*\))?\s*(?:-\s*HT\s+(\d+))?/);
      if (!match) return;
      row.classList.add('gl-core');
      row.title = full;
      label.textContent = match[1] + (match[3] ? ' · ' + match[3] : '');
      if (match[2]) {
        var type = match[2].replace(/[()]/g, '').trim();
        var badge = G.el('span', 'gl-core-type', type.split('-')[0] || type);
        badge.title = type;
        label.append(badge);
      }
      if (match[3]) row.classList.add('gl-core-pair');
    });
  });

  // ---- Airflow tile -----------------------------------------------------------------------
  // Unraid prints names and speeds as rows of three; they become one wrapping row of cards.
  G.feature('dashboard-fans', function () {
    var firstSpeed = document.querySelector('table.dashboard td > span[id^="fan"]');
    if (!firstSpeed) return;
    var cell = firstSpeed.parentElement;
    if (cell.querySelector('.gl-fans')) return;
    var spans = Array.prototype.filter.call(cell.children, function (node) { return node.tagName === 'SPAN'; });
    var speeds = spans.filter(function (node) { return /^fan\d+$/.test(node.id); });
    var names = spans.filter(function (node) { return !node.id; });
    if (!speeds.length || names.length !== speeds.length) return;

    var list = G.el('div', 'gl-fans');
    list.setAttribute('role', 'list');
    speeds.forEach(function (speed, index) {
      var card = G.el('div', 'gl-fan');
      card.setAttribute('role', 'listitem');
      var icon = G.el('i', 'fa fa-asterisk gl-fan-icon');
      icon.setAttribute('aria-hidden', 'true');
      speed.className = 'gl-fan-speed';
      card.append(icon, G.el('span', 'gl-fan-name', text(names[index])), speed);
      list.append(card);
      // A fan at 0 RPM is shown as stopped.
      var mark = function () {
        var idle = /^\s*0(\s|$)/.test(speed.textContent);
        if (card.classList.contains('is-idle') !== idle) card.classList.toggle('is-idle', idle);
      };
      observe(speed, mark);
      mark();
    });
    cell.replaceChildren(list);
  });

  // ---- Virtual Machines Usage tile ---------------------------------------------------------
  // Each running VM's chip (icon, name, state, then five readings separated by <br>) becomes a
  // card: icon and name on top, the readings in a grid. Unraid writes the readings by id.
  G.feature('dashboard-vm-usage', function () {
    var tile = document.getElementById('vm_view_usage');
    if (!tile) return;
    function arrange() {
      tile.querySelectorAll('span.outer.vmsuse:not(.gl-vmuse)').forEach(function (chip) {
        chip.classList.add('gl-vmuse');
        var readings = G.el('span', 'gl-vmuse-readings');
        chip.querySelectorAll(':scope > span[id^="vmmetrics-"]').forEach(function (reading) { readings.append(reading); });
        chip.querySelectorAll(':scope > br').forEach(function (br) { br.remove(); });
        chip.append(readings);
      });
    }
    // Unraid adds the rows when the Dashboard loads its app lists, and again on refresh.
    observe(tile, arrange, { childList: true });
    arrange();
  });

  // ---- System tile: usage rings --------------------------------------------------------------
  // Unraid draws the rings from a colour list in its page script (RAM: used, free, then VMs,
  // Docker, ...). The list gets the theme's tokens as var() colours, which follow light and
  // dark by themselves. The boot, log and Docker rings are drawn here (gl-dashboard.css) in a
  // colour that follows Unraid's level, read from the colour it gives the percentage.
  G.feature('dashboard-rings', function () {
    var charts = document.querySelector('.tile-system-memory-charts');
    if (!charts || charts.classList.contains('gl-rings')) return;
    charts.classList.add('gl-rings');
    var palette = ['--gl-accent', '--gl-border', '--gl-info-text', '--gl-warn', '--gl-success', '--gl-accent-light',
      '--gl-danger', '--gl-muted', '--gl-warn-text', '--gl-success-text', '--gl-danger-text', '--gl-text-2'];
    if (Array.isArray(window.colors)) {
      palette.forEach(function (token, index) { if (index < window.colors.length) window.colors[index] = 'var(' + token + ')'; });
    }
    if (typeof window.blue === 'string') window.blue = 'var(--gl-info-text)';

    var levelOf = function (node) {
      var match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(node.style.color || '');
      if (!match) return 'ok';
      if (+match[1] > 180 && +match[2] < 90) return 'critical';
      if (+match[1] > 180) return 'warning';
      return 'ok';
    };
    charts.querySelectorAll('div.pie[id^="sys"]').forEach(function (pie) {
      var value = pie.querySelector('span[class^="sys"]');
      if (!value) return;
      var update = function () {
        var level = levelOf(value);
        if (pie.dataset.level !== level) pie.dataset.level = level;
        var percent = number(value.textContent);
        var p = percent === null ? '' : String(Math.max(0, Math.min(100, percent)));
        if (p && pie.style.getPropertyValue('--gl-p') !== p) pie.style.setProperty('--gl-p', p);
      };
      observe(value, update, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
      update();
    });
  });
})();
