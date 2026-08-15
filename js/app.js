/* Dice Poker Scorecard — UI + state. Depends on js/scoring.js and js/qr.js. */
(function () {
  'use strict';
  var S = window.YahtzeeScoring;
  var STORAGE_KEY = 'dice-poker-scorecard-v1';

  // ---------- state ----------

  var state = load() || freshState();
  var armed = null;        // category awaiting confirm tap
  var toastTimer = null;

  function freshState() {
    return {
      players: [S.newCard('Player 1')],
      active: 0,
      dice: [0, 0, 0, 0, 0], // 0 = unset
      sel: 0,
      history: [[]]          // per-player stack of {cells, yahtzeeBonusCount}
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var st = JSON.parse(raw);
      if (!st || !Array.isArray(st.players) || st.players.length === 0) return null;
      if (!Array.isArray(st.history) || st.history.length !== st.players.length) {
        st.history = st.players.map(function () { return []; });
      }
      if (!Array.isArray(st.dice) || st.dice.length !== 5) st.dice = [0, 0, 0, 0, 0];
      st.active = Math.min(st.active || 0, st.players.length - 1);
      st.sel = Math.min(st.sel || 0, 4);
      return st;
    } catch (e) {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* private mode: play on without persistence */ }
  }

  function player() { return state.players[state.active]; }
  function diceReady() { return state.dice.every(function (d) { return d >= 1; }); }

  // ---------- actions ----------

  function setDie(value) {
    state.dice[state.sel] = value;
    // advance to the next unset die, else next slot
    var next = -1;
    for (var i = 1; i <= 5; i++) {
      var idx = (state.sel + i) % 5;
      if (state.dice[idx] === 0) { next = idx; break; }
    }
    state.sel = next !== -1 ? next : Math.min(state.sel + 1, 4);
    armed = null;
    save();
    render();
  }

  function clearDice() {
    state.dice = [0, 0, 0, 0, 0];
    state.sel = 0;
    armed = null;
    save();
    render();
  }

  function tapCategory(cat) {
    if (!diceReady()) {
      toast('Enter all five dice first');
      return;
    }
    var ev = S.evaluate(state.dice, player());
    if (ev.allowed.indexOf(cat) === -1) return;
    if (armed === cat) {
      commit(cat, ev);
    } else {
      armed = cat;
      render();
    }
  }

  function commit(cat, ev) {
    var card = player();
    state.history[state.active].push({
      cells: JSON.parse(JSON.stringify(card.cells)),
      yahtzeeBonusCount: card.yahtzeeBonusCount
    });
    S.commitTurn(card, state.dice, cat);
    var bonus = ev.earnsYahtzeeBonus;
    state.dice = [0, 0, 0, 0, 0];
    state.sel = 0;
    armed = null;
    save();
    render();
    if (S.isComplete(card)) {
      toast('Game complete! Final score: ' + S.totals(card).grandTotal);
    } else if (bonus) {
      toast('+100 bonus! (' + card.yahtzeeBonusCount * 100 + ' total)');
    } else {
      toast(S.LABELS[cat] + ': ' + ev.scores[cat] + ' points');
    }
  }

  function undo() {
    var stack = state.history[state.active];
    if (stack.length === 0) {
      toast('Nothing to undo');
      return;
    }
    var snap = stack.pop();
    var card = player();
    card.cells = snap.cells;
    card.yahtzeeBonusCount = snap.yahtzeeBonusCount;
    armed = null;
    save();
    render();
    toast('Last score undone');
  }

  function selectPlayer(i) {
    state.active = i;
    armed = null;
    save();
    render();
  }

  function addPlayer() {
    promptModal('Add player', 'Name', 'Player ' + (state.players.length + 1), function (name) {
      if (!name) return;
      state.players.push(S.newCard(name));
      state.history.push([]);
      state.active = state.players.length - 1;
      save();
      render();
    });
  }

  function renamePlayer() {
    promptModal('Rename player', 'Name', player().name, function (name) {
      if (!name) return;
      player().name = name;
      save();
      render();
    });
  }

  function removePlayer() {
    if (state.players.length === 1) {
      toast('At least one player is needed');
      return;
    }
    confirmModal('Remove ' + player().name + '?', 'Their scorecard will be deleted.', function () {
      state.players.splice(state.active, 1);
      state.history.splice(state.active, 1);
      state.active = Math.max(0, state.active - 1);
      save();
      render();
    });
  }

  function newGame() {
    confirmModal('Start a new game?', 'All scorecards on this device will be cleared. Player names are kept.', function () {
      state.players = state.players.map(function (p) { return S.newCard(p.name); });
      state.history = state.players.map(function () { return []; });
      state.dice = [0, 0, 0, 0, 0];
      state.sel = 0;
      armed = null;
      save();
      render();
    });
  }

  // ---------- modals ----------

  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  function modalShell(inner) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '<div class="overlay"><div class="modal">' + inner + '</div></div>';
    root.querySelector('.overlay').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closeModal();
    });
    return root;
  }

  function promptModal(title, placeholder, initial, cb) {
    var root = modalShell(
      '<h3>' + esc(title) + '</h3>' +
      '<input id="modal-input" maxlength="20" placeholder="' + esc(placeholder) + '" value="' + esc(initial) + '">' +
      '<div class="btnrow">' +
      '<button id="modal-cancel">Cancel</button>' +
      '<button class="primary" id="modal-ok">Save</button>' +
      '</div>'
    );
    var input = root.querySelector('#modal-input');
    input.focus();
    input.select();
    function done() {
      var v = input.value.trim();
      closeModal();
      cb(v);
    }
    root.querySelector('#modal-ok').addEventListener('click', done);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(); });
    root.querySelector('#modal-cancel').addEventListener('click', closeModal);
  }

  function confirmModal(title, body, cb) {
    var root = modalShell(
      '<h3>' + esc(title) + '</h3><p>' + esc(body) + '</p>' +
      '<div class="btnrow">' +
      '<button id="modal-cancel">Cancel</button>' +
      '<button class="primary" id="modal-ok">Yes</button>' +
      '</div>'
    );
    root.querySelector('#modal-ok').addEventListener('click', function () { closeModal(); cb(); });
    root.querySelector('#modal-cancel').addEventListener('click', closeModal);
  }

  function shareModal() {
    var url = location.href.split('#')[0];
    var root = modalShell(
      '<h3>Invite your table</h3>' +
      '<p>Friends scan this to open their own scorecard on their phone.</p>' +
      '<canvas id="qr-canvas" width="220" height="220"></canvas>' +
      '<div class="btnrow">' +
      '<button id="copy-link">Copy link</button>' +
      (navigator.share ? '<button class="primary" id="native-share">Share…</button>' : '') +
      '<button id="modal-cancel">Close</button>' +
      '</div>'
    );
    drawQR(root.querySelector('#qr-canvas'), url);
    root.querySelector('#copy-link').addEventListener('click', function () {
      copyText(url);
      toast('Link copied');
    });
    var nat = root.querySelector('#native-share');
    if (nat) {
      nat.addEventListener('click', function () {
        navigator.share({ title: 'Dice Poker Scorecard', url: url }).catch(function () {});
      });
    }
    root.querySelector('#modal-cancel').addEventListener('click', closeModal);
  }

  function menuModal() {
    var root = modalShell(
      '<h3>Menu</h3>' +
      '<div class="btnrow" style="flex-direction:column">' +
      '<button id="m-undo">Undo last score</button>' +
      '<button id="m-rename">Rename player</button>' +
      '<button id="m-remove" class="danger">Remove player</button>' +
      '<button id="m-new" class="danger">New game</button>' +
      '<button id="modal-cancel">Close</button>' +
      '</div>'
    );
    root.querySelector('#m-undo').addEventListener('click', function () { closeModal(); undo(); });
    root.querySelector('#m-rename').addEventListener('click', function () { closeModal(); renamePlayer(); });
    root.querySelector('#m-remove').addEventListener('click', function () { closeModal(); removePlayer(); });
    root.querySelector('#m-new').addEventListener('click', function () { closeModal(); newGame(); });
    root.querySelector('#modal-cancel').addEventListener('click', closeModal);
  }

  function drawQR(canvas, text) {
    var matrix = window.QR.encode(text);
    var n = matrix.length;
    var quiet = 2;
    var total = n + quiet * 2;
    var scale = Math.floor(canvas.width / total) || 1;
    canvas.width = canvas.height = total * scale;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (matrix[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  // ---------- rendering ----------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var PIP_LAYOUTS = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
  };

  function dieHTML(value, index) {
    var cls = 'die' + (index === state.sel ? ' sel' : '');
    var inner = '';
    if (value === 0) {
      inner = '<span class="unset">?</span>';
    } else {
      var pips = PIP_LAYOUTS[value];
      for (var cell = 0; cell < 9; cell++) {
        if (pips.indexOf(cell) !== -1) {
          inner += '<span class="pip" style="grid-area:' + (Math.floor(cell / 3) + 1) + '/' + (cell % 3 + 1) + '"></span>';
        }
      }
    }
    return '<button class="' + cls + '" data-die="' + index + '" aria-label="Die ' + (index + 1) +
      (value ? ', showing ' + value : ', not set') + '">' + inner + '</button>';
  }

  function rowHTML(cat, card, ev, ready) {
    var locked = card.cells[cat] !== null;
    var label = S.LABELS[cat];
    var hints = {
      threeKind: 'Sum of all dice', fourKind: 'Sum of all dice', fullHouse: '25 points',
      smallStraight: 'Run of 4 · 30 pts', largeStraight: 'Run of 5 · 40 pts',
      yahtzee: '5 of a kind · 50 pts', chance: 'Sum of all dice'
    };
    var hint = hints[cat] || '';

    if (locked) {
      return '<div class="row locked"><span class="cat">' + label +
        (hint ? '<small>' + hint + '</small>' : '') + '</span><span class="val">' + card.cells[cat] + '</span></div>';
    }

    var allowed = !ev || ev.allowed.indexOf(cat) !== -1;
    if (ready && !allowed) {
      return '<div class="row open disallowed"><span class="cat">' + label +
        (hint ? '<small>' + hint + '</small>' : '') + '</span><span class="val idle">—</span></div>';
    }

    if (armed === cat && ev) {
      return '<div class="row open armed">' +
        '<span class="cat">' + label + '<small>Confirm score</small></span>' +
        '<button class="cancel" data-cancel="1">Cancel</button>' +
        '<button class="confirm" data-cat="' + cat + '">Score ' + ev.scores[cat] + '</button>' +
        '</div>';
    }

    var valHTML = ready
      ? '<span class="val preview' + (ev.scores[cat] === 0 ? ' zero' : '') + '">' + ev.scores[cat] + '</span>'
      : '<span class="val idle">·</span>';
    return '<button class="row open" data-cat="' + cat + '"><span class="cat">' + label +
      (hint ? '<small>' + hint + '</small>' : '') + '</span>' + valHTML + '</button>';
  }

  function render() {
    var app = document.getElementById('app');
    var card = player();
    var done = S.isComplete(card);
    var ready = diceReady();
    var ev = ready && !done ? S.evaluate(state.dice, card) : null;
    if (armed && (!ev || ev.allowed.indexOf(armed) === -1)) armed = null;
    var t = S.totals(card);
    var html = '';

    // header
    var roundText = done ? 'Game complete' : 'Round ' + S.roundNumber(card) + ' of 13';
    html += '<header class="top">' +
      '<div><h1>Dice Poker Scorecard</h1><div class="sub">' + esc(card.name) + ' · ' + roundText + '</div></div>' +
      '<div class="top-actions">' +
      '<button id="btn-share" aria-label="Share">Share</button>' +
      '<button id="btn-menu" aria-label="Menu">Menu</button>' +
      '</div></header>';

    // player tabs
    html += '<nav class="tabs">';
    state.players.forEach(function (p, i) {
      var pt = S.totals(p);
      html += '<button class="tab' + (i === state.active ? ' active' : '') + '" data-player="' + i + '">' +
        esc(p.name) + '<span class="tab-score">' + pt.grandTotal + '</span></button>';
    });
    html += '<button class="tab add" id="btn-add-player">+ Player</button>';
    html += '</nav>';

    if (done) {
      html += '<div class="fanfare"><div class="big">' + t.grandTotal + '</div>' +
        '<p>' + esc(card.name) + '’s final score</p></div>';
    } else {
      // dice entry
      html += '<section class="dice-panel" aria-label="Dice entry">';
      html += '<div class="dice-row">' + state.dice.map(dieHTML).join('') + '</div>';
      html += '<div class="pad">';
      for (var v = 1; v <= 6; v++) html += '<button data-pad="' + v + '">' + v + '</button>';
      html += '<button class="clear" data-clear="1">Clear</button>';
      html += '</div>';
      html += '<div class="dice-hint">' + (ready
        ? 'Tap a category below to score this roll'
        : 'Roll your dice, then tap 1–6 to enter each die') + '</div>';
      html += '</section>';

      if (ev && ev.joker) {
        var jokerMsg = ev.earnsYahtzeeBonus
          ? 'Bonus five-of-a-kind! +100 points — ' : 'Five of a kind (box already used) — ';
        var forced = ev.allowed.length === 1
          ? 'you must score ' + S.LABELS[ev.allowed[0]]
          : 'score it in a highlighted category';
        html += '<div class="joker-banner">' + jokerMsg + forced + '</div>';
      }
    }

    // upper section
    html += '<section class="board"><h2>Upper Section</h2>';
    S.UPPER.forEach(function (cat) { html += rowHTML(cat, card, ev, ready && !done); });
    html += '<div class="subrow' + (t.upperBonus ? ' bonus-hit' : '') + '"><span>Subtotal (bonus at 63)</span><b>' + t.upperSubtotal + ' / 63</b></div>';
    html += '<div class="subrow' + (t.upperBonus ? ' bonus-hit' : '') + '"><span>Upper bonus</span><b>' + (t.upperBonus ? '+35' : '0') + '</b></div>';
    html += '</section>';

    // lower section
    html += '<section class="board"><h2>Lower Section</h2>';
    S.LOWER.forEach(function (cat) { html += rowHTML(cat, card, ev, ready && !done); });
    html += '<div class="subrow' + (card.yahtzeeBonusCount ? ' bonus-hit' : '') + '"><span>Extra five-of-a-kind bonus' +
      (card.yahtzeeBonusCount ? ' ×' + card.yahtzeeBonusCount : '') + '</span><b>' +
      (card.yahtzeeBonusCount * S.YAHTZEE_BONUS) + '</b></div>';
    html += '</section>';

    app.innerHTML = html;

    // totals bar
    var totalsBar = document.getElementById('totals-bar');
    if (!totalsBar) {
      totalsBar = document.createElement('div');
      totalsBar.id = 'totals-bar';
      totalsBar.className = 'totals';
      document.body.appendChild(totalsBar);
    }
    totalsBar.innerHTML =
      '<div class="t"><div class="n">' + t.upperTotal + '</div><div class="l">Upper</div></div>' +
      '<div class="t"><div class="n">' + t.lowerTotal + '</div><div class="l">Lower</div></div>' +
      '<div class="t"><div class="n">' + t.grandTotal + '</div><div class="l">Total</div></div>';

    wire(app);
  }

  function wire(app) {
    app.querySelectorAll('[data-die]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.sel = parseInt(el.getAttribute('data-die'), 10);
        render();
      });
    });
    app.querySelectorAll('[data-pad]').forEach(function (el) {
      el.addEventListener('click', function () {
        setDie(parseInt(el.getAttribute('data-pad'), 10));
      });
    });
    var clearBtn = app.querySelector('[data-clear]');
    if (clearBtn) clearBtn.addEventListener('click', clearDice);
    app.querySelectorAll('[data-cat]').forEach(function (el) {
      el.addEventListener('click', function () {
        tapCategory(el.getAttribute('data-cat'));
      });
    });
    app.querySelectorAll('[data-cancel]').forEach(function (el) {
      el.addEventListener('click', function () {
        armed = null;
        render();
      });
    });
    app.querySelectorAll('[data-player]').forEach(function (el) {
      el.addEventListener('click', function () {
        selectPlayer(parseInt(el.getAttribute('data-player'), 10));
      });
    });
    var addBtn = app.querySelector('#btn-add-player');
    if (addBtn) addBtn.addEventListener('click', addPlayer);
    app.querySelector('#btn-share').addEventListener('click', shareModal);
    app.querySelector('#btn-menu').addEventListener('click', menuModal);
  }

  // keyboard support (desktop): 1-6 sets dice, backspace clears
  document.addEventListener('keydown', function (e) {
    if (document.querySelector('.overlay')) return;
    if (e.key >= '1' && e.key <= '6') setDie(parseInt(e.key, 10));
    if (e.key === 'Backspace') clearDice();
  });

  render();
})();
