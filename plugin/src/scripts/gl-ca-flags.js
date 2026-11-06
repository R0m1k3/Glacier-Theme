/*
 * Glacier Theme: CA's status flags (Installed, Official, Updated...) inside their card.
 *
 * Depending on its version, CA writes the flag inside the card, right after it, or after it with
 * other elements in between; the stylesheet can only pin the pill into the card's corner when the
 * flag is a child of the card (glacier.css, "CA's status flag"). Each flag that is not is moved
 * into the card it belongs to: the card it sits in, else the nearest card before it.
 */
(function () {
  'use strict';

  var G = window.Glacier;
  if (!G) return;

  var CARD = '.ca_holder, .dockerHubHolder';
  var FLAG = '.installedCardBackground, .betaCardBackground, .warningCardBackground, .greenCardBackground, ' +
    '.officialCardBackground, .LTOfficialCardBackground, .spotlightCardBackground';

  function cardOf(flag) {
    var card = flag.parentElement && flag.parentElement.closest(CARD);
    if (card) return card;
    for (var node = flag.previousElementSibling; node; node = node.previousElementSibling) {
      if (node.matches(CARD)) return node;
      if (node.matches(FLAG)) return null; // that card already has its flag
    }
    return null;
  }

  function place() {
    document.querySelectorAll(FLAG).forEach(function (flag) {
      var parent = flag.parentElement;
      if (parent && parent.matches(CARD)) return;
      var card = cardOf(flag);
      if (card) card.appendChild(flag);
    });
  }

  G.feature('ca-flags', function () {
    if (!/^\/Apps/i.test(location.pathname) && !document.querySelector(CARD)) return;
    G.watch(document.body, place, { wait: 50 });
  });
})();
