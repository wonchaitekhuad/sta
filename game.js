// game.js - Klondike Solitaire (patched, debug-ready)
// Click-to-move implementation with Undo, Hint, Stock/Waste, Foundations, Tableau.
// Improvements: z-index per card, safe stock reset, consistent history pushes,
// exposed debug API (window._sol).

document.addEventListener('DOMContentLoaded', () => {
  const SUITS = ['♠','♥','♦','♣'];
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  // DOM
  const stockEl = document.getElementById('stock');
  const wasteEl = document.getElementById('waste');
  const foundationsEls = Array.from(document.querySelectorAll('.foundation'));
  const tableauEl = document.getElementById('tableau');
  const newBtn = document.getElementById('newBtn');
  const undoBtn = document.getElementById('undoBtn');
  const hintBtn = document.getElementById('hintBtn');
  const statusEl = document.getElementById('status');

  // State
  let deck = [];
  let stock = [];
  let waste = [];
  let foundations = [[],[],[],[]];
  let tableau = [[],[],[],[],[],[],[]];
  let history = [];
  let selected = null; // { type:'waste'|'tableau', pile, index }
  let gameOver = false;

  // Helpers
  function cloneState() {
    return {
      stock: JSON.parse(JSON.stringify(stock)),
      waste: JSON.parse(JSON.stringify(waste)),
      foundations: JSON.parse(JSON.stringify(foundations)),
      tableau: JSON.parse(JSON.stringify(tableau))
    };
  }
  function pushHistory() {
    history.push(cloneState());
    if (history.length > 300) history.shift();
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  function rankValue(rank) {
    if (rank === 'A') return 1;
    if (rank === 'J') return 11;
    if (rank === 'Q') return 12;
    if (rank === 'K') return 13;
    return parseInt(rank, 10);
  }
  function colorOf(suit) {
    return (suit === '♥' || suit === '♦') ? 'red' : 'black';
  }
  function setStatus(txt) {
    if (statusEl) statusEl.textContent = 'สถานะ: ' + txt;
  }

  // Deck and deal
  function makeDeck() {
    const d = [];
    for (const s of SUITS) {
      for (const r of RANKS) {
        d.push({ suit: s, rank: r, faceUp: false, id: s + r + Math.random().toString(36).slice(2,7) });
      }
    }
    return d;
  }

  function dealNew() {
    deck = makeDeck();
    shuffle(deck);
    stock = [];
    waste = [];
    foundations = [[],[],[],[]];
    tableau = [[],[],[],[],[],[],[]];
    history = [];
    selected = null;
    gameOver = false;

    let idx = 0;
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j <= i; j++) {
        const card = deck[idx++];
        card.faceUp = (j === i);
        tableau[i].push(card);
      }
    }
    while (idx < deck.length) {
      const c = deck[idx++];
      c.faceUp = false;
      stock.push(c);
    }

    pushHistory();
    render();
    setStatus('แจกไพ่แล้ว - เริ่มเล่นได้');
    console.log('dealNew:', { stock: stock.length, tableau: tableau.map(p=>p.length) });
  }

  // Rendering
  function clearChildren(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function createCardElement(card) {
    const el = document.createElement('div');
    el.className = 'card ' + (card.faceUp ? (colorOf(card.suit) === 'red' ? 'red' : 'black') : 'back');
    if (card.id) el.dataset.id = card.id;
    if (card.suit) el.dataset.suit = card.suit;
    if (card.rank) el.dataset.rank = card.rank;
    if (card.faceUp) {
      const top = document.createElement('div'); top.className = 'corner'; top.textContent = card.rank + card.suit;
      const bot = document.createElement('div'); bot.className = 'corner'; bot.textContent = card.rank + card.suit;
      el.appendChild(top);
      el.appendChild(bot);
    } else {
      el.textContent = '★';
    }
    el.style.pointerEvents = 'auto';
    return el;
  }

  function render() {
    if (!tableauEl) {
      console.error('render: tableau not found');
      return;
    }

    // Stock
    clearChildren(stockEl);
    stockEl.classList.remove('empty');
    if (stock.length > 0) {
      const backEl = createCardElement({ faceUp: false });
      backEl.classList.add('back');
      backEl.style.zIndex = 10;
      stockEl.appendChild(backEl);
    } else {
      stockEl.classList.add('empty');
      stockEl.innerHTML = '';
    }

    // Waste
    clearChildren(wasteEl);
    if (waste.length > 0) {
      const top = waste[waste.length - 1];
      const el = createCardElement(top);
      el.classList.add('top-waste');
      el.style.zIndex = 1000; // ensure waste top is clickable above tableau
      el.addEventListener('click', (e) => { e.stopPropagation(); onCardClick('waste', null, waste.length - 1); });
      wasteEl.appendChild(el);
    }

    // Foundations
    foundationsEls.forEach((fEl, i) => {
      clearChildren(fEl);
      fEl.classList.remove('empty');
      const pile = foundations[i];
      if (pile.length > 0) {
        const top = pile[pile.length - 1];
        const el = createCardElement(top);
        el.style.zIndex = 900;
        el.addEventListener('click', (e) => { e.stopPropagation(); onPileClick('foundation', i); });
        fEl.appendChild(el);
      } else {
        fEl.classList.add('empty');
      }
    });

    // Tableau
    clearChildren(tableauEl);
    for (let i = 0; i < 7; i++) {
      const pileEl = document.createElement('div');
      pileEl.className = 'pile';
      const stack = document.createElement('div');
      stack.className = 'stack';
      const pile = tableau[i];
      const cardH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--card-h')) || 130;
      const offset = Math.min(28, Math.max(20, Math.floor(cardH * 0.18)));
      for (let j = 0; j < pile.length; j++) {
        const card = pile[j];
        const cardEl = createCardElement(card);
        cardEl.style.top = (j * offset) + 'px';
        cardEl.style.zIndex = 200 + j;
        if (card.faceUp) {
          cardEl.addEventListener('click', (e) => {
            e.stopPropagation();
            onCardClick('tableau', i, j);
          });
        }
        stack.appendChild(cardEl);
      }
      pileEl.appendChild(stack);
      pileEl.addEventListener('click', (e) => {
        e.stopPropagation();
        onPileClick('tableau', i);
      });
      tableauEl.appendChild(pileEl);
    }

    // Highlight selected
    document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
    if (selected) {
      if (selected.type === 'waste') {
        const el = wasteEl.querySelector('.card');
        if (el) el.classList.add('selected');
      } else if (selected.type === 'tableau') {
        const pileEl = tableauEl.children[selected.pile];
        if (pileEl) {
          const nodes = pileEl.querySelectorAll('.card');
          for (let k = selected.index; k < nodes.length; k++) {
            if (nodes[k]) nodes[k].classList.add('selected');
          }
        }
      }
    }

    checkWin();
  }

  // Click handlers and moves
  function onCardClick(type, pileIndex, indexInPile) {
    if (gameOver) return;
    console.log('onCardClick', type, pileIndex, indexInPile);
    if (type === 'waste') {
      if (waste.length === 0) return;
      selected = { type: 'waste', pile: null, index: waste.length - 1 };
      render();
    } else if (type === 'tableau') {
      const pile = tableau[pileIndex];
      if (!pile) return;
      if (indexInPile < 0 || indexInPile >= pile.length) return;
      if (!pile[indexInPile].faceUp) return;
      selected = { type: 'tableau', pile: pileIndex, index: indexInPile };
      render();
    }
  }

  function onPileClick(type, idx) {
    if (gameOver) return;
    console.log('onPileClick', type, idx, 'selected=', selected);
    // If there is a selection, try to drop it here
    if (selected) {
      // Foundation drop
      if (type === 'foundation') {
        if (selected.type === 'waste') {
          const card = waste[selected.index];
          if (canMoveToFoundation(card, idx)) {
            pushHistory();
            foundations[idx].push(card);
            waste.pop();
            selected = null;
            flipTopTableauIfNeeded();
            render();
            return;
          }
        } else if (selected.type === 'tableau') {
          const seq = tableau[selected.pile].slice(selected.index);
          if (seq.length === 1 && canMoveToFoundation(seq[0], idx)) {
            pushHistory();
            tableau[selected.pile].splice(selected.index);
            foundations[idx].push(seq[0]);
            selected = null;
            flipTopTableauIfNeeded();
            render();
            return;
          }
        }
      } else if (type === 'tableau') {
        // Tableau drop
        if (selected.type === 'waste') {
          const card = waste[selected.index];
          if (canMoveToTableau(card, idx)) {
            pushHistory();
            tableau[idx].push(card);
            waste.pop();
            selected = null;
            flipTopTableauIfNeeded();
            render();
            return;
          }
        } else if (selected.type === 'tableau') {
          const seq = tableau[selected.pile].slice(selected.index);
          if (canMoveSequenceToTableau(seq, idx, selected.pile)) {
            pushHistory();
            tableau[idx] = tableau[idx].concat(seq);
            tableau[selected.pile].splice(selected.index);
            selected = null;
            flipTopTableauIfNeeded();
            render();
            return;
          }
        }
      }
    }

    // If nothing worked, clear selection
    selected = null;
    render();
  }

  // Move validation
  function canMoveToFoundation(card, fidx) {
    if (!card) return false;
    const pile = foundations[fidx];
    if (pile.length === 0) return card.rank === 'A';
    const top = pile[pile.length - 1];
    return top.suit === card.suit && rankValue(top.rank) + 1 === rankValue(card.rank);
  }

  function canMoveToTableau(card, tIdx) {
    if (!card) return false;
    const pile = tableau[tIdx];
    if (!pile || pile.length === 0) return card.rank === 'K';
    const top = pile[pile.length - 1];
    if (!top.faceUp) return false;
    return colorOf(top.suit) !== colorOf(card.suit) && rankValue(top.rank) === rankValue(card.rank) + 1;
  }

  function canMoveSequenceToTableau(seq, destIndex, fromIndex) {
    if (!seq || seq.length === 0) return false;
    if (fromIndex === destIndex) return false;
    // validate descending alternating colors within sequence
    for (let i = 0; i < seq.length; i++) {
      if (!seq[i].faceUp) return false;
      if (i > 0) {
        const prev = seq[i - 1], cur = seq[i];
        if (!(colorOf(prev.suit) !== colorOf(cur.suit) && rankValue(prev.rank) === rankValue(cur.rank) + 1)) return false;
      }
    }
    // placement rules
    if (tableau[destIndex].length === 0) return seq[0].rank === 'K';
    const top = tableau[destIndex][tableau[destIndex].length - 1];
    if (!top.faceUp) return false;
    return colorOf(top.suit) !== colorOf(seq[0].suit) && rankValue(top.rank) === rankValue(seq[0].rank) + 1;
  }

  // Stock/Waste actions
  function drawFromStock() {
    if (stock.length === 0) {
      if (waste.length === 0) return;
      // reset stock from waste (preserve order when flipping)
      pushHistory();
      stock = waste.slice().reverse().map(c => { c.faceUp = false; return c; });
      waste = [];
      render();
      return;
    }
    pushHistory();
    const card = stock.pop();
    card.faceUp = true;
    waste.push(card);
    render();
  }

  function flipTopTableauIfNeeded() {
    for (let i = 0; i < 7; i++) {
      const pile = tableau[i];
      if (pile.length > 0) {
        const top = pile[pile.length - 1];
        if (!top.faceUp) top.faceUp = true;
      }
    }
  }

  function findHint() {
    if (waste.length > 0) {
      const c = waste[waste.length - 1];
      for (let f = 0; f < 4; f++) if (canMoveToFoundation(c, f)) return { from: { type: 'waste' }, to: { type: 'foundation', index: f } };
    }
    if (waste.length > 0) {
      const c = waste[waste.length - 1];
      for (let t = 0; t < 7; t++) if (canMoveToTableau(c, t)) return { from: { type: 'waste' }, to: { type: 'tableau', index: t } };
    }
    for (let p = 0; p < 7; p++) {
      const pile = tableau[p];
      if (pile.length === 0) continue;
      const c = pile[pile.length - 1];
      if (!c.faceUp) continue;
      for (let f = 0; f < 4; f++) if (canMoveToFoundation(c, f)) return { from: { type: 'tableau', pile: p, index: pile.length - 1 }, to: { type: 'foundation', index: f } };
    }
    for (let p = 0; p < 7; p++) {
      const pile = tableau[p];
      for (let i = 0; i < pile.length; i++) {
        if (!pile[i].faceUp) continue;
        const seq = pile.slice(i);
        for (let t = 0; t < 7; t++) {
          if (t === p) continue;
          if (canMoveSequenceToTableau(seq, t, p)) return { from: { type: 'tableau', pile: p, index: i }, to: { type: 'tableau', index: t } };
        }
      }
    }
    if (stock.length > 0 || waste.length > 0) return { action: 'draw' };
    return null;
  }

  function showHint() {
    const h = findHint();
    if (!h) { setStatus('ไม่มีทางเดินที่ชัดเจน'); return; }
    if (h.action === 'draw') { flash(stockEl); setStatus('Hint: จั่วจาก Stock'); return; }
    if (h.from.type === 'waste') flash(wasteEl);
    else if (h.from.type === 'tableau') {
      const el = tableauEl.children[h.from.pile];
      if (el) flash(el.querySelectorAll('.card')[h.from.index]);
    }
    if (h.to.type === 'foundation') flash(foundationsEls[h.to.index]);
    else if (h.to.type === 'tableau') flash(tableauEl.children[h.to.index]);
    setStatus('Hint แสดงแล้ว');
  }

  function flash(el) {
    if (!el) return;
    if (NodeList.prototype.isPrototypeOf(el) || Array.isArray(el)) el = el[0];
    el.classList.add('hint');
    setTimeout(() => el.classList.remove('hint'), 700);
  }

  function checkWin() {
    const total = foundations.reduce((acc, f) => acc + f.length, 0);
    if (total === 52 && !gameOver) {
      gameOver = true;
      setTimeout(() => alert('ยินดีด้วย! คุณชนะ!'), 200);
      setStatus('ชนะ!');
    }
  }

  // Debug API
  window._sol = {
    dealNew,
    drawFromStock,
    findHint,
    getState: () => ({ stock: stock.slice(), waste: waste.slice(), foundations: JSON.parse(JSON.stringify(foundations)), tableau: JSON.parse(JSON.stringify(tableau)), selected })
  };

  // Bindings
  stockEl && stockEl.addEventListener('click', (e) => { e.preventDefault(); drawFromStock(); });
  foundationsEls.forEach((el, i) => el.addEventListener('click', (e) => { e.stopPropagation(); onPileClick('foundation', i); }));
  newBtn && newBtn.addEventListener('click', () => { dealNew(); setStatus('แจกใหม่'); });
  undoBtn && undoBtn.addEventListener('click', () => {
    if (history.length <= 1) { setStatus('ไม่มีการกระทำให้ย้อน'); return; }
    history.pop();
    const last = history[history.length - 1];
    stock = JSON.parse(JSON.stringify(last.stock));
    waste = JSON.parse(JSON.stringify(last.waste));
    foundations = JSON.parse(JSON.stringify(last.foundations));
    tableau = JSON.parse(JSON.stringify(last.tableau));
    selected = null;
    render();
    setStatus('ย้อนกลับเรียบร้อย');
  });
  hintBtn && hintBtn.addEventListener('click', () => showHint());

  // Start
  dealNew();
});