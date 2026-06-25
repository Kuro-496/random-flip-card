'use strict';

// ============================================================
// STATE
// ============================================================
let deck                = [];
let remainingIndices    = [];
let activeIndexIndex    = null;
let isFlipped           = false;
let isProgrammaticChange = false;
let isAnimating         = false;
let gachaMode           = false;   // true while the fly card is visible / interactive
let flyFirstFlipDone    = false;   // prevents the mystery→secondFace swap from running twice

// ============================================================
// DOM ELEMENTS
// ============================================================
const cardInput         = document.getElementById('card-input');
const sidebar           = document.getElementById('sidebar');
const hideSidebarBtn    = document.getElementById('hide-sidebar-btn');
const showSidebarBtn    = document.getElementById('show-sidebar-btn');
const initialFaceToggle = document.getElementById('initial-face-toggle');
const remainingCount    = document.getElementById('remaining-count');
const totalCount        = document.getElementById('total-count');
const deckPile          = document.getElementById('deck-pile');
const cardSlot          = document.getElementById('card-slot');
const slotPlaceholder   = document.getElementById('slot-placeholder');
const activeCard        = document.getElementById('active-card');
const activeCardInner   = document.getElementById('active-card-inner');
const cardFrontText     = document.getElementById('card-front-text');
const cardBackText      = document.getElementById('card-back-text');
const actionButtons     = document.getElementById('action-buttons');
const keepBtn           = document.getElementById('keep-btn');
const removeBtn         = document.getElementById('remove-btn');
const toastContainer    = document.getElementById('toast-container');
const mainContent       = document.querySelector('.main-content');
const arenaEl           = document.querySelector('.arena');
const flashOverlay      = document.getElementById('flash-overlay');
const trailCanvas       = document.getElementById('trail-canvas');
const particleCanvas    = document.getElementById('particle-canvas');
// Cinematic Gacha elements
const gachaOverlay      = document.getElementById('gacha-overlay');
const gachaFlyCard      = document.getElementById('gacha-fly-card');
const gachaFlyInner     = document.getElementById('gacha-fly-inner');
const flyMysteryLayer   = document.getElementById('fly-mystery-layer');
const flySecondContent  = document.getElementById('fly-second-content');
const flyFirstLabel     = document.getElementById('fly-first-label');
const flyFirstText      = document.getElementById('fly-first-text');
const flySecondLabel    = document.getElementById('fly-second-label');
const flySecondText     = document.getElementById('fly-second-text');

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
// Samples the fly card position every rAF frame and draws a
// radial glow that fades based on trail history depth.
// ============================================================
let trailActive    = false;
let trailIntensity = 0;
const trailHistory = [];
const TRAIL_MAX    = 28;

function sampleCardCenter() {
  const el = gachaMode ? gachaFlyCard : activeCard;
  const r  = el.getBoundingClientRect();
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

      const grd = trailCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size + 24);
      grd.addColorStop(0,   `rgba(56, 189, 248, ${alpha})`);
      grd.addColorStop(0.5, `rgba( 2, 132, 199, ${alpha * 0.55})`);
      grd.addColorStop(1,   'rgba(7, 89, 133, 0)');

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
// spawnExplosion: big burst on impact.
// spawnEdgeSparkles: gold/purple sparks that fly outward from
//   the bottom half of the fly card's left and right edges.
// ============================================================
let particles     = [];
let sparkleActive = false;

function spawnExplosion(cx, cy) {
  for (let i = 0; i < 110; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const speed  = 3 + Math.random() * 11;
    const isBlue = Math.random() < 0.55;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life:    1,
      decay:   0.013 + Math.random() * 0.022,
      r:       2 + Math.random() * 5.5,
      color: isBlue
        ? `rgba(${56 + (Math.random() * 100 | 0)}, ${180 + (Math.random() * 70 | 0)}, 248,`
        : `rgba(${180 + (Math.random() * 75 | 0)}, ${80  + (Math.random() * 60 | 0)}, 255,`,
      gravity: 0.08 + Math.random() * 0.12,
    });
  }
}

/**
 * Sparks emitted from the BOTTOM HALF of the fly card's left and right
 * edges. They shoot outward and fade quickly – like the card rending air.
 */
function spawnEdgeSparkles() {
  if (!sparkleActive || !gachaMode) return;
  const rect = gachaFlyCard.getBoundingClientRect();
  if (rect.width === 0) return;

  for (let i = 0; i < 3; i++) {
    const yFrac  = 0.5 + Math.random() * 0.5;    // bottom half
    const y      = rect.top + rect.height * yFrac;
    const isGold = Math.random() < 0.5;
    const color  = isGold ? 'rgba(255, 200, 50,' : 'rgba(180, 90, 255,';

    // Left edge → fly left-outward
    particles.push({
      x: rect.left + Math.random() * 8, y,
      vx: -(2.5 + Math.random() * 3.5),
      vy: (Math.random() - 0.65) * 2,
      life: 1, decay: 0.028,
      r: 1.4 + Math.random() * 2.2,
      color, gravity: 0.015,
    });
    // Right edge → fly right-outward
    particles.push({
      x: rect.right - Math.random() * 8, y,
      vx: (2.5 + Math.random() * 3.5),
      vy: (Math.random() - 0.65) * 2,
      life: 1, decay: 0.028,
      r: 1.4 + Math.random() * 2.2,
      color, gravity: 0.015,
    });
  }
}

function particleLoop() {
  pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  spawnEdgeSparkles();

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

    // Cross sparkle for large burst particles
    if (p.r > 4 && p.life > 0.5) {
      pCtx.strokeStyle = p.color + (a * 0.32) + ')';
      pCtx.lineWidth = 1;
      pCtx.beginPath();
      pCtx.moveTo(p.x - p.r * 2, p.y); pCtx.lineTo(p.x + p.r * 2, p.y);
      pCtx.moveTo(p.x, p.y - p.r * 2); pCtx.lineTo(p.x, p.y + p.r * 2);
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
// CARD PARSING
// ============================================================
function parseCards() {
  const text = cardInput.value;
  if (!text.trim()) {
    deck = [];
    if (!isProgrammaticChange) remainingIndices = [];
    updateUIForEmptyDeck();
    return;
  }

  const lines   = text.split('\n');
  const newDeck = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') {
      newDeck.push({ textFront: '', textBack: '', lineIndex: index });
    } else if (!line.includes('/')) {
      newDeck.push({ textFront: trimmed, textBack: '', lineIndex: index });
    } else {
      const si = line.indexOf('/');
      newDeck.push({
        textFront: line.substring(0, si).trim(),
        textBack:  line.substring(si + 1).trim(),
        lineIndex: index,
      });
    }
  });

  deck = newDeck;
  if (isProgrammaticChange) {
    isProgrammaticChange = false;
  } else {
    remainingIndices = deck.map((_, i) => i);
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
// DISMISS GACHA (fade out overlay + fly card)
// ============================================================
async function dismissGacha() {
  if (!gachaMode) return;

  gachaFlyCard.classList.remove('glow-fly');
  sparkleActive = false;
  trailActive   = false;
  trailHistory.length = 0;

  // Cancel any running web animations so we start fresh
  gachaFlyCard.getAnimations().forEach(a => a.cancel());

  // Fade fly card downward
  gachaFlyCard.animate([
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1.0)'  },
    { opacity: 0, transform: 'translate(-50%, -50%) scale(0.80)' },
  ], { duration: 360, easing: 'ease-in', fill: 'forwards' });

  // Fade overlay
  gachaOverlay.classList.remove('active');
  actionButtons.classList.remove('gacha-mode');
  actionButtons.classList.add('hidden');

  await wait(380);

  // Clean up
  gachaFlyCard.classList.remove('active');
  gachaFlyCard.getAnimations().forEach(a => a.cancel());
  gachaFlyCard.style.cssText = '';
  gachaMode   = false;
  particles   = [];
}

// ============================================================
// DRAW CARD  –  Full Cinematic Gacha Sequence
//
// Timeline (total ≈ 3.4 s):
//   Phase 1  S-curve flight         0.0 s → 1.5 s
//   Phase 2  Spin at center         1.5 s → 2.5 s
//   Phase 3  Impact + flip reveal   2.5 s → 3.4 s
//
// Architecture:
//   • Outer card (#gacha-fly-card)   → Web Animations API (pos / scale / blur)
//   • Inner flip (#gacha-fly-inner)  → CSS class transition (.revealed)
//   • Back/front content             → populated by JS before draw starts
// ============================================================
async function drawCard() {
  if (isAnimating) return;
  if (remainingIndices.length === 0) {
    showToast('Hiện trong bộ không có thẻ', 'warning');
    return;
  }

  isAnimating = true;

  /* ── 1. Pick card ────────────────────────────────────────── */
  const rIdx          = Math.floor(Math.random() * remainingIndices.length);
  activeIndexIndex    = rIdx;
  const deckIdx       = remainingIndices[rIdx];
  const cardData      = deck[deckIdx];

  /* ── 2. Populate regular card (compatibility, stays hidden) ─ */
  [cardFrontText, cardBackText].forEach((el, i) => {
    const txt = i === 0 ? cardData.textFront : cardData.textBack;
    el.textContent     = txt || '(Trống)';
    el.style.opacity   = txt ? '1' : (i === 0 ? '0.35' : '0.5');
    el.style.fontStyle = txt ? 'normal' : 'italic';
  });

  /* ── 3. Determine face order ────────────────────────────────
     startWithBack = true  → 1st face = back (translation)
     startWithBack = false → 1st face = front (original)
  ─────────────────────────────────────────────────────────── */
  const startWithBack = initialFaceToggle.checked;
  const firstText   = startWithBack ? (cardData.textBack  || '(Trống)') : (cardData.textFront || '(Trống)');
  const secondText  = startWithBack ? (cardData.textFront || '(Trống)') : (cardData.textBack  || '(Trống)');

  flyFirstText.textContent   = firstText;
  flyFirstLabel.textContent  = startWithBack ? 'MẶT SAU'   : 'MẶT TRƯỚC';
  flySecondText.textContent  = secondText;
  flySecondLabel.textContent = startWithBack ? 'MẶT TRƯỚC' : 'MẶT SAU';

  /* ── 4. Reset fly card visual state ────────────────────────── */
  gachaFlyInner.classList.remove('revealed', 'user-flipped');
  gachaFlyCard.classList.remove('glow-fly');
  flyMysteryLayer.style.display = '';    // mystery visible
  flySecondContent.hidden       = true;  // second face hidden
  flyFirstFlipDone = false;
  isFlipped        = false;

  /* ── 5. Activate cinematic overlay ─────────────────────────── */
  gachaOverlay.classList.add('active');
  gachaFlyCard.classList.add('active');
  gachaMode = true;
  slotPlaceholder.classList.add('hidden');
  activeCard.classList.add('hidden');
  actionButtons.classList.add('hidden');
  actionButtons.classList.remove('gacha-mode');

  /* ── 6. Start edge sparkles ─────────────────────────────────── */
  sparkleActive = true;
  particles     = [];

  /* ────────────────────────────────────────────────────────────
     PHASE 1: S-Curve Flight  (0 → 1500 ms)

     Card emerges from the deck pile and sweeps through the
     trajectory in image_752677.png:
       • Small upward-left arc (first curve of S)
       • Wide rightward sweep (far right of screen, scale down)
       • Loop around and rush back to center (scale up)
  ─────────────────────────────────────────────────────────── */
  const vw    = window.innerWidth;
  const vh    = window.innerHeight;
  const flyW  = 260;
  const flyH  = 370;
  const halfW = flyW / 2;
  const halfH = flyH / 2;

  // Deck pile screen position
  const dr  = deckPile.getBoundingClientRect();
  const dpx = dr.left + dr.width  / 2;
  const dpy = dr.top  + dr.height / 2;

  // Helper: translate3d so fly card CENTER sits at viewport (cx, cy).
  // The card has `position:fixed; top:50%; left:50%` → TL is at (vw/2, vh/2).
  // Offset needed: (cx - halfW - vw/2, cy - halfH - vh/2)
  const tx = (cx, cy) =>
    `translate3d(${(cx - halfW - vw / 2).toFixed(1)}px,` +
              ` ${(cy - halfH - vh / 2).toFixed(1)}px, 0)`;

  const cx = vw / 2, cy = vh / 2;     // viewport center (landing target)
  const swX = vw * 0.80, swY = vh * 0.42;   // far-right arc peak
  const loX = vw * 0.84, loY = vh * 0.60;   // loop bottom

  // Ramp up trail glow over the first 500 ms of flight
  trailActive    = true;
  trailIntensity = 0;
  const rampT    = performance.now();
  (function ramp() {
    trailIntensity = Math.min(1, (performance.now() - rampT) / 500);
    if (trailIntensity < 1) requestAnimationFrame(ramp);
  })();

  const phase1 = gachaFlyCard.animate([
    // 0 % – at deck pile
    { offset: 0,    filter: 'blur(0px)',   opacity: 1,
      transform: `${tx(dpx, dpy)} scale(0.88) rotateY(0deg)   rotateZ(0deg)` },
    // 10 % – first leftward-upward arc of S
    { offset: 0.10, filter: 'blur(1px)',
      transform: `${tx(dpx - 55, dpy - 115)} scale(0.80) rotateY(-20deg) rotateZ(-9deg)` },
    // 30 % – sweeping right
    { offset: 0.30, filter: 'blur(2px)',
      transform: `${tx(vw * 0.66, dpy - 15)} scale(0.70) rotateY(-34deg) rotateZ(14deg)` },
    // 47 % – far right arc peak (scale at minimum = "far away")
    { offset: 0.47, filter: 'blur(3px)',
      transform: `${tx(swX, swY)} scale(0.62) rotateY(-47deg) rotateZ(22deg)` },
    // 60 % – loop bottom (deepest point of the big arc)
    { offset: 0.60, filter: 'blur(3.5px)',
      transform: `${tx(loX, loY)} scale(0.56) rotateY(-63deg) rotateZ(28deg)` },
    // 80 % – rushing back toward camera (scale > 1 = "very close")
    { offset: 0.80, filter: 'blur(1.5px)',
      transform: `${tx(cx + 80, cy - 32)} scale(1.15) rotateY(22deg)  rotateZ(-7deg)` },
    // 92 % – slight overshoot to the left
    { offset: 0.92, filter: 'blur(0.4px)',
      transform: `${tx(cx - 15, cy + 9)}  scale(1.05) rotateY(-5deg)  rotateZ(2deg)` },
    // 100 % – land at center
    { offset: 1.0,  filter: 'blur(0px)',
      transform: `${tx(cx, cy)} scale(1.0) rotateY(0deg) rotateZ(0deg)` },
  ], { duration: 1500, easing: 'cubic-bezier(0.45, 0, 0.40, 1)', fill: 'forwards' });

  await phase1.finished;
  trailActive = false;

  /* ────────────────────────────────────────────────────────────
     PHASE 2: Spin at Center  (0 → 1000 ms)
     Three full Y-axis rotations with building blur to
     "charge up" the energy before the reveal.
  ─────────────────────────────────────────────────────────── */
  const atCenter = tx(cx, cy);

  const phase2 = gachaFlyCard.animate([
    { offset: 0,    filter: 'blur(0px)',
      transform: `${atCenter} scale(1.00) rotateY(0deg)    rotateZ(0deg)` },
    { offset: 0.55, filter: 'blur(4px) brightness(1.4)',
      transform: `${atCenter} scale(0.82) rotateY(540deg)  rotateZ(12deg)` },
    { offset: 1.0,  filter: 'blur(5px) brightness(1.6)',
      transform: `${atCenter} scale(0.82) rotateY(1080deg) rotateZ(0deg)` },
  ], { duration: 1000, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' });

  await phase2.finished;

  /* ────────────────────────────────────────────────────────────
     PHASE 3: Impact + Flip Reveal  (0 → 700 ms)

     Outer card (position / scale):  Web Animations API
       0 %   → scale 0.82 (charged up small)
       28 %  → scale 1.65 (IMPACT blast)
       100 % → scale 1.0  (settled)

     Inner card (flip):  CSS transition on .revealed
       Starts at 240 ms, duration 650 ms (set in CSS).

     Timeline from Phase 3 start:
       190 ms → white flash + particles + screen shake (impact peak)
       240 ms → .revealed class added → inner starts rotating
       700 ms → outer anim done (await phase3.finished)
       210 ms → inner flip finishes (240 + 650 = 890 total, 700+190 ≈ 890)
  ─────────────────────────────────────────────────────────── */
  const phase3 = gachaFlyCard.animate([
    { offset: 0,    filter: 'blur(5px) brightness(1.6)',
      transform: `${atCenter} scale(0.82) rotateY(1080deg)` },
    { offset: 0.28, filter: 'blur(0px) brightness(2.9)',
      transform: `${atCenter} scale(1.65) rotateY(1080deg)` },
    { offset: 1.0,  filter: 'blur(0px) brightness(1.0)',
      transform: `${atCenter} scale(1.00) rotateY(1080deg)` },
  ], { duration: 700, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'forwards' });

  // Flash + particles + shake at impact peak (~190 ms)
  setTimeout(() => {
    flashOverlay.classList.remove('flash');
    void flashOverlay.offsetWidth;   // force reflow to restart the animation
    flashOverlay.classList.add('flash');

    const rect = gachaFlyCard.getBoundingClientRect();
    spawnExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2);

    arenaEl.classList.add('shake');
    setTimeout(() => arenaEl.classList.remove('shake'), 380);
  }, 190);

  // Start inner CSS flip 240 ms into Phase 3
  setTimeout(() => gachaFlyInner.classList.add('revealed'), 240);

  await phase3.finished;

  // Wait for the inner flip CSS transition to complete
  // (started at 240 ms, duration 650 ms → finishes at 890 ms;
  //  phase3 took 700 ms so we need ~190 ms more)
  await wait(215);

  /* ── Clean up web animations; restore CSS centering ────────
     After cancel() the element reverts to its CSS-defined
     transform: translate(-50%, -50%) which keeps it centered.
  ─────────────────────────────────────────────────────────── */
  gachaFlyCard.getAnimations().forEach(a => a.cancel());

  /* ── Glow & reveal action buttons ──────────────────────── */
  gachaFlyCard.classList.add('glow-fly');
  actionButtons.classList.remove('hidden');
  actionButtons.classList.add('gacha-mode');

  isAnimating = false;
}

// ============================================================
// CLEAR ACTIVE CARD  (also resets all gacha state)
// ============================================================
function clearActiveCard() {
  slotPlaceholder.classList.remove('hidden');
  activeCard.classList.add('hidden');
  activeCard.classList.remove('flipped', 'glow-card');
  actionButtons.classList.add('hidden');
  actionButtons.classList.remove('gacha-mode');
  activeIndexIndex              = null;
  isFlipped                     = false;
  sparkleActive                 = false;
  gachaMode                     = false;
  flyFirstFlipDone              = false;
  activeCard.style.cssText      = '';
  activeCardInner.style.cssText = '';
}

// ============================================================
// KEEP CARD  (keep in deck, dismiss gacha overlay)
// ============================================================
async function keepCard() {
  if (activeIndexIndex === null || isAnimating) return;
  isAnimating = true;

  await dismissGacha();
  clearActiveCard();
  showToast('Đã giữ lại thẻ trong bộ');

  isAnimating = false;
}

// ============================================================
// REMOVE CARD  (delete from deck & textarea line)
// ============================================================
async function removeCurrentCard() {
  if (activeIndexIndex === null || isAnimating) return;
  isAnimating = true;

  const originalDeckIndex = remainingIndices[activeIndexIndex];
  const cardData          = deck[originalDeckIndex];
  const targetLineIndex   = cardData.lineIndex;

  await dismissGacha();

  // Remove the line from the textarea
  const lines = cardInput.value.split('\n');
  if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
    lines.splice(targetLineIndex, 1);
    isProgrammaticChange = true;
    cardInput.value = lines.join('\n');
  }

  // Update remaining indices after removal
  remainingIndices.splice(activeIndexIndex, 1);
  remainingIndices = remainingIndices.map(idx =>
    idx > originalDeckIndex ? idx - 1 : idx
  );

  parseCards();
  clearActiveCard();
  showToast('Đã loại bỏ thẻ khỏi bộ', 'info');

  isAnimating = false;
}

// ============================================================
// TOGGLE FLIP
//
// In gacha mode:  flips the luxury fly card.
//   First flip: swaps mystery layer → second-face content
//               at the 90° midpoint of the CSS transition.
//
// Normal mode: flips the regular #active-card.
// ============================================================
function toggleFlip() {
  if (activeIndexIndex === null || isAnimating) return;

  if (gachaMode) {
    const wasFlipped = gachaFlyInner.classList.contains('user-flipped');
    gachaFlyInner.classList.toggle('user-flipped');
    isFlipped = !wasFlipped;

    // On first user-flip: replace mystery design with second-face content
    // This happens at the midpoint (≈ 325 ms) of the 650 ms CSS transition.
    if (!flyFirstFlipDone) {
      flyFirstFlipDone = true;
      setTimeout(() => {
        flyMysteryLayer.style.display = 'none';
        flySecondContent.hidden       = false;
      }, 325);
    }
  } else {
    activeCard.classList.toggle('flipped');
    isFlipped = !isFlipped;
  }
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
    if (!isAnimating && e.dataTransfer.getData('text/plain') === 'draw') drawCard();
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

  // Card click to flip (both regular and gacha modes)
  activeCard.addEventListener('click', toggleFlip);
  gachaFlyCard.addEventListener('click', toggleFlip);

  keepBtn.addEventListener('click', keepCard);
  removeBtn.addEventListener('click', removeCurrentCard);

  window.addEventListener('keydown', (e) => {
    if (document.activeElement === cardInput || isAnimating) return;

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        drawCard();
        break;
      case ' ':
        e.preventDefault();
        if (activeIndexIndex !== null) toggleFlip();
        else showToast('Hãy rút thẻ trước', 'warning');
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
