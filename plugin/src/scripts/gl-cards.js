/*
 * Glacier Theme: wide tables as cards on phones (styles/gl-cards.css).
 *
 * The Plugins list, the VMs list (with the disks, interfaces and snapshots of an open VM) and the
 * Docker list in its "All columns" view have too many columns for a phone. Each cell gets the
 * heading of its column in data-gl-label, which the stylesheet shows above the value once a row
 * is laid out as a card; rows with a cell per column are marked gl-card-row (section headers,
 * placeholders and detail rows are not), and empty cells gl-empty, left out of the card.
 *
 * Only attributes and classes are written, and only when they change, so Unraid's scripts that
 * rebuild these rows keep working and the observer settles after one pass.
 */
(function () {
  'use strict';

  var G = window.Glacier;
  if (!G) return;

  var TABLES = ['plugin_table', 'kvm_table', 'docker_containers'];

  // Cells Glacier adds for the compact Docker list (.gl-extra) are not columns of Unraid's table.
  function cellsOf(row) {
    return Array.prototype.filter.call(row.cells, function (cell) { return !cell.classList.contains('gl-extra'); });
  }

  function headings(head) {
    var row = head && head.rows[0];
    if (!row) return null;
    var names = [];
    cellsOf(row).forEach(function (cell) {
      var text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
      for (var i = 0; i < (cell.colSpan || 1); i += 1) names.push(text);
    });
    return names;
  }

  function isEmpty(cell) {
    return !(cell.textContent || '').replace(/\s+/g, '') && !cell.querySelector('img, input, button, select, i.fa, .switch-button-background');
  }

  function setLabel(cell, name) {
    if (name) {
      if (cell.getAttribute('data-gl-label') !== name) cell.setAttribute('data-gl-label', name);
    } else if (cell.hasAttribute('data-gl-label')) {
      cell.removeAttribute('data-gl-label');
    }
    var empty = isEmpty(cell);
    if (cell.classList.contains('gl-empty') !== empty) cell.classList.toggle('gl-empty', empty);
  }

  // A table can have several thead/tbody pairs (an open VM's disks, interfaces and snapshots):
  // each body takes the headings of the head just before it.
  function label(table) {
    var names = null;
    Array.prototype.forEach.call(table.children, function (part) {
      if (part.tagName === 'THEAD') {
        names = headings(part);
        return;
      }
      if (part.tagName !== 'TBODY' || !names) return;
      Array.prototype.forEach.call(part.rows, function (row) {
        var cells = cellsOf(row);
        var matches = cells.length === names.length;
        if (row.classList.contains('gl-card-row') !== matches) row.classList.toggle('gl-card-row', matches);
        if (!matches) return;
        cells.forEach(function (cell, index) { setLabel(cell, names[index]); });
      });
    });
  }

  G.feature('cards', function () {
    TABLES.forEach(function (id) {
      var table = document.getElementById(id);
      if (!table || table.tagName !== 'TABLE' || table.dataset.glCards) return;
      table.dataset.glCards = '1';
      table.classList.add('gl-cards');
      G.watch(table, function () {
        label(table);
        table.querySelectorAll('table.domdisk').forEach(label);
      });
    });
  });
})();
