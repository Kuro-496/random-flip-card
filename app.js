// ============================================================
// STATE MANAGEMENT
// ============================================================
let deck = [];               // Array of { textFront, textBack, lineIndex }
let remainingIndices = [];   // Indices of deck cards still in play
let activeIndexIndex = null; // Index inside remainingIndices of current card
let isFlipped = false;
let isProgrammaticChange = false;
let isAnimating = false;     // Locks input during gacha sequence

// ============================================================
// DOM ELEMENTS
// ============================================================
const cardInput       = document.getElementById('card-input');
const sidebar         = document.getElementById('sidebar');
const hideSidebarBtn  = document.getElementById('hide-sidebar-btn');
const showSidebarBtn  = document.getElementById('show-sidebar-btn');
const initialFaceToggle = document.getElementById('initial-face-toggle');
const remainingCount  = document.getElementById('remaining-count');
const totalCount      = document.getElementById('total-count');
const deckPile        = document.getElementById('deck-pile');
const cardSlot        = document.getElementById('card-slot');
const slotPlaceholder = document.getElementById('slot-placeholder');
const activeCard      = document.getElementById('active-card');
const activeCardInner = document.getElementById('active-card-inner');
const cardFront       = document.getElementById('card-front');
const cardBack        = document.getElementById('card-back');
const cardFrontText   = document.getElementById('card-front-text');
const cardBackText    = document.getElementById('card-back-text');
const actionButtons   = document.getElementById('action-buttons');
const keepBtn         = document.getElementById('keep-btn');
const removeBtn       = document.getElementById('remove-btn');
const toastContainer  = document.getElementById('toast-container');
const mainContent     = document.querySelector('.main-content');
const arenaEl         = document.querySelector('.arena');
const flashOverlay    = document.getElementById('flash-overlay');
const trailCanvas     = document.getElementById('trail-canvas');
const particleCanvas  = document.getElementById('particle-canvas');

// ============================================================
// CANVAS SETUP
// ============================================================
const trailCtx = trailCanvas.getContext('2d');
const pCtx     = particleCanvas.getContext('2d');

function resizeCanvases() {
  [trailCanvas, particleCanvas].forEach(c => {
    c.width  = window.innerWidth;
    c.height = window.innerHeight;
  });
}
resizeCanvases();
window.addEventListener('resize', resizeCanvases);

// ============================================================
// MOTION TRAIL SYSTEM
// Samples card position each rAF frame and draws a radial
// glow that fades based on trail history depth.
// ============================================================
let trailActive    = false;
let trailIntensity = 0;       // 0–1, ramped up at start of spin
const trailHistory = [];
const TRAIL_MAX    = 24;

function sampleCardCenter() {
  const r = activeCard.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

function drawTrailLoop() {
  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

  if (trailActive && trailIntensity > 0) {
    const pos = sampleCardCenter();
    trailHistory.push({ ...pos });
    if (trailHistory.length > TRAIL_MAX) trailHistory.shift();

    trailHistory.forEach((p, i) => {
      const progress = i / TRAIL_MAX;
      const alpha    = progress * trailIntensity * 0.42;
      const size     = p.w * 0.48 * progress;

      // Blue-sky trail matching the app's color theme
      const grd = trailCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size + 24);
      grd.addColorStop(0,   `rgba(56, 189, 248, ${alpha})`);
      grd.addColorStop(0.5, `rgba( 2, 132, 199, ${alpha * 0.55})`);
      grd.addColorStop(1,   `rgba( 7,  89, 133, 0)`);

      trailCtx.beginPath();
      trailCtx.arc(p.x, p.y, size + 24, 0, Math.PI * 2);
      trailCtx.fillStyle = grd;
      trailCtx.fill();
    });
  } else {
    trailHistory.length = 0;
  }

  requestAnimationFrame(drawTrailLoop);
}
drawTrailLoop();

// ============================================================
// PARTICLE SYSTEM
// Handles both the big explosion burst and continuous
// ambient sparkles that float around the revealed card.
// ============================================================
let particles     = [];
let sparkleActive = false;

/** Burst 100 particles outward from screen-space (cx, cy). */
function spawnExplosion(cx, cy) {
  for (let i = 0; i < 100; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const speed  = 3 + Math.random() * 10;
    const isBlue = Math.random() < 0.6;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life:    1,
      decay:   0.013 + Math.random() * 0.022,
      r:       2 + Math.random() * 5,
      // Blue-dominant palette with warm accent pops
      color: isBlue
        ? `rgba(${56  + (Math.random() * 100 | 0)}, ${180 + (Math.random() * 70 | 0)}, 248,`
        : `rgba(255, ${170 + (Math.random() * 85 | 0)}, ${Math.random() * 60 | 0},`,
      gravity: 0.08 + Math.random() * 0.12,
    });
  }
}

/** Drip a few sparkles near the card each frame. */
function spawnSparkle() {
  if (!sparkleActive) return;
  const pos = sampleCardCenter();
  for (let i = 0; i < 2; i++) {
    const angle = Math.random() * Math.PI * 2;
    particles.push({
      x: pos.x + Math.cos(angle) * (60 + Math.random() * 90) * 0.45,
      y: pos.y + Math.sin(angle) * (60 + Math.random() * 90) * 0.45,
      vx:   (Math.random() - 0.5) * 1.4,
      vy:   -0.7 - Math.random() * 1.8,
      life:  1,
      decay: 0.022,
      r:     1.2 + Math.random() * 2,
      color: `rgba(56, 189, 248,`,
      gravity: 0,
    });
  }
}

function particleLoop() {
  pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  spawnSparkle();

  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += p.gravity;
    p.vx *= 0.97;
    p.life -= p.decay;

    const a = Math.max(0, p.life);
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.r * a + 0.4, 0, Math.PI * 2);
    pCtx.fillStyle = p.color + a + ')';
    pCtx.fill();

    // Cross sparkle for the larger burst particles
    if (p.r > 4 && p.life > 0.5) {
      pCtx.strokeStyle = p.color + (a * 0.35) + ')';
      pCtx.lineWidth = 1;
      pCtx.beginPath();
      pCtx.moveTo(p.x - p.r * 2, p.y);  pCtx.lineTo(p.x + p.r * 2, p.y);
      pCtx.moveTo(p.x, p.y - p.r * 2);  pCtx.lineTo(p.x, p.y + p.r * 2);
      pCtx.stroke();
    }
  });

  requestAnimationFrame(particleLoop);
}
particleLoop();

// ============================================================
// UTILITY
// ============================================================
const wait = ms => new Promise(r => setTimeout(r, ms));

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showToast(message, type = 'info') {
  document.querySelectorAll('.toast').forEach(t => {
    if (t.textContent === message) t.remove();
  });
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ============================================================
// PARSING INPUT TEXT → CARDS
// ============================================================
function parseCards() {
  const text = cardInput.value;

  if (!text.trim()) {
    deck = [];
    if (!isProgrammaticChange) remainingIndices = [];
    updateUIForEmptyDeck();
    return;
  }

  const lines    = text.split('\n');
  const newDeck  = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') {
      newDeck.push({ textFront: '', textBack: '', lineIndex: index });
    } else if (!line.includes('/')) {
      newDeck.push({ textFront: trimmed, textBack: '', lineIndex: index });
    } else {
      const slashIndex = line.indexOf('/');
      newDeck.push({
        textFront: line.substring(0, slashIndex).trim(),
        textBack:  line.substring(slashIndex + 1).trim(),
        lineIndex: index,
      });
    }
  });

  deck = newDeck;

  if (isProgrammaticChange) {
    isProgrammaticChange = false;
  } else {
    remainingIndices = deck.map((_, idx) => idx);
    clearActiveCard();
  }

  updateCounterStats();
}

function updateUIForEmptyDeck() {
  totalCount.textContent     = '0';
  remainingCount.textContent = '0';
  deckPile.classList.add('empty');
  clearActiveCard();
}

function updateCounterStats() {
  totalCount.textContent     = deck.length;
  remainingCount.textContent = remainingIndices.length;
  deckPile.classList[remainingIndices.length === 0 ? 'add' : 'remove']('empty');
}

// ============================================================
// GACHA DRAW SEQUENCE
// 4-phase animation that runs every time a card is drawn.
//
// Timeline  (total ≈ 3.0 s):
//   Phase 1 – Rise Up       0.0 s → 0.8 s
//   Phase 2 – Spin + Trail  0.8 s → 2.2 s
//   Phase 3 – Impact        2.2 s → 2.5 s
//   Phase 4 – Land + Flip   2.5 s → 3.0 s
// ============================================================
async function drawCard() {
  if (isAnimating) return;
  if (remainingIndices.length === 0) {
    showToast('Hiện trong bộ không có thẻ', 'warning');
    clearActiveCard();
    return;
  }

  isAnimating = true;

  // ── Pick random card ──────────────────────────────────────
  const randomIdxIndex    = Math.floor(Math.random() * remainingIndices.length);
  activeIndexIndex        = randomIdxIndex;
  const originalDeckIndex = remainingIndices[randomIdxIndex];
  const cardData          = deck[originalDeckIndex];

  // ── Populate faces ────────────────────────────────────────
  if (cardData.textFront === '') {
    cardFrontText.textContent     = '(Trống)';
    cardFrontText.style.opacity   = '0.35';
    cardFrontText.style.fontStyle = 'italic';
  } else {
    cardFrontText.textContent     = cardData.textFront;
    cardFrontText.style.opacity   = '1';
    cardFrontText.style.fontStyle = 'normal';
  }
  if (cardData.textBack === '') {
    cardBackText.textContent     = '(Trống)';
    cardBackText.style.opacity   = '0.5';
    cardBackText.style.fontStyle = 'italic';
  } else {
    cardBackText.textContent     = cardData.textBack;
    cardBackText.style.opacity   = '1';
    cardBackText.style.fontStyle = 'normal';
  }

  // ── Prepare DOM ───────────────────────────────────────────
  slotPlaceholder.classList.add('hidden');
  activeCard.classList.remove('hidden', 'flipped', 'glow-card');
  actionButtons.classList.add('hidden');
  sparkleActive = false;
  particles     = [];

  // Allow card to fly outside its container bounds
  arenaEl.classList.add('gacha-active');
  mainContent.classList.add('gacha-active');

  /* ──────────────────────────────────────────────────────────
     PHASE 1  Rise Up  (0.0 s → 0.8 s)
     ─────────────────────────────────────────────────────── */
  activeCard.style.transition      = 'none';
  activeCardInner.style.transition = 'none';
  activeCard.style.opacity         = '0';
  activeCard.style.transform       = 'translateY(220px) scale(0.45)';
  activeCard.style.filter          = 'blur(0px)';
  activeCardInner.style.transform  = 'rotateY(0deg)';

  await wait(40); // let browser paint the reset state

  // Elastic fly-up with overshoot
  activeCard.style.transition =
    'transform 0.8s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s ease';
  activeCard.style.opacity   = '1';
  activeCard.style.transform = 'translateY(-75px) scale(1.2)';

  await wait(820);

  /* ──────────────────────────────────────────────────────────
     PHASE 2  Spin + Trail  (0.8 s → 2.2 s  — 1400 ms)
     3 full Y-axis rotations; motion blur increases.
     ─────────────────────────────────────────────────────── */
  // Ramp trail intensity up over the first 400 ms of the spin
  trailActive    = true;
  trailIntensity = 0;
  const rampStart = performance.now();
  (function rampTrail() {
    trailIntensity = Math.min(1, (performance.now() - rampStart) / 400);
    if (trailIntensity < 1) requestAnimationFrame(rampTrail);
  })();

  activeCard.style.transition = 'transform 0.35s ease, filter 1.0s ease-in';
  activeCard.style.transform  = 'translateY(-75px) scale(0.85)';
  activeCard.style.filter     = 'blur(5px) brightness(1.5)';

  // 3 full Y rotations (1080°) + slight Z wobble
  activeCardInner.style.transition = 'transform 1.4s cubic-bezier(0.4, 0, 0.6, 1)';
  activeCardInner.style.transform  = 'rotateY(1080deg) rotateZ(18deg)';

  await wait(1400);

  /* ──────────────────────────────────────────────────────────
     PHASE 3  Impact  (2.2 s → 2.5 s  — 300 ms)
     Snap to foreground; flash, shake, particle burst.
     ─────────────────────────────────────────────────────── */
  trailActive = false; // stop trail sampling

  // Blast forward at 1.65× scale
  activeCard.style.transition = 'transform 0.22s cubic-bezier(0, 0, 0.2, 1), filter 0.12s ease';
  activeCard.style.transform  = 'translateY(-75px) scale(1.65)';
  activeCard.style.filter     = 'blur(0px) brightness(2.8)';

  // Un-wobble the inner rotation
  activeCardInner.style.transition = 'transform 0.22s ease';
  activeCardInner.style.transform  = 'rotateY(1080deg) rotateZ(0deg)';

  // White flash
  flashOverlay.classList.remove('flash');
  void flashOverlay.offsetWidth; // force reflow to restart animation
  flashOverlay.classList.add('flash');

  // Screen shake on the arena
  arenaEl.classList.add('shake');
  setTimeout(() => arenaEl.classList.remove('shake'), 380);

  // Particle burst from the card's screen-space center
  const rect = activeCard.getBoundingClientRect();
  spawnExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2);

  await wait(280);

  /* ──────────────────────────────────────────────────────────
     PHASE 4  Land + Flip Reveal  (2.5 s → 3.0 s  — 500 ms)
     Card settles at center; last spin segment reveals face.

     Flip logic:
       The inner starts at 1080° ≡ 0°  → shows card-front face.
       Adding 180° → 1260° ≡ 180°     → shows card-back face.
     ─────────────────────────────────────────────────────── */
  const startWithBack = initialFaceToggle.checked; // true = show back/translation first
  const finalInnerRot = startWithBack ? 1260 : 1080;

  // Spring-land the outer card
  activeCard.style.transition =
    'transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease';
  activeCard.style.transform = 'translateY(0px) scale(1.0)';
  activeCard.style.filter    = 'blur(0px) brightness(1)';

  // Flip to target face
  activeCardInner.style.transition =
    'transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)';
  activeCardInner.style.transform = `rotateY(${finalInnerRot}deg) rotateZ(0deg)`;

  await wait(480);

  // Glow ring & ambient sparkles
  activeCard.classList.add('glow-card');
  sparkleActive = true;

  // Reveal action buttons
  actionButtons.classList.remove('hidden');

  await wait(100);

  /* ── Clean up: hand control back to CSS class system ── */
  // Snap-clear inner rotation without visible flash:
  // 1080 ≡ 0°, 1260 ≡ 180° so removing the inline style and setting
  // the CSS class produces the exact same visual result instantly.
  activeCardInner.style.transition = 'none';
  activeCardInner.style.transform  = '';   // CSS class takes over

  activeCard.style.transition = '';
  activeCard.style.opacity    = '';
  activeCard.style.transform  = '';
  activeCard.style.filter     = '';

  // Apply the correct flip class
  isFlipped = startWithBack;
  activeCard.classList.toggle('flipped', startWithBack);

  // Restore CSS transition on inner after one paint
  setTimeout(() => { activeCardInner.style.transition = ''; }, 60);

  // Restore overflow clipping
  arenaEl.classList.remove('gacha-active');
  mainContent.classList.remove('gacha-active');

  isAnimating = false;
}

// ============================================================
// CLEAR ACTIVE CARD
// ============================================================
function clearActiveCard() {
  slotPlaceholder.classList.remove('hidden');
  activeCard.classList.add('hidden');
  activeCard.classList.remove('flipped', 'glow-card');
  actionButtons.classList.add('hidden');
  activeIndexIndex           = null;
  isFlipped                  = false;
  sparkleActive              = false;
  activeCard.style.cssText      = '';
  activeCardInner.style.cssText = '';
}

// ============================================================
// KEEP CARD  (return to pool, animate out downward)
// ============================================================
function keepCard() {
  if (activeIndexIndex === null || isAnimating) return;

  activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  activeCard.style.transform  = 'translateY(100px) scale(0.9)';
  activeCard.style.opacity    = '0';

  setTimeout(() => {
    clearActiveCard();
    activeCard.style.transition = '';
    activeCard.style.transform  = '';
    activeCard.style.opacity    = '';
    showToast('Đã giữ lại thẻ trong bộ');
  }, 300);
}

// ============================================================
// REMOVE CARD  (delete from deck & textarea line)
// ============================================================
function removeCurrentCard() {
  if (activeIndexIndex === null || isAnimating) return;

  const originalDeckIndex = remainingIndices[activeIndexIndex];
  const cardData          = deck[originalDeckIndex];
  const targetLineIndex   = cardData.lineIndex;

  const lines = cardInput.value.split('\n');
  if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
    lines.splice(targetLineIndex, 1);
    isProgrammaticChange = true;
    cardInput.value = lines.join('\n');
  }

  remainingIndices.splice(activeIndexIndex, 1);
  remainingIndices = remainingIndices.map(idx =>
    idx > originalDeckIndex ? idx - 1 : idx
  );

  parseCards();

  activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  activeCard.style.transform  = 'translateX(150px) rotate(15deg) scale(0.9)';
  activeCard.style.opacity    = '0';

  setTimeout(() => {
    clearActiveCard();
    activeCard.style.transition = '';
    activeCard.style.transform  = '';
    activeCard.style.opacity    = '';
    showToast('Đã loại bỏ thẻ khỏi bộ', 'info');
  }, 300);
}

// ============================================================
// TOGGLE FLIP  (click or Space)
// ============================================================
function toggleFlip() {
  if (activeIndexIndex === null || isAnimating) return;
  activeCard.classList.toggle('flipped');
  isFlipped = !isFlipped;
}

// ============================================================
// SIDEBAR TOGGLE
// ============================================================
function toggleSidebar() {
  sidebar.classList.toggle('collapsed');
  if (sidebar.classList.contains('collapsed')) {
    showSidebarBtn.classList.remove('hidden');
    mainContent.classList.add('sidebar-collapsed-padding');
  } else {
    showSidebarBtn.classList.add('hidden');
    mainContent.classList.remove('sidebar-collapsed-padding');
  }
}

// ============================================================
// DRAG & DROP
// ============================================================
function setupDragAndDrop() {
  deckPile.addEventListener('dragstart', (e) => {
    if (remainingIndices.length === 0 || isAnimating) { e.preventDefault(); return; }
    deckPile.classList.add('dragging');
    e.dataTransfer.setData('text/plain', 'draw');
    e.dataTransfer.effectAllowed = 'copy';
  });

  deckPile.addEventListener('dragend', () => deckPile.classList.remove('dragging'));

  cardSlot.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (remainingIndices.length > 0 && !isAnimating) cardSlot.classList.add('drag-over');
  });

  cardSlot.addEventListener('dragleave', () => cardSlot.classList.remove('drag-over'));

  cardSlot.addEventListener('drop', (e) => {
    e.preventDefault();
    cardSlot.classList.remove('drag-over');
    if (remainingIndices.length === 0) { showToast('Hiện trong bộ không có thẻ', 'warning'); return; }
    if (e.dataTransfer.getData('text/plain') === 'draw') drawCard();
  });

  deckPile.addEventListener('click', () => {
    if (remainingIndices.length === 0) { showToast('Hiện trong bộ không có thẻ', 'warning'); return; }
    drawCard();
  });
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  cardInput.addEventListener('input', parseCards);

  hideSidebarBtn.addEventListener('click', toggleSidebar);
  showSidebarBtn.addEventListener('click', toggleSidebar);

  activeCard.addEventListener('click', toggleFlip);

  keepBtn.addEventListener('click', keepCard);
  removeBtn.addEventListener('click', removeCurrentCard);

  window.addEventListener('keydown', (e) => {
    // Block shortcuts while typing or animating
    if (document.activeElement === cardInput || isAnimating) return;

    switch (e.key) {
      case 'Enter':
        // Enter → Draw card
        e.preventDefault();
        drawCard();
        break;
      case ' ':
        // Space → Flip revealed card
        e.preventDefault();
        if (activeIndexIndex !== null) {
          toggleFlip();
        } else {
          showToast('Hãy rút thẻ trước', 'warning');
        }
        break;
      case 'ArrowLeft':
      case 'k':
        if (activeIndexIndex !== null) keepCard();
        break;
      case 'ArrowRight':
      case 'r':
        if (activeIndexIndex !== null) removeCurrentCard();
        break;
      case 'h':
      case 'H':
        toggleSidebar();
        break;
    }
  });
}

// ============================================================
// INIT
// ============================================================
function init() {
  setupDragAndDrop();
  setupEventListeners();

  if (!cardInput.value.trim()) {
    cardInput.value =
      'Cảm ơn/Thank you\nTạm biệt/Goodbye\nTrái táo/Apple\nQuả chuối/Banana\nXe máy/Motorcycle';
  }

  parseCards();
}

document.addEventListener('DOMContentLoaded', init);
