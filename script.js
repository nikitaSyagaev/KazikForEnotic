// ==================== TELEGRAM WEB APP ====================
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0a0a12');
  tg.setBackgroundColor('#0a0a12');
  // Disable vertical swipes to close accidentally while playing
  try { tg.disableVerticalSwipes(); } catch(e) {}
  // Optional: show confirm on close
  tg.enableClosingConfirmation();
}

// ==================== DEFAULT CONFIG ====================
const DEFAULT_SYMBOLS = [
  { id: 'cherry',  emoji: '🍒', weight: 24, payout: 2  },
  { id: 'lemon',   emoji: '🍋', weight: 20, payout: 3  },
  { id: 'orange',  emoji: '🍊', weight: 16, payout: 4  },
  { id: 'plum',    emoji: '🍇', weight: 12, payout: 5  },
  { id: 'bell',    emoji: '🔔', weight: 9,  payout: 8  },
  { id: 'bar',     emoji: '🅱️', weight: 6,  payout: 15 },
  { id: 'seven',   emoji: '7️⃣', weight: 4,  payout: 30 },
  { id: 'diamond', emoji: '💎', weight: 3,  payout: 80 },
];

const BETS = [5, 10, 25, 50, 100];
const INITIAL_BALANCE = 1000;
const REEL_COUNT = 5;
const ROWS = 3;
const REEL_LEN = 50;          // length of spinning strip
const SYMBOL_H = 78;          // must match CSS --symbol-h
const SPIN_MS = [1800, 2200, 2600, 3000, 3400]; // stop times (staggered)
const FREE_SPINS_AWARD = 10;

// 10 paylines (row 0=top, 1=mid, 2=bot)
const PAYLINES = [
  [1,1,1,1,1],
  [0,0,0,0,0],
  [2,2,2,2,2],
  [0,1,2,1,0],
  [2,1,0,1,2],
  [0,0,1,2,2],
  [2,2,1,0,0],
  [1,0,0,0,1],
  [1,2,2,2,1],
  [0,1,1,1,0],
];

// ==================== STATE ====================
let SYMBOLS = JSON.parse(JSON.stringify(DEFAULT_SYMBOLS));
let balance = INITIAL_BALANCE;
let currentBetIndex = 1;
let isSpinning = false;
let freeSpins = 0;
let soundEnabled = true;
let audioCtx = null;
let grid = []; // grid[reel][row] = symbol

// ==================== DOM ====================
const balanceEl       = document.getElementById('balance');
const betValueEl      = document.getElementById('betValue');
const winAmountEl     = document.getElementById('winAmount');
const spinBtn         = document.getElementById('spinBtn');
const betMinus        = document.getElementById('betMinus');
const betPlus         = document.getElementById('betPlus');
const messageOverlay  = document.getElementById('messageOverlay');
const messageTitle    = document.getElementById('messageTitle');
const messageText     = document.getElementById('messageText');
const paytableEl      = document.getElementById('paytable');
const freeSpinsPanel  = document.getElementById('freeSpinsPanel');
const freeSpinsCount  = document.getElementById('freeSpinsCount');
const soundToggle     = document.getElementById('soundToggle');
const reelFrame       = document.getElementById('reelFrame');
const settingsBtn     = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettings   = document.getElementById('closeSettings');
const weightsGrid     = document.getElementById('weightsGrid');
const applyWeights    = document.getElementById('applyWeights');
const resetWeights    = document.getElementById('resetWeights');
const setBalanceBtn   = document.getElementById('setBalanceBtn');
const editBalance     = document.getElementById('editBalance');
const rtpInfo         = document.getElementById('rtpInfo');

let symbolsEls = [];
let reelEls = [];

// ==================== AUDIO ====================
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTone(freq, dur, type = 'square', vol = 0.07) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch (e) {}
}
function playSpinStart() {
  playTone(160, 0.07, 'sawtooth', 0.05);
  setTimeout(() => playTone(210, 0.05, 'sawtooth', 0.04), 35);
}
function playReelStop() {
  playTone(300, 0.06, 'triangle', 0.08);
}
function playWin(big = false) {
  if (!soundEnabled) return;
  const notes = big ? [523, 659, 784, 1047] : [440, 554, 659];
  notes.forEach((f, i) => setTimeout(() => playTone(f, 0.16, 'sine', 0.09), i * 80));
}
function playFreeSpins() {
  if (!soundEnabled) return;
  [392, 494, 587, 784, 988].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.1), i * 100));
}
function playClick() {
  playTone(550, 0.035, 'square', 0.035);
}

// ==================== UTILS ====================
function weightedRandom() {
  const total = SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const s of SYMBOLS) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return SYMBOLS[0];
}
function formatNumber(n) {
  return n.toLocaleString('ru-RU');
}
function updateUI() {
  balanceEl.textContent = formatNumber(balance);
  betValueEl.textContent = BETS[currentBetIndex];
  if (freeSpins > 0) {
    freeSpinsPanel.style.display = 'flex';
    freeSpinsCount.textContent = freeSpins;
    spinBtn.classList.add('free-mode');
    spinBtn.querySelector('.spin-text').textContent = 'FREE';
  } else {
    freeSpinsPanel.style.display = 'none';
    spinBtn.classList.remove('free-mode');
    spinBtn.querySelector('.spin-text').textContent = 'SPIN';
  }
}
function showMessage(title, text, duration = 2200) {
  messageTitle.textContent = title;
  messageText.textContent = text;
  messageOverlay.classList.add('show');
  setTimeout(() => messageOverlay.classList.remove('show'), duration);
}
function estimateRTP() {
  const totalW = SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let lineEV = 0;
  SYMBOLS.forEach(s => {
    const p = Math.pow(s.weight / totalW, 5);
    lineEV += p * s.payout;
  });
  const rtp = Math.min(99, Math.round(70 + lineEV * 180));
  rtpInfo.textContent = `Примерный RTP (оценка): ~${rtp}%`;
}

// ==================== BUILD REELS DOM ====================
function createReelsDOM() {
  reelFrame.innerHTML = '';
  symbolsEls = [];
  reelEls = [];
  for (let i = 0; i < REEL_COUNT; i++) {
    const reel = document.createElement('div');
    reel.className = 'reel';
    reel.id = 'reel' + (i + 1);
    const symbols = document.createElement('div');
    symbols.className = 'symbols';
    symbols.id = 'symbols' + (i + 1);
    reel.appendChild(symbols);
    reelFrame.appendChild(reel);
    reelEls.push(reel);
    symbolsEls.push(symbols);
  }
}

/**
 * Build a long continuous strip:
 * - starts with current visible symbols (no visual jump)
 * - many random symbols in the middle
 * - ends with the target final symbols
 * Returns { strip, targetIndex } where targetIndex is the start index of the final 3 symbols.
 */
function buildContinuousStrip(currentFinals, targetFinals) {
  const strip = [];

  // 1. Current visible symbols (so animation starts seamlessly)
  if (currentFinals && currentFinals.length === 3) {
    strip.push(currentFinals[0], currentFinals[1], currentFinals[2]);
  } else {
    strip.push(weightedRandom(), weightedRandom(), weightedRandom());
  }

  // 2. Long random middle section
  for (let i = 0; i < REEL_LEN; i++) {
    strip.push(weightedRandom());
  }

  // 3. Target symbols (these will land in the visible window)
  const targetIndex = strip.length;
  strip.push(targetFinals[0], targetFinals[1], targetFinals[2]);

  // 4. A few extra after so the strip doesn't end abruptly
  for (let i = 0; i < 4; i++) {
    strip.push(weightedRandom());
  }

  return { strip, targetIndex };
}

function renderStrip(reelIndex, strip, startOffset = 0) {
  const c = symbolsEls[reelIndex];
  c.innerHTML = '';
  c.style.transition = 'none';
  c.style.transform = `translateY(${startOffset}px)`;

  strip.forEach(sym => {
    const d = document.createElement('div');
    d.className = 'symbol';
    d.textContent = sym.emoji;
    d.dataset.id = sym.id;
    c.appendChild(d);
  });
}

function initReels() {
  grid = [];
  for (let r = 0; r < REEL_COUNT; r++) {
    const finals = [weightedRandom(), weightedRandom(), weightedRandom()];
    // Short strip just for initial display
    const short = [weightedRandom(), ...finals, weightedRandom()];
    renderStrip(r, short, -SYMBOL_H); // show the middle three
    grid[r] = finals;
  }
}

// ==================== SPIN ====================
function spin() {
  if (isSpinning) return;

  const isFree = freeSpins > 0;
  const bet = BETS[currentBetIndex];

  if (!isFree && balance < bet) {
    showMessage('Недостаточно средств', 'Уменьшите ставку');
    return;
  }

  isSpinning = true;
  spinBtn.disabled = true;
  spinBtn.classList.add('spinning');
  clearHighlights();
  winAmountEl.textContent = '0';
  winAmountEl.classList.remove('big-win');

  if (isFree) freeSpins--;
  else balance -= bet;
  updateUI();
  playSpinStart();

  // Generate final results
  const finalGrid = [];
  for (let r = 0; r < REEL_COUNT; r++) {
    finalGrid[r] = [weightedRandom(), weightedRandom(), weightedRandom()];
  }

  const promises = finalGrid.map((targetFinals, ri) => {
    return new Promise(resolve => {
      const current = grid[ri] || [weightedRandom(), weightedRandom(), weightedRandom()];
      const { strip, targetIndex } = buildContinuousStrip(current, targetFinals);

      // Start offset: show the first 3 symbols (current)
      const startY = 0;
      renderStrip(ri, strip, startY);
      reelEls[ri].classList.add('spinning');

      // Force reflow so the browser registers the starting position
      void symbolsEls[ri].offsetWidth;

      // Final position: the target symbols (targetIndex, targetIndex+1, targetIndex+2)
      // should be visible. We want targetIndex to be at the top of the reel.
      const finalY = -(targetIndex * SYMBOL_H);

      const duration = SPIN_MS[ri];
      // Small stagger so they don't all start at the exact same frame
      const startDelay = ri * 40;

      setTimeout(() => {
        // Smooth deceleration curve
        symbolsEls[ri].style.transition =
          `transform ${duration}ms cubic-bezier(0.15, 0.85, 0.12, 1)`;
        symbolsEls[ri].style.transform = `translateY(${finalY}px)`;
      }, startDelay);

      // When animation finishes
      setTimeout(() => {
        // Snap cleanly (remove any sub-pixel drift)
        symbolsEls[ri].style.transition = 'none';
        symbolsEls[ri].style.transform = `translateY(${finalY}px)`;
        reelEls[ri].classList.remove('spinning');

        // Optional: replace with a short clean strip so DOM stays light
        // (visually identical)
        const cleanStrip = [
          weightedRandom(),
          targetFinals[0],
          targetFinals[1],
          targetFinals[2],
          weightedRandom()
        ];
        renderStrip(ri, cleanStrip, -SYMBOL_H);

        playReelStop();
        resolve();
      }, duration + startDelay + 40);
    });
  });

  Promise.all(promises).then(() => {
    grid = finalGrid;
    evaluateWin(bet);
    isSpinning = false;
    spinBtn.disabled = false;
    spinBtn.classList.remove('spinning');
    updateUI();

    if (freeSpins > 0) {
      setTimeout(() => spin(), 900);
    }
  });
}

// ==================== WIN EVALUATION ====================
function evaluateWin(bet) {
  let totalWin = 0;
  const winningCells = new Set();

  PAYLINES.forEach(line => {
    let matchCount = 1;
    const first = grid[0][line[0]];
    for (let r = 1; r < REEL_COUNT; r++) {
      if (grid[r][line[r]].id === first.id) matchCount++;
      else break;
    }
    if (matchCount >= 3) {
      const mult = first.payout * (matchCount === 5 ? 1.5 : matchCount === 4 ? 1.0 : 0.6);
      totalWin += Math.round(mult * bet);
      for (let r = 0; r < matchCount; r++) {
        winningCells.add(`${r}-${line[r]}`);
      }
    }
  });

  // Scatter
  let scatters = 0;
  for (let r = 0; r < REEL_COUNT; r++) {
    for (let row = 0; row < ROWS; row++) {
      if (grid[r][row].id === 'diamond') scatters++;
    }
  }

  let awardedFree = false;
  if (scatters >= 3) {
    freeSpins += FREE_SPINS_AWARD;
    awardedFree = true;
    playFreeSpins();
  }

  if (totalWin > 0) {
    balance += totalWin;
    winAmountEl.textContent = formatNumber(totalWin);
    highlightSymbols(winningCells);
    const isBig = totalWin >= bet * 25;
    if (isBig) winAmountEl.classList.add('big-win');
    playWin(isBig);

    if (awardedFree) {
      showMessage('🎉 FREE SPINS!', `+${FREE_SPINS_AWARD} FS и ${formatNumber(totalWin)} 💎`, 2700);
    } else if (isBig) {
      showMessage('🔥 BIG WIN!', `+${formatNumber(totalWin)} 💎`, 2500);
    } else {
      showMessage('Выигрыш!', `+${formatNumber(totalWin)} 💎`, 1700);
    }
  } else if (awardedFree) {
    showMessage('🎉 FREE SPINS!', `+${FREE_SPINS_AWARD} бесплатных вращений`, 2500);
  }
}

function clearHighlights() {
  document.querySelectorAll('.symbol.win').forEach(el => el.classList.remove('win'));
}

function highlightSymbols(cells) {
  cells.forEach(key => {
    const [reel, row] = key.split('-').map(Number);
    // After clean render the visible symbols are at indices 1,2,3
    const child = symbolsEls[reel]?.children[1 + row];
    if (child) child.classList.add('win');
  });
  setTimeout(() => clearHighlights(), 1900);
}

// ==================== PAYTABLE ====================
function renderPaytable() {
  paytableEl.innerHTML = '';
  [...SYMBOLS].sort((a, b) => b.payout - a.payout).forEach(sym => {
    const item = document.createElement('div');
    item.className = 'pay-item';
    item.innerHTML = `
      <span class="symbols-row">${sym.emoji}${sym.emoji}${sym.emoji}</span>
      <span class="multiplier">×${sym.payout}</span>
    `;
    paytableEl.appendChild(item);
  });
}

// ==================== SETTINGS PANEL ====================
function openSettings() {
  renderWeightsInputs();
  editBalance.value = balance;
  estimateRTP();
  settingsOverlay.classList.add('show');
}
function closeSettingsPanel() {
  settingsOverlay.classList.remove('show');
}
function renderWeightsInputs() {
  weightsGrid.innerHTML = '';
  SYMBOLS.forEach((sym, i) => {
    const row = document.createElement('div');
    row.className = 'weight-row';
    row.innerHTML = `
      <span class="emoji">${sym.emoji}</span>
      <input type="number" min="1" max="100" value="${sym.weight}" data-idx="${i}" />
    `;
    weightsGrid.appendChild(row);
  });
}
function applyWeightsFromUI() {
  weightsGrid.querySelectorAll('input').forEach(inp => {
    const idx = +inp.dataset.idx;
    const val = Math.max(1, Math.min(100, parseInt(inp.value, 10) || 1));
    SYMBOLS[idx].weight = val;
    inp.value = val;
  });
  estimateRTP();
  showMessage('Применено', 'Новые веса активны', 1400);
  localStorage.setItem('neonSlotsWeights', JSON.stringify(SYMBOLS));
}
function resetToDefault() {
  SYMBOLS = JSON.parse(JSON.stringify(DEFAULT_SYMBOLS));
  renderWeightsInputs();
  estimateRTP();
  localStorage.removeItem('neonSlotsWeights');
  showMessage('Сброс', 'Веса возвращены к стандартным', 1400);
}
function applyPreset(name) {
  const presets = {
    normal:  [24, 20, 16, 12, 9, 6, 4, 3],
    loose:   [18, 16, 14, 12, 10, 8, 7, 6],
    tight:   [30, 25, 18, 12, 7, 4, 2, 1],
    jackpot: [20, 16, 12, 10, 8, 6, 8, 10],
  };
  const w = presets[name];
  if (!w) return;
  SYMBOLS.forEach((s, i) => (s.weight = w[i]));
  renderWeightsInputs();
  estimateRTP();
  localStorage.setItem('neonSlotsWeights', JSON.stringify(SYMBOLS));
  showMessage('Пресет', name.toUpperCase() + ' активирован', 1400);
}

// ==================== PARTICLES ====================
function createParticles() {
  const c = document.getElementById('particles');
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = 7 + Math.random() * 13 + 's';
    p.style.animationDelay = Math.random() * 9 + 's';
    const sz = 1 + Math.random() * 2.5;
    p.style.width = p.style.height = sz + 'px';
    p.style.background = Math.random() > 0.5 ? 'var(--gold)' : 'var(--neon-pink)';
    c.appendChild(p);
  }
}

// ==================== EVENTS ====================
spinBtn.addEventListener('click', spin);
betMinus.addEventListener('click', () => {
  if (isSpinning || freeSpins > 0) return;
  playClick();
  currentBetIndex = Math.max(0, currentBetIndex - 1);
  updateUI();
});
betPlus.addEventListener('click', () => {
  if (isSpinning || freeSpins > 0) return;
  playClick();
  currentBetIndex = Math.min(BETS.length - 1, currentBetIndex + 1);
  updateUI();
});
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundToggle.classList.toggle('muted', !soundEnabled);
  soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
  playClick();
});
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.key === 'Enter') {
    e.preventDefault();
    spin();
  }
});
messageOverlay.addEventListener('click', () => messageOverlay.classList.remove('show'));

settingsBtn.addEventListener('click', openSettings);
closeSettings.addEventListener('click', closeSettingsPanel);
settingsOverlay.addEventListener('click', e => {
  if (e.target === settingsOverlay) closeSettingsPanel();
});
applyWeights.addEventListener('click', applyWeightsFromUI);
resetWeights.addEventListener('click', resetToDefault);
setBalanceBtn.addEventListener('click', () => {
  const v = parseInt(editBalance.value, 10);
  if (!isNaN(v) && v >= 0) {
    balance = v;
    updateUI();
    showMessage('Баланс', 'Установлен: ' + formatNumber(v), 1400);
  }
});
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
});

// ==================== INIT ====================
function init() {
  const savedBal = localStorage.getItem('neonSlotsBalance');
  if (savedBal !== null) balance = parseInt(savedBal, 10) || INITIAL_BALANCE;

  const savedW = localStorage.getItem('neonSlotsWeights');
  if (savedW) {
    try { SYMBOLS = JSON.parse(savedW); } catch (e) {}
  }

  const savedSound = localStorage.getItem('neonSlotsSound');
  if (savedSound === '0') {
    soundEnabled = false;
    soundToggle.classList.add('muted');
    soundToggle.textContent = '🔇';
  }

  createReelsDOM();
  updateUI();
  initReels();
  renderPaytable();
  createParticles();
  estimateRTP();

  setInterval(() => {
    localStorage.setItem('neonSlotsBalance', balance);
    localStorage.setItem('neonSlotsSound', soundEnabled ? '1' : '0');
  }, 1500);
}

init();
