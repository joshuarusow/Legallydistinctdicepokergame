# Legally Distinct Dice Poker Game

A scorecard webapp for the classic five-dice poker game. Everyone at the table
opens it on their own phone (via link or QR code) and scores their own hands —
the app does all the math.

## Features

- **Accurate autoscoring** — enter your five dice, tap a category, done.
  - Upper-section bonus (+35 at 63 or more) tracked automatically
  - Extra Yahtzee bonuses (+100 each) awarded automatically
  - Official **Joker rules** enforced: a repeat five-of-a-kind forces the
    matching upper box, then any lower box at joker values (Full House 25,
    Small Straight 30, Large Straight 40), then zero in an upper box
  - Strict category scoring (a four-of-a-kind is not a full house, etc.)
- **Multiple players per device** — tabs across the top, add as many as you like
- **Share modal** — built-in QR code (no external services) plus copy-link and
  native share, so friends can open their own scorecard instantly
- **Persistent** — game state survives refreshes and closed tabs (localStorage)
- **Undo** — take back the last score if you fat-finger a category
- **Works offline** once loaded; mobile-first layout with light and dark themes
- **Zero dependencies** — plain HTML/CSS/JS, nothing to build

## Hosting

It's a fully static site — any static host works.

### GitHub Pages (recommended)

1. In the repository settings, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` — the included workflow (`.github/workflows/deploy-pages.yml`)
   publishes the site to `https://<user>.github.io/<repo>/`.

Then open the site, tap **Share**, and let friends scan the QR code.

## Development

No build step. Serve the directory and open it:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

### Tests

The scoring engine is a pure module (`js/scoring.js`) with a Node test suite
covering every category, the upper bonus boundary, Yahtzee bonuses, and all
Joker-rule branches:

```sh
node tests/scoring.test.js
```

The QR encoder (`js/qr.js`, written from the ISO/IEC 18004 spec) is verified by
round-tripping generated codes through a real decoder:

```sh
pip install zxing-cpp pillow
python3 tests/qr_verify.py
```

Both run in CI on every push (`.github/workflows/test.yml`).

## Scoring reference

| Category | Score |
| --- | --- |
| Aces–Sixes | Sum of matching dice |
| Upper bonus | +35 if upper subtotal ≥ 63 |
| 3 / 4 of a Kind | Sum of **all** dice |
| Full House | 25 |
| Small Straight (run of 4) | 30 |
| Large Straight (run of 5) | 40 |
| Yahtzee (5 of a kind) | 50 |
| Chance | Sum of all dice |
| Extra Yahtzee bonus | +100 each (only if the Yahtzee box holds 50) |
