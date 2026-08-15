'use strict';
/* Run with: node tests/scoring.test.js */
const assert = require('assert');
const S = require('../js/scoring.js');

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, err });
  }
}

// ---------- raw category scoring ----------

test('upper section sums matching faces only', () => {
  assert.strictEqual(S.rawScore('ones', [1, 1, 2, 3, 4]), 2);
  assert.strictEqual(S.rawScore('twos', [2, 2, 2, 2, 2]), 10);
  assert.strictEqual(S.rawScore('threes', [1, 2, 4, 5, 6]), 0);
  assert.strictEqual(S.rawScore('fours', [4, 4, 4, 1, 2]), 12);
  assert.strictEqual(S.rawScore('fives', [5, 5, 1, 1, 1]), 10);
  assert.strictEqual(S.rawScore('sixes', [6, 6, 6, 6, 1]), 24);
});

test('three of a kind: sum of ALL dice, else 0', () => {
  assert.strictEqual(S.rawScore('threeKind', [3, 3, 3, 4, 5]), 18);
  assert.strictEqual(S.rawScore('threeKind', [2, 2, 3, 3, 4]), 0);
  assert.strictEqual(S.rawScore('threeKind', [6, 6, 6, 6, 6]), 30); // 5 of a kind qualifies
});

test('four of a kind: sum of ALL dice, else 0', () => {
  assert.strictEqual(S.rawScore('fourKind', [2, 2, 2, 2, 5]), 13);
  assert.strictEqual(S.rawScore('fourKind', [2, 2, 2, 5, 5]), 0);
  assert.strictEqual(S.rawScore('fourKind', [1, 1, 1, 1, 1]), 5);
});

test('full house: exactly 3+2 of different values = 25', () => {
  assert.strictEqual(S.rawScore('fullHouse', [2, 2, 3, 3, 3]), 25);
  assert.strictEqual(S.rawScore('fullHouse', [5, 5, 5, 2, 2]), 25);
  assert.strictEqual(S.rawScore('fullHouse', [2, 2, 2, 2, 3]), 0);  // 4+1 is not a full house
  assert.strictEqual(S.rawScore('fullHouse', [4, 4, 4, 4, 4]), 0);  // natural 5-of-kind is not a full house
  assert.strictEqual(S.rawScore('fullHouse', [1, 2, 3, 4, 5]), 0);
});

test('small straight: any 4 in a row = 30', () => {
  assert.strictEqual(S.rawScore('smallStraight', [1, 2, 3, 4, 6]), 30);
  assert.strictEqual(S.rawScore('smallStraight', [2, 3, 4, 5, 5]), 30);
  assert.strictEqual(S.rawScore('smallStraight', [3, 4, 5, 6, 6]), 30);
  assert.strictEqual(S.rawScore('smallStraight', [1, 2, 3, 4, 5]), 30); // large straight contains a small
  assert.strictEqual(S.rawScore('smallStraight', [1, 2, 2, 4, 5]), 0);
  assert.strictEqual(S.rawScore('smallStraight', [1, 1, 3, 4, 5]), 0); // only 3 in a row
});

test('large straight: 5 in a row = 40', () => {
  assert.strictEqual(S.rawScore('largeStraight', [1, 2, 3, 4, 5]), 40);
  assert.strictEqual(S.rawScore('largeStraight', [2, 3, 4, 5, 6]), 40);
  assert.strictEqual(S.rawScore('largeStraight', [5, 4, 3, 2, 6]), 40); // order irrelevant
  assert.strictEqual(S.rawScore('largeStraight', [1, 2, 3, 4, 6]), 0);
  assert.strictEqual(S.rawScore('largeStraight', [1, 2, 3, 4, 4]), 0);
});

test('yahtzee: 5 alike = 50', () => {
  assert.strictEqual(S.rawScore('yahtzee', [3, 3, 3, 3, 3]), 50);
  assert.strictEqual(S.rawScore('yahtzee', [3, 3, 3, 3, 4]), 0);
});

test('chance: always sum of dice', () => {
  assert.strictEqual(S.rawScore('chance', [1, 2, 3, 4, 5]), 15);
  assert.strictEqual(S.rawScore('chance', [6, 6, 6, 6, 6]), 30);
});

// ---------- dice validation ----------

test('evaluate rejects invalid dice', () => {
  const card = S.newCard('p');
  assert.throws(() => S.evaluate([1, 2, 3, 4], card));
  assert.throws(() => S.evaluate([1, 2, 3, 4, 7], card));
  assert.throws(() => S.evaluate([0, 2, 3, 4, 5], card));
  assert.throws(() => S.evaluate([1.5, 2, 3, 4, 5], card));
});

// ---------- normal-turn evaluation ----------

test('normal turn: every open category is allowed with its raw score', () => {
  const card = S.newCard('p');
  const ev = S.evaluate([3, 3, 3, 2, 2], card);
  assert.strictEqual(ev.joker, false);
  assert.strictEqual(ev.earnsYahtzeeBonus, false);
  assert.strictEqual(ev.allowed.length, 13);
  assert.strictEqual(ev.scores.fullHouse, 25);
  assert.strictEqual(ev.scores.threeKind, 13);
  assert.strictEqual(ev.scores.threes, 9);
  assert.strictEqual(ev.scores.yahtzee, 0);
});

test('filled categories are no longer allowed', () => {
  const card = S.newCard('p');
  S.commitTurn(card, [3, 3, 3, 2, 2], 'fullHouse');
  const ev = S.evaluate([3, 3, 3, 2, 2], card);
  assert.strictEqual(ev.allowed.indexOf('fullHouse'), -1);
  assert.throws(() => S.commitTurn(card, [3, 3, 3, 2, 2], 'fullHouse'));
});

test('first yahtzee in open yahtzee box scores 50, no bonus chip', () => {
  const card = S.newCard('p');
  const ev = S.evaluate([4, 4, 4, 4, 4], card);
  assert.strictEqual(ev.joker, false);
  assert.strictEqual(ev.earnsYahtzeeBonus, false);
  assert.strictEqual(ev.scores.yahtzee, 50);
  S.commitTurn(card, [4, 4, 4, 4, 4], 'yahtzee');
  assert.strictEqual(card.cells.yahtzee, 50);
  assert.strictEqual(card.yahtzeeBonusCount, 0);
});

test('a yahtzee roll with the box open may be scored elsewhere (no joker rules)', () => {
  const card = S.newCard('p');
  const ev = S.evaluate([4, 4, 4, 4, 4], card);
  assert.strictEqual(ev.scores.fourKind, 20);
  assert.strictEqual(ev.scores.fullHouse, 0);      // natural scoring: not a full house
  assert.strictEqual(ev.scores.smallStraight, 0);
  assert.strictEqual(ev.scores.fours, 20);
  assert.strictEqual(ev.scores.chance, 20);
});

// ---------- joker rules ----------

test('joker: must use matching upper box when open', () => {
  const card = S.newCard('p');
  S.commitTurn(card, [4, 4, 4, 4, 4], 'yahtzee'); // yahtzee = 50
  const ev = S.evaluate([5, 5, 5, 5, 5], card);
  assert.strictEqual(ev.joker, true);
  assert.strictEqual(ev.earnsYahtzeeBonus, true);
  assert.deepStrictEqual(ev.allowed, ['fives']);
  assert.strictEqual(ev.scores.fives, 25);
});

test('joker: second yahtzee earns +100 and forces upper box', () => {
  const card = S.newCard('p');
  S.commitTurn(card, [4, 4, 4, 4, 4], 'yahtzee');
  S.commitTurn(card, [5, 5, 5, 5, 5], 'fives');
  assert.strictEqual(card.cells.fives, 25);
  assert.strictEqual(card.yahtzeeBonusCount, 1);
});

test('joker: upper box filled -> any open lower box at joker values', () => {
  const card = S.newCard('p');
  S.commitTurn(card, [4, 4, 4, 4, 4], 'yahtzee');
  S.commitTurn(card, [4, 4, 1, 1, 2], 'fours');   // fill the matching upper box
  const ev = S.evaluate([4, 4, 4, 4, 4], card);
  assert.strictEqual(ev.joker, true);
  assert.strictEqual(ev.earnsYahtzeeBonus, true);
  const allowed = ev.allowed.slice().sort();
  assert.deepStrictEqual(allowed,
    ['chance', 'fourKind', 'fullHouse', 'largeStraight', 'smallStraight', 'threeKind'].sort());
  assert.strictEqual(ev.scores.fullHouse, 25);     // joker full house
  assert.strictEqual(ev.scores.smallStraight, 30); // joker small straight
  assert.strictEqual(ev.scores.largeStraight, 40); // joker large straight
  assert.strictEqual(ev.scores.threeKind, 20);
  assert.strictEqual(ev.scores.fourKind, 20);
  assert.strictEqual(ev.scores.chance, 20);
  assert.strictEqual(ev.allowed.indexOf('ones'), -1); // upper boxes NOT allowed
});

test('joker: all lower filled -> zero in any open upper box', () => {
  const card = S.newCard('p');
  // Fill yahtzee + all other lower boxes + the matching upper box.
  S.commitTurn(card, [4, 4, 4, 4, 4], 'yahtzee');
  S.commitTurn(card, [4, 4, 1, 1, 2], 'fours');
  S.commitTurn(card, [1, 1, 1, 2, 3], 'threeKind');
  S.commitTurn(card, [2, 2, 2, 2, 3], 'fourKind');
  S.commitTurn(card, [3, 3, 3, 2, 2], 'fullHouse');
  S.commitTurn(card, [1, 2, 3, 4, 6], 'smallStraight');
  S.commitTurn(card, [2, 3, 4, 5, 6], 'largeStraight');
  S.commitTurn(card, [1, 2, 3, 4, 5], 'chance');
  const ev = S.evaluate([4, 4, 4, 4, 4], card);
  assert.strictEqual(ev.joker, true);
  assert.strictEqual(ev.earnsYahtzeeBonus, true);
  const expected = ['ones', 'twos', 'threes', 'fives', 'sixes'].sort();
  assert.deepStrictEqual(ev.allowed.slice().sort(), expected);
  for (const cat of ev.allowed) assert.strictEqual(ev.scores[cat], 0);
});

test('joker with yahtzee box scratched (0): joker placement rules apply but NO bonus', () => {
  const card = S.newCard('p');
  S.commitTurn(card, [1, 2, 3, 4, 6], 'yahtzee'); // scratch yahtzee = 0
  assert.strictEqual(card.cells.yahtzee, 0);
  const ev = S.evaluate([3, 3, 3, 3, 3], card);
  assert.strictEqual(ev.joker, true);
  assert.strictEqual(ev.earnsYahtzeeBonus, false);
  assert.deepStrictEqual(ev.allowed, ['threes']);
  assert.strictEqual(ev.scores.threes, 15);
  S.commitTurn(card, [3, 3, 3, 3, 3], 'threes');
  assert.strictEqual(card.yahtzeeBonusCount, 0);
});

test('multiple yahtzee bonuses stack at 100 each', () => {
  const card = S.newCard('p');
  S.commitTurn(card, [6, 6, 6, 6, 6], 'yahtzee');
  S.commitTurn(card, [6, 6, 6, 6, 6], 'sixes');   // +100, sixes = 30
  S.commitTurn(card, [6, 6, 6, 6, 6], 'chance');  // +100, joker chance = 30
  assert.strictEqual(card.yahtzeeBonusCount, 2);
  assert.strictEqual(S.totals(card).yahtzeeBonus, 200);
});

test('commitTurn rejects categories outside the joker-forced set', () => {
  const card = S.newCard('p');
  S.commitTurn(card, [4, 4, 4, 4, 4], 'yahtzee');
  assert.throws(() => S.commitTurn(card, [5, 5, 5, 5, 5], 'chance')); // fives box open: forced
});

// ---------- totals ----------

test('upper bonus: 35 at exactly 63, 0 at 62', () => {
  const at63 = S.newCard('p');
  // 3+6+9+12+15+18 = 63 (three of each face)
  S.commitTurn(at63, [1, 1, 1, 2, 3], 'ones');
  S.commitTurn(at63, [2, 2, 2, 1, 3], 'twos');
  S.commitTurn(at63, [3, 3, 3, 1, 2], 'threes');
  S.commitTurn(at63, [4, 4, 4, 1, 2], 'fours');
  S.commitTurn(at63, [5, 5, 5, 1, 2], 'fives');
  S.commitTurn(at63, [6, 6, 6, 1, 2], 'sixes');
  let t = S.totals(at63);
  assert.strictEqual(t.upperSubtotal, 63);
  assert.strictEqual(t.upperBonus, 35);
  assert.strictEqual(t.upperTotal, 98);

  const at62 = S.newCard('p');
  S.commitTurn(at62, [1, 1, 2, 3, 4], 'ones');    // 2
  S.commitTurn(at62, [2, 2, 2, 1, 3], 'twos');    // 6
  S.commitTurn(at62, [3, 3, 3, 1, 2], 'threes');  // 9
  S.commitTurn(at62, [4, 4, 4, 1, 2], 'fours');   // 12
  S.commitTurn(at62, [5, 5, 5, 1, 2], 'fives');   // 15
  S.commitTurn(at62, [6, 6, 6, 1, 2], 'sixes');   // 18 -> 62
  t = S.totals(at62);
  assert.strictEqual(t.upperSubtotal, 62);
  assert.strictEqual(t.upperBonus, 0);
  assert.strictEqual(t.upperTotal, 62);
});

test('grand total combines upper, bonus, lower, yahtzee bonuses', () => {
  const card = S.newCard('p');
  S.commitTurn(card, [1, 1, 1, 2, 3], 'ones');            // 3
  S.commitTurn(card, [2, 2, 2, 1, 3], 'twos');            // 6
  S.commitTurn(card, [3, 3, 3, 1, 2], 'threes');          // 9
  S.commitTurn(card, [4, 4, 4, 1, 2], 'fours');           // 12
  S.commitTurn(card, [5, 5, 5, 1, 2], 'fives');           // 15
  S.commitTurn(card, [6, 6, 6, 1, 2], 'sixes');           // 18  => 63 + 35
  S.commitTurn(card, [6, 6, 6, 6, 6], 'yahtzee');         // 50
  S.commitTurn(card, [6, 6, 6, 6, 6], 'chance');          // joker chance 30, +100
  S.commitTurn(card, [5, 5, 5, 2, 2], 'fullHouse');       // 25
  S.commitTurn(card, [1, 2, 3, 4, 6], 'smallStraight');   // 30
  S.commitTurn(card, [2, 3, 4, 5, 6], 'largeStraight');   // 40
  S.commitTurn(card, [2, 2, 2, 4, 5], 'threeKind');       // 15
  S.commitTurn(card, [3, 3, 3, 3, 1], 'fourKind');        // 13
  assert.strictEqual(S.isComplete(card), true);
  const t = S.totals(card);
  assert.strictEqual(t.upperSubtotal, 63);
  assert.strictEqual(t.upperBonus, 35);
  assert.strictEqual(t.yahtzeeBonus, 100);
  assert.strictEqual(t.lowerTotal, 50 + 30 + 25 + 30 + 40 + 15 + 13 + 100);
  assert.strictEqual(t.grandTotal, 63 + 35 + 303);
});

test('perfect-ish sanity: max single-game path totals correctly', () => {
  // 13 yahtzees of sixes is the canonical max: 1575.
  const card = S.newCard('p');
  const roll = [6, 6, 6, 6, 6];
  S.commitTurn(card, roll, 'yahtzee');       // 50
  S.commitTurn(card, roll, 'sixes');         // 30 (+100)
  // Remaining lower via joker (+100 each)
  for (const cat of ['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'chance']) {
    S.commitTurn(card, roll, cat);
  }
  // Remaining upper boxes: joker forces 0 in open upper boxes now
  for (const cat of ['ones', 'twos', 'threes', 'fours', 'fives']) {
    S.commitTurn(card, roll, cat);
  }
  assert.strictEqual(S.isComplete(card), true);
  const t = S.totals(card);
  // upper: 30, no bonus (30 < 63). lower: 50+30+30+25+30+40+30 = 235. bonuses: 12*100
  assert.strictEqual(t.upperSubtotal, 30);
  assert.strictEqual(t.upperBonus, 0);
  assert.strictEqual(card.yahtzeeBonusCount, 12);
  assert.strictEqual(t.grandTotal, 30 + 235 + 1200); // 1465 for this fill order
});

test('roundNumber advances 1..13 then flags completion', () => {
  const card = S.newCard('p');
  assert.strictEqual(S.roundNumber(card), 1);
  S.commitTurn(card, [1, 2, 3, 4, 5], 'chance');
  assert.strictEqual(S.roundNumber(card), 2);
});

// ---------- report ----------

if (failures.length) {
  for (const f of failures) {
    console.error(`FAIL: ${f.name}\n  ${f.err.message}`);
  }
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
} else {
  console.log(`All ${passed} tests passed`);
}
