/*
 * Glacier Theme: Main, Array Operation as cards.
 *
 * Adapted from Aurora Theme (https://github.com/Tunefish92/Aurora-Theme),
 * Copyright (c) 2026 Chris (Tunefish), MIT License; see NOTICE.md.
 *
 * Unraid lays the actions out as table rows (status, button, explanation). The rows become cards
 * in one grid, each with an icon and a title: Array, Parity check, Last check, Disks, Mover,
 * Power. A running parity operation gets a progress bar and its figures as tiles. Nodes are only
 * moved inside their own form and keep their ids, so Unraid's scripts and its live (nchan)
 * updates keep working. Rows are recognised by their buttons' ids and names, never by their
 * (translated) labels; a row nothing matches becomes a generic card.
 */
(function () {
  'use strict';

  if (!window.Glacier) return;

  Glacier.feature('array-operation', function (info) {
    if (info.tabKey !== 'Main') return;
    var t = Glacier.t;
    var el = Glacier.el;
    var tables = Array.prototype.slice.call(document.querySelectorAll('#displaybox table.ArrayOperation-Table'));
    if (!tables.length || document.querySelector('.gl-ops')) return;

    // ---- Gather the forms and tables (and what Unraid's markdown left between them) in one grid.
    var outer = function (table) { return table.closest('form') || table; };
    var first = outer(tables[0]);
    var last = outer(tables[tables.length - 1]);
    if (first.parentElement !== last.parentElement) return;
    var grid = el('div', 'gl-ops');
    first.before(grid);
    for (var node = first; node;) {
      var next = node.nextSibling;
      grid.append(node);
      if (node === last) break;
      node = next;
    }
    // Empty paragraphs left by the markdown would show as gaps; anything else stays, full width.
    var blankNode = function (node) {
      return !node.textContent.trim() && !node.querySelector('input, select, button, img, i, a');
    };
    Array.prototype.forEach.call(grid.children, function (child) {
      if (child.matches('form, table')) return;
      if (child.matches('p') && blankNode(child)) child.hidden = true;
      else child.classList.add('gl-ops-extra');
    });
    for (var prev = grid.previousElementSibling; prev && prev.matches('p, script'); prev = prev.previousElementSibling) {
      if (prev.matches('p') && blankNode(prev)) prev.hidden = true;
    }

    var rowsOf = function () {
      return Array.prototype.slice.call(grid.querySelectorAll('table.ArrayOperation-Table > tbody > tr'));
    };
    var percentOf = function (cell) {
      var match = cell && /(\d+(?:[.,]\d+)?)\s*%/.exec(cell.textContent);
      return match ? Math.max(0, Math.min(100, parseFloat(match[1].replace(',', '.')))) : null;
    };
    var formatPercent = function (value) {
      var text = value.toFixed(1);
      return (Glacier.lang === 'fr' ? text.replace('.', ',') + ' ' : text + ' ') + '%';
    };

    // A progress bar with its percentage, and an empty set of tiles, in one cell.
    function statsCell(extraClass) {
      var cell = el('td', 'gl-op-stats' + (extraClass ? ' ' + extraClass : ''));
      var percent = el('span', 'gl-progress-label');
      var bar = el('div', 'gl-progress');
      var fill = el('span');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.append(fill);
      var tiles = el('div', 'gl-stats');
      cell.append(percent, bar, tiles);
      return {
        cell: cell,
        tiles: tiles,
        show: function (value) {
          bar.hidden = percent.hidden = value === null;
          if (value === null) return;
          percent.textContent = formatPercent(value);
          bar.setAttribute('aria-valuenow', String(value));
          fill.style.width = value + '%';
        }
      };
    }

    function tile(label, value, wide) {
      var box = el('div', 'gl-stat' + (wide ? ' gl-stat-wide' : ''));
      if (typeof label === 'string') label = el('span', 'gl-stat-label', label);
      else label.classList.add('gl-stat-label');
      value.classList.add('gl-stat-value');
      box.append(label, value);
      return box;
    }

    // ---- A running parity check, rebuild, clear or read check adds one row per figure (total
    // size, elapsed time, position, speed, finish, errors). Unraid fills the cells by id (#line0
    // ...), so the cells themselves move into tiles in the running operation's card.
    var statRows = rowsOf().filter(function (row) { return row.querySelector(':scope > td[id^="line"]'); });
    if (statRows.length) {
      var stats = statsCell();
      statRows.forEach(function (row) {
        var value = row.querySelector(':scope > td[id^="line"]');
        var label = row.children[0] ? row.children[0].textContent.replace(/\s+/g, ' ').trim().replace(/\s*:$/, '') : '';
        stats.tiles.append(tile(label, value));
        row.classList.add('gl-op-skip');
      });
      var position = stats.cell.querySelector('#line2');
      if (position) Glacier.watch(position, function () { stats.show(percentOf(position)); }, { text: true, wait: 50 });
      else stats.show(null);
      var host = grid.querySelector('#pauseButton, #cancelButton');
      if (host) host.closest('tr').append(stats.cell);
      else {
        var row = el('tr');
        row.append(el('td'), el('td'), stats.cell);
        statRows[0].before(row);
      }
    }

    // ---- Mover status (rows "moverrow…" that Unraid shows and hides while the mover runs, where
    // the release has them; 7.3.4's ArrayOperation.page does not). They become tiles in the Mover
    // card that follow their row's hidden state; the cells keep their ids.
    var moverRows = Array.prototype.slice.call(grid.querySelectorAll('tr[id^="moverrow"]'));
    var moverButton = grid.querySelector('#mover-button');
    if (moverRows.length && moverButton) {
      var mover = statsCell('gl-op-mover-stats');
      var moverCard = moverButton.closest('tr');
      var syncs = [];
      var updateMover = function () {
        syncs.forEach(function (sync) { sync(); });
        var busy = Array.prototype.some.call(mover.tiles.children, function (box) { return !box.hidden; });
        mover.cell.hidden = !busy;
        moverCard.classList.toggle('gl-op-busy', busy);
        mover.show(busy ? percentOf(grid.querySelector('#moverline2')) : null);
      };
      var moverUpdate = Glacier.debounce(updateMover, 50);
      moverRows.forEach(function (row, index) {
        var label = row.children[1];
        var value = row.children[2];
        if (!label || !value) return;
        if (!label.children.length && !label.id) label.textContent = label.textContent.replace(/\s+/g, ' ').trim().replace(/\s*:$/, '');
        var box = tile(label, value, index === 0);
        mover.tiles.append(box);
        row.classList.add('gl-op-skip');
        syncs.push(function () { box.hidden = row.hidden || row.classList.contains('hidden') || row.style.display === 'none'; });
        if ('MutationObserver' in window) {
          new MutationObserver(moverUpdate).observe(row, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
          new MutationObserver(moverUpdate).observe(value, { childList: true, characterData: true, subtree: true });
        }
      });
      moverCard.append(mover.cell);
      updateMover();
    }

    // ---- Stopped array: "Maintenance mode" has a row of its own under Start. Its checkbox moves
    // into the Start card; it stays in the same form, so Start still sends it.
    var startButton = grid.querySelector('#cmdStart, [name="cmdStart"]');
    var startMode = grid.querySelector('input[type="checkbox"][name="startMode"]');
    var modeRow = startMode && startMode.closest('tr');
    if (startButton && modeRow && !modeRow.contains(startButton) && startButton.form === startMode.form) {
      var label = startMode.closest('label') || startMode;
      var hint = modeRow.lastElementChild ? modeRow.lastElementChild.textContent.replace(/\s+/g, ' ').trim() : '';
      if (hint) label.title = hint;
      label.classList.add('gl-op-option');
      startButton.closest('tr').lastElementChild.append(label);
      modeRow.classList.add('gl-op-skip');
    }

    // ---- Encrypted array, stopped: the key rows (status, input method, passphrase, keyfile) go
    // into one "Encryption" card, in a table of their own inside the same form. Unraid shows and
    // hides #text, #copy, #file and #pass with jQuery, which keeps working on table rows.
    var keyRows = rowsOf().filter(function (row) {
      return row.matches('#text, #copy, #file') ||
        row.querySelector('#pass, #encryption-input, select[name="input"], input[name="text"], input[name="copy"], input[name="local"]');
    });
    if (keyRows.length) {
      var keyCard = el('tr', 'gl-op-keys');
      var keyCell = el('td', 'gl-op-desc');
      var keyTable = el('table', 'gl-op-fields');
      var keyBody = el('tbody');
      keyTable.append(keyBody);
      keyCell.append(keyTable);
      keyCard.append(keyCell);
      keyRows[0].before(keyCard);
      keyRows.forEach(function (row) {
        // The first cell is always empty (the status column).
        if (row.firstElementChild && blankNode(row.firstElementChild)) row.firstElementChild.remove();
        keyBody.append(row);
      });
    }

    // ---- Each remaining row becomes a card.
    var KINDS = [
      ['running', t('Operation in progress', 'Opération en cours'), 'tachometer', '#pauseButton, #cancelButton'],
      ['array', t('Array', 'Matrice'), 'hdd-o', '#stop-button, #cmdStart, [name="cmdStart"], [name="cmdStop"], [name="cmdNoCopy"], [name="cmdNoClear"], [name="cmdCopy"], [name="startMode"]'],
      ['keys', t('Encryption', 'Chiffrement'), 'lock', '.gl-op-fields'],
      ['format', t('Unmountable disks', 'Disques non montables'), 'exclamation-triangle', '[name="cmdFormat"]'],
      ['sync', t('Parity', 'Parité'), 'shield', '[name="cmdCheckSync"], [name="cmdCheckClear"]'],
      ['parity', t('Parity check', 'Contrôle de parité'), 'shield', '[name="cmdCheck"], [name^="cmdCheck"], [name="cmdNoCheck"], [name="optionCorrect"]'],
      ['history', t('Last check', 'Dernier contrôle'), 'history', 'input[onclick*="parityHistory"]'],
      ['disks', t('Disks', 'Disques'), 'refresh', '#spinup-button, #spindown-button'],
      ['stats', t('Statistics', 'Statistiques'), 'eraser', 'input[onclick*="toggle_state(\'Clear\')"]'],
      ['keyfile', t('Encryption key', 'Clé de chiffrement'), 'key', 'form[name="delete_keyfile"] input[name="#apply"]'],
      ['mover', t('Mover', 'Mover'), 'exchange', '#mover-button'],
      ['power', t('Power', 'Alimentation'), 'power-off', '[name="reboot"], [name="shutdown"]']
    ];
    var DANGER = '#stop-button, [name="cmdStop"], #cancelButton, [name="cmdNoCopy"], [name="cmdNoClear"], [name="cmdFormat"], ' +
      '[name="reboot"], [name="shutdown"], form[name="delete_keyfile"] input[name="#apply"]';
    var PRIMARY = '#cmdStart, [name="cmdStart"], [name="cmdCheck"], [name="cmdCheckSync"], [name="cmdCheckClear"], [name="cmdCopy"], #mover-button';
    // For rows added by plugins, whose buttons have no known id or name.
    var DANGER_LABEL = /^(stop|reboot|shutdown|cancel|arr[êe]ter|red[ée]marrer|[ée]teindre|annuler)$/i;
    var PRIMARY_LABEL = /^(start|check|move|resume|d[ée]marrer|v[ée]rifier|d[ée]placer|reprendre)$/i;
    var blank = function (cell) { return !cell.id && blankNode(cell); };
    var running = Boolean(grid.querySelector('#pauseButton, #cancelButton'));

    // A checkbox followed by its text (Unraid writes <input type=checkbox><small>text</small>)
    // gets a label around both, so the text can be clicked too.
    function labelOptions(cell) {
      Array.prototype.slice.call(cell.querySelectorAll(':scope > input[type="checkbox"]')).forEach(function (box) {
        var label = el('label', 'gl-op-option');
        box.before(label);
        label.append(box);
        for (var sibling = label.nextSibling; sibling && !(sibling.nodeType === 1 && sibling.matches('br, input, label, a, div'));) {
          var following = sibling.nextSibling;
          label.append(sibling);
          sibling = following;
        }
      });
      Array.prototype.forEach.call(cell.querySelectorAll('label'), function (label) {
        if (label.querySelector('input[type="checkbox"]')) label.classList.add('gl-op-option');
      });
    }

    rowsOf().forEach(function (row) {
      var cells = Array.prototype.slice.call(row.children);
      if (row.classList.contains('gl-op-skip') || row.querySelector(':scope > td.line') || cells.every(blank)) {
        row.classList.add('gl-op-skip');
        return;
      }
      var kind = null;
      for (var i = 0; i < KINDS.length && !kind; i++) if (row.querySelector(KINDS[i][3])) kind = KINDS[i].slice();
      if (!kind) {
        var strong = row.querySelector('td:last-child strong, td:last-child b');
        var button = row.querySelector('input[type="button"], input[type="submit"], button');
        kind = row.querySelector('.gl-op-stats')
          ? ['running', t('Progress', 'Progression'), 'tachometer']
          : ['other', (strong && strong.textContent.trim()) || (button && button.value) || t('Action', 'Action'), 'cog'];
      }
      if (kind[0] === 'running') {
        // "Parity-Check in progress." gives the card its title.
        var state = cells[0] ? cells[0].textContent.replace(/\s+/g, ' ').trim().replace(/\s+(in progress|en cours)\.?$/i, '') : '';
        if (state && state.length <= 40) kind[1] = state;
      }
      if (kind[0] === 'history' && (running || !row.querySelector('i.fa-clock-o, i.fa-dot-circle-o, i.fa-search'))) {
        kind[1] = t('History', 'Historique');
      }

      row.classList.add('gl-op', 'gl-op-' + kind[0]);
      if (kind[0] === 'keys') {
        cells[0].classList.add('gl-op-body');
      } else {
        var roles = cells.length >= 3 ? ['state', 'actions', 'desc'] : ['actions', 'desc'];
        var index = 0;
        cells.forEach(function (cell) {
          if (cell.classList.contains('gl-op-stats')) return;
          cell.classList.add('gl-op-' + (roles[index] || 'desc'));
          index++;
          if (blank(cell)) cell.classList.add('gl-op-blank');
        });
      }
      var head = el('td', 'gl-op-head');
      var icon = el('span', 'gl-op-icon');
      icon.setAttribute('aria-hidden', 'true');
      icon.append(el('i', 'fa fa-' + kind[2]));
      head.append(icon, el('span', 'gl-op-title', kind[1]));
      row.prepend(head);

      var desc = row.querySelector(':scope > td.gl-op-desc');
      if (desc) labelOptions(desc);
      row.querySelectorAll('input[type="button"], input[type="submit"], button').forEach(function (button) {
        if (button.matches(DANGER)) button.classList.add('gl-op-danger');
        else if (button.matches(PRIMARY)) button.classList.add('gl-op-primary');
        else if (!button.id && !button.name) {
          if (DANGER_LABEL.test(button.value.trim())) button.classList.add('gl-op-danger');
          else if (PRIMARY_LABEL.test(button.value.trim())) button.classList.add('gl-op-primary');
        }
      });

      var stateCell = row.querySelector(':scope > td.gl-op-state:not(.gl-op-blank)');
      if (kind[0] === 'array' && stateCell) {
        var orb = stateCell.querySelector('i.orb');
        var tone = !orb ? '' : orb.classList.contains('green-orb') ? 'success' : orb.classList.contains('yellow-orb') ? 'warn'
          : orb.classList.contains('red-orb') ? 'danger' : 'off';
        stateCell.classList.add('gl-op-pill');
        if (tone) stateCell.classList.add('gl-op-tone-' + tone);
      } else if (kind[0] === 'parity' && stateCell) {
        stateCell.classList.add('gl-op-pill', /invalid|error|disabled|erreur|d[ée]sactiv/i.test(stateCell.textContent) ? 'gl-op-tone-warn' : 'gl-op-tone-success', 'gl-op-mark');
      } else if (kind[0] === 'running' && stateCell) {
        stateCell.classList.add('gl-op-pill', 'gl-op-tone-accent', 'gl-op-spin');
      } else if (kind[0] === 'format' && stateCell) {
        stateCell.classList.add('gl-op-list');
      }
    });

    grid.classList.add('gl-ops-ready');
  });
})();
