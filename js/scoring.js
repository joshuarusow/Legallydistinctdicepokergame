/*
 * Yahtzee scoring engine — pure functions, no DOM.
 * Works as a browser global (YahtzeeScoring) and as a Node module for tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.YahtzeeScoring = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  var LOWER = ['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];
  var ALL = UPPER.concat(LOWER);

  var LABELS = {
    ones: 'Aces (1s)', twos: 'Twos (2s)', threes: 'Threes (3s)',
    fours: 'Fours (4s)', fives: 'Fives (5s)', sixes: 'Sixes (6s)',
    threeKind: '3 of a Kind', fourKind: '4 of a Kind', fullHouse: 'Full House',
    smallStraight: 'Sm. Straight', largeStraight: 'Lg. Straight',
    yahtzee: 'Yahtzee', chance: 'Chance'
  };

  var UPPER_BONUS_THRESHOLD = 63;
  var UPPER_BONUS = 35;
  var YAHTZEE_SCORE = 50;
  var YAHTZEE_BONUS = 100;

  function faceCounts(dice) {
    var c = [0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < dice.length; i++) c[dice[i]]++;
    return c;
  }

  function sum(dice) {
    var s = 0;
    for (var i = 0; i < dice.length; i++) s += dice[i];
    return s;
  }

  function isValidDice(dice) {
    if (!Array.isArray(dice) || dice.length !== 5) return false;
    for (var i = 0; i < 5; i++) {
      if (!Number.isInteger(dice[i]) || dice[i] < 1 || dice[i] > 6) return false;
    }
    return true;
  }

  function isYahtzee(dice) {
    var c = faceCounts(dice);
    for (var f = 1; f <= 6; f++) if (c[f] === 5) return true;
    return false;
  }

  function hasOfAKind(dice, n) {
    var c = faceCounts(dice);
    for (var f = 1; f <= 6; f++) if (c[f] >= n) return true;
    return false;
  }

  function isFullHouse(dice) {
    // Natural full house: exactly three of one value and two of another.
    var c = faceCounts(dice);
    var has3 = false, has2 = false;
    for (var f = 1; f <= 6; f++) {
      if (c[f] === 3) has3 = true;
      if (c[f] === 2) has2 = true;
    }
    return has3 && has2;
  }

  function straightLength(dice) {
    var c = faceCounts(dice);
    var best = 0, run = 0;
    for (var f = 1; f <= 6; f++) {
      if (c[f] > 0) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    return best;
  }

  // Raw score for a category under normal (non-joker) rules.
  function rawScore(cat, dice) {
    var upperIdx = UPPER.indexOf(cat);
    if (upperIdx !== -1) {
      var face = upperIdx + 1;
      return faceCounts(dice)[face] * face;
    }
    switch (cat) {
      case 'threeKind': return hasOfAKind(dice, 3) ? sum(dice) : 0;
      case 'fourKind': return hasOfAKind(dice, 4) ? sum(dice) : 0;
      case 'fullHouse': return isFullHouse(dice) ? 25 : 0;
      case 'smallStraight': return straightLength(dice) >= 4 ? 30 : 0;
      case 'largeStraight': return straightLength(dice) >= 5 ? 40 : 0;
      case 'yahtzee': return isYahtzee(dice) ? YAHTZEE_SCORE : 0;
      case 'chance': return sum(dice);
      default: throw new Error('Unknown category: ' + cat);
    }
  }

  function newCard(name) {
    var cells = {};
    for (var i = 0; i < ALL.length; i++) cells[ALL[i]] = null;
    return { name: name || 'Player', cells: cells, yahtzeeBonusCount: 0 };
  }

  function openCategories(card) {
    return ALL.filter(function (cat) { return card.cells[cat] === null; });
  }

  function isComplete(card) {
    return openCategories(card).length === 0;
  }

  function roundNumber(card) {
    // 1-based round about to be played (14 means game over).
    return ALL.length - openCategories(card).length + 1;
  }

  /*
   * Evaluate a roll against a card, applying official Joker rules.
   *
   * Returns:
   *   allowed  — categories the player may legally score this roll
   *   scores   — map of allowed category -> points it would earn
   *   joker    — true when Joker rules are in force (Yahtzee rolled, Yahtzee box filled)
   *   earnsYahtzeeBonus — true when committing this roll adds a 100-point bonus chip
   */
  function evaluate(dice, card) {
    if (!isValidDice(dice)) throw new Error('Dice must be five values 1-6');
    var open = openCategories(card);
    var yz = isYahtzee(dice);
    var scores = {};
    var i, cat;

    if (yz && card.cells.yahtzee !== null) {
      // Joker rules: Yahtzee rolled but the Yahtzee box is already filled.
      var earnsBonus = card.cells.yahtzee === YAHTZEE_SCORE;
      var face = dice[0];
      var upperCat = UPPER[face - 1];

      // 1. Must use the matching upper box if open.
      if (card.cells[upperCat] === null) {
        scores[upperCat] = face * 5;
        return { allowed: [upperCat], scores: scores, joker: true, earnsYahtzeeBonus: earnsBonus };
      }

      // 2. Otherwise must use any open lower box, at Joker values.
      var lowerOpen = open.filter(function (c) { return LOWER.indexOf(c) !== -1; });
      if (lowerOpen.length > 0) {
        for (i = 0; i < lowerOpen.length; i++) {
          cat = lowerOpen[i];
          if (cat === 'fullHouse') scores[cat] = 25;
          else if (cat === 'smallStraight') scores[cat] = 30;
          else if (cat === 'largeStraight') scores[cat] = 40;
          else scores[cat] = sum(dice); // threeKind, fourKind, chance (yahtzee box is filled)
        }
        return { allowed: lowerOpen, scores: scores, joker: true, earnsYahtzeeBonus: earnsBonus };
      }

      // 3. All lower boxes filled: take zero in any open upper box.
      for (i = 0; i < open.length; i++) scores[open[i]] = 0;
      return { allowed: open.slice(), scores: scores, joker: true, earnsYahtzeeBonus: earnsBonus };
    }

    // Normal turn: any open category, standard scoring.
    for (i = 0; i < open.length; i++) {
      cat = open[i];
      scores[cat] = rawScore(cat, dice);
    }
    return {
      allowed: open.slice(),
      scores: scores,
      joker: false,
      // First Yahtzee scores 50 in the box itself; the 100 bonus only ever
      // applies once the box already holds 50 (handled by the joker branch).
      earnsYahtzeeBonus: false
    };
  }

  /*
   * Commit a roll to a category. Mutates and returns the card.
   * Throws if the category choice is illegal for this roll.
   */
  function commitTurn(card, dice, cat) {
    var ev = evaluate(dice, card);
    if (ev.allowed.indexOf(cat) === -1) {
      throw new Error('Category ' + cat + ' is not a legal choice for this roll');
    }
    card.cells[cat] = ev.scores[cat];
    if (ev.earnsYahtzeeBonus) card.yahtzeeBonusCount++;
    return card;
  }

  function totals(card) {
    var upperSubtotal = 0, lowerTotal = 0;
    var i;
    for (i = 0; i < UPPER.length; i++) upperSubtotal += card.cells[UPPER[i]] || 0;
    for (i = 0; i < LOWER.length; i++) lowerTotal += card.cells[LOWER[i]] || 0;
    var upperBonus = upperSubtotal >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
    var yahtzeeBonus = card.yahtzeeBonusCount * YAHTZEE_BONUS;
    return {
      upperSubtotal: upperSubtotal,
      upperBonus: upperBonus,
      upperTotal: upperSubtotal + upperBonus,
      yahtzeeBonus: yahtzeeBonus,
      lowerTotal: lowerTotal + yahtzeeBonus,
      grandTotal: upperSubtotal + upperBonus + lowerTotal + yahtzeeBonus
    };
  }

  return {
    UPPER: UPPER,
    LOWER: LOWER,
    ALL: ALL,
    LABELS: LABELS,
    UPPER_BONUS_THRESHOLD: UPPER_BONUS_THRESHOLD,
    UPPER_BONUS: UPPER_BONUS,
    YAHTZEE_SCORE: YAHTZEE_SCORE,
    YAHTZEE_BONUS: YAHTZEE_BONUS,
    isValidDice: isValidDice,
    isYahtzee: isYahtzee,
    rawScore: rawScore,
    newCard: newCard,
    openCategories: openCategories,
    isComplete: isComplete,
    roundNumber: roundNumber,
    evaluate: evaluate,
    commitTurn: commitTurn,
    totals: totals
  };
});
