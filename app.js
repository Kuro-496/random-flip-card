'use strict';

// ============================================================
// STATE
// ============================================================
let deck = [];
let remainingIndices = [];
let activeIndexIndex = null;
let isFlipped = false;
let isProgrammaticChange = false;
let isAnimating = false;
let gachaMode = false;   // true while the fly card is visible / interactive
let flyFirstFlipDone = false;   // prevents the mystery→secondFace swap from running twice

// ============================================================
// DOM ELEMENTS
// ============================================================
const cardInput = document.getElementById('card-input');
const sidebar = document.getElementById('sidebar');
const hideSidebarBtn = document.getElementById('hide-sidebar-btn');
const showSidebarBtn = document.getElementById('show-sidebar-btn');
const initialFaceToggle = document.getElementById('initial-face-toggle');
const remainingCount = document.getElementById('remaining-count');
const totalCount = document.getElementById('total-count');
const deckPile = document.getElementById('deck-pile');
const deckCardLabel = document.getElementById('deck-card-label');
const cardSlot = document.getElementById('card-slot');
const slotPlaceholder = document.getElementById('slot-placeholder');
const activeCard = document.getElementById('active-card');
const activeCardInner = document.getElementById('active-card-inner');
const cardFrontText = document.getElementById('card-front-text');
const cardBackText = document.getElementById('card-back-text');
const actionButtons = document.getElementById('action-buttons');
const keepBtn = document.getElementById('keep-btn');
const removeBtn = document.getElementById('remove-btn');
const toastContainer = document.getElementById('toast-container');
const mainContent = document.querySelector('.main-content');
const arenaEl = document.querySelector('.arena');
const flashOverlay = document.getElementById('flash-overlay');
const trailCanvas = document.getElementById('trail-canvas');
const particleCanvas = document.getElementById('particle-canvas');
// Cinematic Gacha elements
const gachaOverlay = document.getElementById('gacha-overlay');
const gachaFlyCard = document.getElementById('gacha-fly-card');
const gachaFlyInner = document.getElementById('gacha-fly-inner');
const flyMysteryLayer = document.getElementById('fly-mystery-layer');
const flySecondContent = document.getElementById('fly-second-content');
const flyFirstLabel = document.getElementById('fly-first-label');
const flyFirstText = document.getElementById('fly-first-text');
const flySecondLabel = document.getElementById('fly-second-label');
const flySecondText = document.getElementById('fly-second-text');

// ============================================================
// CANVAS SETUP
// ============================================================
const trailCtx = trailCanvas.getContext('2d');
const pCtx = particleCanvas.getContext('2d');

function resizeCanvases() {
  [trailCanvas, particleCanvas].forEach(c => {
    c.width = window.innerWidth;
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
let trailActive = false;
let trailIntensity = 0;
const trailHistory = [];
const TRAIL_MAX = 28;

function sampleCardCenter() {
  const el = gachaMode ? gachaFlyCard : activeCard;
  const r = el.getBoundingClientRect();
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
      const alpha = progress * trailIntensity * 0.42;
      const size = p.w * 0.48 * progress;

      const grd = trailCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size + 24);
      grd.addColorStop(0, `rgba(56, 189, 248, ${alpha})`);
      grd.addColorStop(0.5, `rgba( 2, 132, 199, ${alpha * 0.55})`);
      grd.addColorStop(1, 'rgba(7, 89, 133, 0)');

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
// spawnEdgeSparkles: gold/blue sparks that fly outward from
//   the bottom half of the fly card's left and right edges.
// ============================================================
let particles = [];
let sparkleActive = false;
const CARD_SPARK_COLORS = [
  'rgba(15, 143, 207,',
  'rgba(7, 89, 133,',
  'rgba(125, 211, 252,',
];

function cardSparkColor() {
  return CARD_SPARK_COLORS[Math.floor(Math.random() * CARD_SPARK_COLORS.length)];
}

function spawnExplosion(cx, cy) {
  for (let i = 0; i < 110; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 11;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.013 + Math.random() * 0.022,
      r: 2 + Math.random() * 5.5,
      color: cardSparkColor(),
      gravity: 0.08 + Math.random() * 0.12,
    });
  }
}

function spawnTakeoffBurst() {
  const rect = gachaFlyCard.getBoundingClientRect();
  if (rect.width === 0) return;

  const cx = rect.left + rect.width * 0.5;
  const cy = rect.top + rect.height * 0.42;

  for (let i = 0; i < 44; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.45;
    const speed = 2.4 + Math.random() * 7.4;
    particles.push({
      x: cx + (Math.random() - 0.5) * rect.width * 0.68,
      y: cy + (Math.random() - 0.5) * rect.height * 0.22,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.024 + Math.random() * 0.018,
      r: 1.6 + Math.random() * 3.6,
      color: cardSparkColor(),
      gravity: 0.045 + Math.random() * 0.045,
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
    const yFrac = 0.5 + Math.random() * 0.5;    // bottom half
    const y = rect.top + rect.height * yFrac;
    const color = cardSparkColor();

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
    p.x += p.vx;
    p.y += p.vy;
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
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (from, to, t) => from + (to - from) * t;
const smootherStep = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const catmullRom = (p0, p1, p2, p3, t) => 0.5 * (
  (2 * p1) +
  (-p0 + p2) * t +
  (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
  (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
);

function animateFrame(duration, onFrame, easing = t => t) {
  return new Promise(resolve => {
    const start = performance.now();

    function tick(now) {
      const raw = clamp((now - start) / duration, 0, 1);
      onFrame(easing(raw), raw);

      if (raw < 1) requestAnimationFrame(tick);
      else resolve();
    }

    requestAnimationFrame(tick);
  });
}

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

  const lines = text.split('\n');
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
        textBack: line.substring(si + 1).trim(),
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
  totalCount.textContent = '0';
  remainingCount.textContent = '0';
  deckPile.classList.add('empty');
  clearActiveCard();
}

function updateCounterStats() {
  totalCount.textContent = deck.length;
  remainingCount.textContent = remainingIndices.length;
  deckPile.classList[remainingIndices.length === 0 ? 'add' : 'remove']('empty');
  syncPrimaryActionUI();
}

function syncPrimaryActionUI() {
  deckCardLabel.textContent = isAnimating ? 'Đang rút...' : 'Rút thẻ';
}

// ============================================================
// DISMISS GACHA (fade out overlay + fly card)
// ============================================================
async function dismissGacha() {
  if (!gachaMode) return;

  gachaFlyCard.classList.remove('glow-fly');
  gachaFlyCard.classList.remove('extracting-from-deck');
  gachaFlyInner.classList.remove('flight-mystery');
  deckPile.classList.remove('extracting');
  sparkleActive = false;
  trailActive = false;
  trailHistory.length = 0;

  // Cancel any running web animations so we start fresh
  gachaFlyCard.getAnimations().forEach(a => a.cancel());

  // Fade fly card downward
  gachaFlyCard.animate([
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1.0)' },
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
  gachaFlyCard.classList.remove('extracting-from-deck');
  gachaFlyInner.classList.remove('flight-mystery');
  deckPile.classList.remove('extracting');
  gachaMode = false;
  particles = [];
}

// ============================================================
// DRAW CARD - Full Cinematic Gacha Sequence
//
// Timeline (total approx 3.2 s):
//   Extraction from deck            0.0 s -> 0.4 s
//   Phase 1  S-curve flight         0.4 s -> 1.8 s
//   Phase 2  Spin at center         1.8 s -> 2.4 s
//   Phase 3  Impact + flip reveal   2.4 s -> 3.2 s
//
// Architecture:
//   - Outer card (#gacha-fly-card)   -> RAF extraction/flight + WAAPI charge/reveal
//   - Inner flip (#gacha-fly-inner)  -> CSS class transition (.revealed)
//   - Back/front content             -> populated by JS before draw starts
// ============================================================
async function drawCard() {
  if (isAnimating) return;
  if (remainingIndices.length === 0) {
    showToast('Hiện trong bộ không có thẻ', 'warning');
    return;
  }

  isAnimating = true;
  syncPrimaryActionUI();

  /* ── 1. Pick card ────────────────────────────────────────── */
  const rIdx = Math.floor(Math.random() * remainingIndices.length);
  activeIndexIndex = rIdx;
  const deckIdx = remainingIndices[rIdx];
  const cardData = deck[deckIdx];

  /* ── 2. Populate regular card (compatibility, stays hidden) ─ */
  [cardFrontText, cardBackText].forEach((el, i) => {
    const txt = i === 0 ? cardData.textFront : cardData.textBack;
    el.textContent = txt || '(Trống)';
    el.style.opacity = txt ? '1' : (i === 0 ? '0.35' : '0.5');
    el.style.fontStyle = txt ? 'normal' : 'italic';
  });

  /* ── 3. Determine face order ────────────────────────────────
     startWithBack = true  → 1st face = back (translation)
     startWithBack = false → 1st face = front (original)
  ─────────────────────────────────────────────────────────── */
  const startWithBack = initialFaceToggle.checked;
  const firstText = startWithBack ? (cardData.textBack || '(Trống)') : (cardData.textFront || '(Trống)');
  const secondText = startWithBack ? (cardData.textFront || '(Trống)') : (cardData.textBack || '(Trống)');

  flyFirstText.textContent = firstText;
  flyFirstLabel.textContent = startWithBack ? 'MẶT SAU' : 'MẶT TRƯỚC';
  flySecondText.textContent = secondText;
  flySecondLabel.textContent = startWithBack ? 'MẶT TRƯỚC' : 'MẶT SAU';

  /* ── 4. Reset fly card visual state ────────────────────────── */
  gachaFlyInner.classList.remove('revealed', 'user-flipped');
  gachaFlyInner.classList.add('flight-mystery');
  gachaFlyCard.classList.remove('glow-fly');
  flyMysteryLayer.style.display = '';    // mystery visible
  flySecondContent.hidden = true;  // second face hidden
  flyFirstFlipDone = false;
  isFlipped = false;

  /* ── 5. Activate fly card first; overlay fades in after the deck extraction beat. */
  gachaFlyCard.classList.add('active');
  gachaFlyCard.classList.add('extracting-from-deck');
  gachaMode = true;
  slotPlaceholder.classList.add('hidden');
  activeCard.classList.add('hidden');
  actionButtons.classList.add('hidden');
  actionButtons.classList.remove('gacha-mode');

  /* ── 6. Start edge sparkles ─────────────────────────────────── */
  sparkleActive = false;
  particles = [];

  /* ────────────────────────────────────────────────────────────
     PHASE 1: S-Curve Flight  (0 -> 1180 ms)

     Card emerges from the deck pile and sweeps through the
     trajectory in image_752677.png:
       • Small upward-left arc (first curve of S)
       • Wide rightward sweep (far right of screen, scale down)
       • Loop around and rush back to center (scale up)
  ─────────────────────────────────────────────────────────── */
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const flyRect = gachaFlyCard.getBoundingClientRect();
  const flyW = flyRect.width || 260;
  const flyH = flyRect.height || 370;
  const halfW = flyW / 2;
  const halfH = flyH / 2;

  // Deck pile screen position
  const dr = deckPile.getBoundingClientRect();
  const dpx = dr.left + dr.width / 2;
  const dpy = dr.top + dr.height / 2;

  // Helper: translate3d so fly card CENTER sits at viewport (cx, cy).
  // The card has `position:fixed; top:50%; left:50%` → TL is at (vw/2, vh/2).
  // Offset needed: (cx - halfW - vw/2, cy - halfH - vh/2)
  const tx = (cx, cy) =>
    `translate3d(${(cx - halfW - vw / 2).toFixed(1)}px,` +
    ` ${(cy - halfH - vh / 2).toFixed(1)}px, 0)`;

  const cx = vw / 2, cy = vh / 2;     // viewport center (landing target)
  const deckCardScale = Math.min(dr.width / flyW, dr.height / flyH) * 0.99;
  const deckPocketX = dpx + 8;
  const deckPocketY = dpy + 7;
  const extractionTopY = Math.max(86, dpy - Math.min(250, vh * 0.31));
  const skySweepY = Math.max(58, vh * 0.17);
  const swX = vw * 0.82, swY = vh * 0.38;   // far-right arc peak
  const loX = vw * 0.78, loY = vh * 0.66;   // loop bottom

  const setFlyPose = ({ x, y, scale, rotateZ, rotateX, rotateY, opacity = 1, blur = 0, clip = 0 }) => {
    gachaFlyCard.style.opacity = opacity.toFixed(3);
    gachaFlyCard.style.filter = `blur(${blur.toFixed(2)}px)`;
    gachaFlyCard.style.clipPath = `inset(${clip.toFixed(1)}% 0 ${clip.toFixed(1)}% 0 round 20px)`;
    gachaFlyCard.style.transform =
      `${tx(x, y)} scale(${scale.toFixed(3)}) ` +
      `rotateZ(${rotateZ.toFixed(1)}deg) rotateX(${rotateX.toFixed(1)}deg) rotateY(${rotateY.toFixed(1)}deg)`;
  };

  const phase1Duration = 1180;
  const flightKnots = [
    { offset: 0, x: dpx - 20, y: extractionTopY, scale: 0.70, tiltX: -8, tiltY: -8, spinY: 88, blur: 0.2, opacity: 1 },
    { offset: 0.14, x: dpx - 80, y: skySweepY, scale: 0.76, tiltX: -12, tiltY: -12, spinY: 190, blur: 0.9, opacity: 1 },
    { offset: 0.28, x: vw * 0.38, y: skySweepY + 20, scale: 0.70, tiltX: 10, tiltY: -15, spinY: 330, blur: 1.5, opacity: 1 },
    { offset: 0.43, x: vw * 0.66, y: vh * 0.25, scale: 0.60, tiltX: -14, tiltY: -10, spinY: 470, blur: 2.3, opacity: 1 },
    { offset: 0.58, x: swX, y: swY, scale: 0.54, tiltX: 13, tiltY: 12, spinY: 575, blur: 3.0, opacity: 1 },
    { offset: 0.70, x: loX, y: loY, scale: 0.58, tiltX: 15, tiltY: 8, spinY: 645, blur: 2.5, opacity: 1 },
    { offset: 0.84, x: cx + 132, y: cy - 78, scale: 1.12, tiltX: -11, tiltY: 15, spinY: 695, blur: 1.0, opacity: 1 },
    { offset: 0.94, x: cx - 26, y: cy + 18, scale: 1.05, tiltX: 6, tiltY: -7, spinY: 722, blur: 0.3, opacity: 1 },
    { offset: 1.0, x: cx, y: cy, scale: 1.00, tiltX: 0, tiltY: 0, spinY: 720, blur: 0, opacity: 1 },
  ];

  const segmentFor = (progress) => {
    const p = clamp(progress, 0, 1);
    let index = 0;
    while (index < flightKnots.length - 2 && p > flightKnots[index + 1].offset) {
      index++;
    }

    const start = flightKnots[index];
    const end = flightKnots[index + 1];
    const span = end.offset - start.offset || 1;
    return { index, t: clamp((p - start.offset) / span, 0, 1) };
  };

  const sampleScalar = (property, progress) => {
    const { index, t } = segmentFor(progress);
    const eased = smootherStep(t);
    return lerp(flightKnots[index][property], flightKnots[index + 1][property], eased);
  };

  const samplePosition = (progress) => {
    const { index, t } = segmentFor(progress);
    const p0 = flightKnots[Math.max(0, index - 1)];
    const p1 = flightKnots[index];
    const p2 = flightKnots[index + 1];
    const p3 = flightKnots[Math.min(flightKnots.length - 1, index + 2)];

    return {
      x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
      y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
    };
  };

  const tangentHeadAngle = (progress) => {
    const delta = 0.004;
    const prev = samplePosition(progress - delta);
    const next = samplePosition(progress + delta);
    const angleFromXAxis = Math.atan2(next.y - prev.y, next.x - prev.x) * 180 / Math.PI;

    // CSS rotateZ(0deg) points the card's top short edge upward.
    // +90deg converts an x-axis tangent into a top-edge heading.
    return angleFromXAxis + 90;
  };

  deckPile.classList.add('extracting');
  setFlyPose({
    x: deckPocketX,
    y: deckPocketY,
    scale: deckCardScale,
    rotateZ: 1.7,
    rotateX: 0,
    rotateY: 0,
    opacity: 0.94,
    blur: 0,
    clip: 0,
  });

  const takeoffAngle = tangentHeadAngle(0);
  const extractionDuration = 260;
  const takeoffDuration = extractionDuration + phase1Duration;
  const extractionShare = extractionDuration / takeoffDuration;
  gachaFlyCard.classList.remove('extracting-from-deck');
  gachaOverlay.classList.add('active');
  sparkleActive = true;
  trailActive = true;
  trailIntensity = 0;
  spawnTakeoffBurst();
  const rampT = performance.now();
  (function ramp() {
    trailIntensity = Math.min(1, (performance.now() - rampT) / 320);
    if (trailIntensity < 1) requestAnimationFrame(ramp);
  })();

  await animateFrame(takeoffDuration, (_, raw) => {
    if (raw < extractionShare) {
      const t = raw / extractionShare;
      const pullArc = Math.sin(t * Math.PI) * 42;
      const spinT = clamp((t - 0.34) / 0.66, 0, 1);
      setFlyPose({
        x: lerp(deckPocketX, dpx - 20, t) - pullArc,
        y: lerp(deckPocketY, extractionTopY, t),
        scale: lerp(deckCardScale, 0.70, t),
        rotateZ: lerp(1.7, takeoffAngle, t),
        rotateX: lerp(0, -8, t),
        rotateY: lerp(0, 80, smootherStep(spinT)),
        opacity: 1,
        blur: lerp(0, 0.2, t),
        clip: 0,
      });
      return;
    }

    const progress = clamp((raw - extractionShare) / (1 - extractionShare), 0, 1);
    const pos = samplePosition(progress);
    const tiltBreath = Math.sin(progress * Math.PI * 6) * Math.sin(progress * Math.PI) * 2.2;
    const scale = sampleScalar('scale', progress);
    const rotateX = sampleScalar('tiltX', progress) + tiltBreath;
    const rotateY = sampleScalar('spinY', progress) + sampleScalar('tiltY', progress);

    setFlyPose({
      x: pos.x,
      y: pos.y,
      scale,
      rotateZ: tangentHeadAngle(progress),
      rotateX,
      rotateY,
      opacity: sampleScalar('opacity', progress),
      blur: sampleScalar('blur', progress),
      clip: 0,
    });
  });

  trailActive = false;
  deckPile.classList.remove('extracting');

  /* ────────────────────────────────────────────────────────────
     PHASE 2: Spin at Center  (0 → 620 ms)
     Three full Y-axis rotations with building blur to
     "charge up" the energy before the reveal.
  ─────────────────────────────────────────────────────────── */
  const atCenter = tx(cx, cy);
  const landingHeadAngle = tangentHeadAngle(1).toFixed(1);
  const chargeStartSpin = 720;
  const chargeEndSpin = 1800;

  const phase2 = gachaFlyCard.animate([
    {
      offset: 0, filter: 'blur(0px)',
      transform: `${atCenter} scale(1.00) rotateZ(${landingHeadAngle}deg) rotateX(0deg) rotateY(${chargeStartSpin}deg)`
    },
    {
      offset: 0.55, filter: 'blur(4px) brightness(1.4)',
      transform: `${atCenter} scale(0.82) rotateZ(12deg) rotateX(-8deg) rotateY(${chargeStartSpin + 540}deg)`
    },
    {
      offset: 1.0, filter: 'blur(5px) brightness(1.6)',
      transform: `${atCenter} scale(0.82) rotateZ(0deg) rotateX(0deg) rotateY(${chargeEndSpin}deg)`
    },
  ], { duration: 620, easing: 'linear', fill: 'forwards' });

  await phase2.finished;
  gachaFlyInner.classList.remove('flight-mystery');

  /* ────────────────────────────────────────────────────────────
     PHASE 3: Impact + Flip Reveal  (0 → 520 ms)

     Outer card (position / scale):  Web Animations API
       0 %   → scale 0.82 (charged up small)
       28 %  → scale 1.65 (IMPACT blast)
       100 % → scale 1.0  (settled)

     Inner card (flip):  CSS transition on .revealed
       Starts at 240 ms, duration 650 ms (set in CSS).

     Timeline from Phase 3 start:
       140 ms → white flash + particles + screen shake (impact peak)
       170 ms → .revealed class added → inner starts rotating
       520 ms → outer anim done (await phase3.finished)
       320 ms → inner flip finishes (170 + 650 = 820 total, 520+300 ≈ 820)
  ─────────────────────────────────────────────────────────── */
  const phase3 = gachaFlyCard.animate([
    {
      offset: 0, filter: 'blur(5px) brightness(1.6)',
      transform: `${atCenter} scale(0.82) rotateY(${chargeEndSpin}deg)`
    },
    {
      offset: 0.28, filter: 'blur(0px) brightness(2.9)',
      transform: `${atCenter} scale(1.65) rotateY(${chargeEndSpin}deg)`
    },
    {
      offset: 1.0, filter: 'blur(0px) brightness(1.0)',
      transform: `${atCenter} scale(1.00) rotateY(${chargeEndSpin}deg)`
    },
  ], { duration: 520, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'forwards' });

  // Flash + particles + shake at impact peak (~140 ms)
  setTimeout(() => {
    flashOverlay.classList.remove('flash');
    void flashOverlay.offsetWidth;   // force reflow to restart the animation
    flashOverlay.classList.add('flash');

    const rect = gachaFlyCard.getBoundingClientRect();
    spawnExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2);

    arenaEl.classList.add('shake');
    setTimeout(() => arenaEl.classList.remove('shake'), 380);
  }, 140);

  // Start inner CSS flip 170 ms into Phase 3
  setTimeout(() => gachaFlyInner.classList.add('revealed'), 170);

  await phase3.finished;

  // Wait for the inner flip CSS transition to complete
  // (started at 170 ms, duration 650 ms → finishes at 820 ms;
  //  phase3 took 520 ms so we need ~300 ms more)
  await wait(320);

  /* ── Clean up web animations; restore CSS centering ────────
     After cancel() the element reverts to its CSS-defined
     transform: translate(-50%, -50%) which keeps it centered.
  ─────────────────────────────────────────────────────────── */
  gachaFlyCard.getAnimations().forEach(a => a.cancel());
  gachaFlyCard.style.cssText = '';

  /* ── Glow & reveal action buttons ──────────────────────── */
  gachaFlyCard.classList.add('glow-fly');
  actionButtons.classList.remove('hidden');
  actionButtons.classList.add('gacha-mode');

  isAnimating = false;
  syncPrimaryActionUI();
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
  activeIndexIndex = null;
  isFlipped = false;
  sparkleActive = false;
  gachaMode = false;
  flyFirstFlipDone = false;
  activeCard.style.cssText = '';
  activeCardInner.style.cssText = '';
  gachaFlyCard.classList.remove('extracting-from-deck');
  gachaFlyInner.classList.remove('flight-mystery');
  deckPile.classList.remove('extracting');
  syncPrimaryActionUI();
}

// ============================================================
// KEEP CARD  (keep in deck, dismiss gacha overlay)
// ============================================================
async function keepCard() {
  if (activeIndexIndex === null || isAnimating) return;
  isAnimating = true;
  syncPrimaryActionUI();

  await dismissGacha();
  clearActiveCard();
  showToast('Đã giữ lại thẻ trong bộ');

  isAnimating = false;
  syncPrimaryActionUI();
}

// ============================================================
// REMOVE CARD  (delete from deck & textarea line)
// ============================================================
async function removeCurrentCard() {
  if (activeIndexIndex === null || isAnimating) return;
  isAnimating = true;
  syncPrimaryActionUI();

  const originalDeckIndex = remainingIndices[activeIndexIndex];
  const cardData = deck[originalDeckIndex];
  const targetLineIndex = cardData.lineIndex;

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
  syncPrimaryActionUI();
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
        flySecondContent.hidden = false;
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
// PRIMARY DRAW / FLIP ACTION
// ============================================================
function handlePrimaryAction() {
  if (isAnimating) return;

  if (activeIndexIndex !== null) {
    toggleFlip();
    return;
  }

  if (remainingIndices.length === 0) {
    showToast('Hiện trong bộ không có thẻ', 'warning');
    return;
  }

  drawCard();
}

function setupPrimaryAction() {
  deckPile.addEventListener('click', () => {
    if (isAnimating) return;
    if (remainingIndices.length === 0) {
      showToast('Hiện trong bộ không có thẻ', 'warning');
      return;
    }
    drawCard();
  });
  activeCard.addEventListener('click', toggleFlip);
  gachaFlyCard.addEventListener('click', toggleFlip);
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  cardInput.addEventListener('input', parseCards);

  hideSidebarBtn.addEventListener('click', toggleSidebar);
  showSidebarBtn.addEventListener('click', toggleSidebar);

  keepBtn.addEventListener('click', keepCard);
  removeBtn.addEventListener('click', removeCurrentCard);

  window.addEventListener('keydown', (e) => {
    if (document.activeElement === cardInput || isAnimating) return;

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        handlePrimaryAction();
        break;
      case ' ':
        e.preventDefault();
        handlePrimaryAction();
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
  setupPrimaryAction();
  setupEventListeners();

  if (!cardInput.value.trim()) {
    cardInput.value =
      'Cảm ơn/Thank you\nTạm biệt/Goodbye\nTrái táo/Apple\nQuả chuối/Banana\nXe máy/Motorcycle';
  }
  parseCards();
}

document.addEventListener('DOMContentLoaded', init);
