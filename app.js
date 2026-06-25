// State Management
let deck = []; // Array of { textFront, textBack, lineIndex }
let remainingIndices = []; // Indices of deck cards still in play
let activeIndexIndex = null; // Index inside remainingIndices of current card
let isFlipped = false;
let isProgrammaticChange = false;

// DOM Elements
const cardInput = document.getElementById('card-input');
const validationInfo = document.getElementById('validation-info');
const sidebar = document.getElementById('sidebar');
const hideSidebarBtn = document.getElementById('hide-sidebar-btn');
const showSidebarBtn = document.getElementById('show-sidebar-btn');
const initialFaceToggle = document.getElementById('initial-face-toggle');
const remainingCount = document.getElementById('remaining-count');
const totalCount = document.getElementById('total-count');
const deckPile = document.getElementById('deck-pile');
const cardSlot = document.getElementById('card-slot');
const slotPlaceholder = document.getElementById('slot-placeholder');
const activeCard = document.getElementById('active-card');
const activeCardInner = document.getElementById('active-card-inner');
const cardFront = document.getElementById('card-front');
const cardBack = document.getElementById('card-back');
const cardFrontText = document.getElementById('card-front-text');
const cardBackText = document.getElementById('card-back-text');
const actionButtons = document.getElementById('action-buttons');
const keepBtn = document.getElementById('keep-btn');
const removeBtn = document.getElementById('remove-btn');
const toastContainer = document.getElementById('toast-container');
const mainContent = document.querySelector('.main-content');

// Toast Notification
function showToast(message, type = 'info') {
  // Clear previous identical toasts to avoid stack clutter
  const existingToasts = document.querySelectorAll('.toast');
  existingToasts.forEach(t => {
    if (t.textContent === message) t.remove();
  });

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  // Auto remove after 3s
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Parsing Input Text to Cards
function parseCards() {
  const text = cardInput.value;
  // If textarea is completely empty, set deck to empty
  if (!text.trim()) {
    deck = [];
    if (!isProgrammaticChange) {
      remainingIndices = [];
    }
    updateUIForEmptyDeck();
    return;
  }

  const lines = text.split('\n');
  const newDeck = [];
  let blankLinesCount = 0;
  let invalidFormatCount = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') {
      // Empty line -> 2 empty faces
      newDeck.push({
        textFront: '',
        textBack: '',
        lineIndex: index
      });
      blankLinesCount++;
    } else if (!line.includes('/')) {
      // Missing slash -> 1 empty face (front has text, back empty)
      newDeck.push({
        textFront: trimmed,
        textBack: '',
        lineIndex: index
      });
      invalidFormatCount++;
    } else {
      // Valid line -> split at first slash
      const slashIndex = line.indexOf('/');
      const front = line.substring(0, slashIndex).trim();
      const back = line.substring(slashIndex + 1).trim();
      newDeck.push({
        textFront: front,
        textBack: back,
        lineIndex: index
      });
    }
  });

  deck = newDeck;

  // Handle remainingIndices state
  if (isProgrammaticChange) {
    // Just sync/clean up indices that might have shifted or been removed.
    // Programmatic change logic (e.g. card removal) is handled in removeCurrentCard().
    isProgrammaticChange = false;
  } else {
    // Manual edit by user -> reset deck state completely
    remainingIndices = deck.map((_, idx) => idx);
    clearActiveCard();
  }

  updateCounterStats();
  updateValidationBadge(blankLinesCount, invalidFormatCount);
}

function updateUIForEmptyDeck() {
  totalCount.textContent = '0';
  remainingCount.textContent = '0';
  deckPile.classList.add('empty');
  clearActiveCard();
  
  validationInfo.className = 'validation-info error';
  validationInfo.textContent = 'Chưa có thẻ. Hãy nhập thông tin thẻ ở trên.';
}

function updateCounterStats() {
  totalCount.textContent = deck.length;
  remainingCount.textContent = remainingIndices.length;

  if (remainingIndices.length === 0) {
    deckPile.classList.add('empty');
  } else {
    deckPile.classList.remove('empty');
  }
}

function updateValidationBadge(blanks, invalids) {
  if (deck.length === 0) {
    updateUIForEmptyDeck();
    return;
  }

  if (blanks > 0 || invalids > 0) {
    validationInfo.className = 'validation-info warning';
    validationInfo.innerHTML = `Đã nạp <strong>${deck.length}</strong> thẻ.<br>Lưu ý: Có ${blanks} dòng trống & ${invalids} dòng thiếu dấu / (được coi là mặt trống).`;
  } else {
    validationInfo.className = 'validation-info success';
    validationInfo.innerHTML = `Đã nạp thành công <strong>${deck.length}</strong> thẻ hoạt động.`;
  }
}

// Drawing a Card
function drawCard() {
  if (remainingIndices.length === 0) {
    showToast('Hiện trong bộ không có thẻ', 'warning');
    clearActiveCard();
    return;
  }

  // Draw randomly
  const randomIdxIndex = Math.floor(Math.random() * remainingIndices.length);
  activeIndexIndex = randomIdxIndex;
  const originalDeckIndex = remainingIndices[randomIdxIndex];
  const cardData = deck[originalDeckIndex];

  // Setup text content
  if (cardData.textFront === '') {
    cardFrontText.textContent = '(Trống)';
    cardFrontText.style.opacity = '0.35';
    cardFrontText.style.fontStyle = 'italic';
  } else {
    cardFrontText.textContent = cardData.textFront;
    cardFrontText.style.opacity = '1';
    cardFrontText.style.fontStyle = 'normal';
  }

  if (cardData.textBack === '') {
    cardBackText.textContent = '(Trống)';
    cardBackText.style.opacity = '0.5';
    cardBackText.style.fontStyle = 'italic';
  } else {
    cardBackText.textContent = cardData.textBack;
    cardBackText.style.opacity = '1';
    cardBackText.style.fontStyle = 'normal';
  }

  // Display elements
  slotPlaceholder.classList.add('hidden');
  activeCard.classList.remove('hidden');
  actionButtons.classList.remove('hidden');

  // Handle Initial Face Option
  const startWithBack = initialFaceToggle.checked;
  if (startWithBack) {
    activeCard.classList.add('flipped');
    isFlipped = true;
  } else {
    activeCard.classList.remove('flipped');
    isFlipped = false;
  }

  // Play draw animation
  activeCard.classList.remove('drawing-animation');
  void activeCard.offsetWidth; // Trigger reflow to restart keyframe
  activeCard.classList.add('drawing-animation');
}

// Clear drawn card visual
function clearActiveCard() {
  slotPlaceholder.classList.remove('hidden');
  activeCard.classList.add('hidden');
  activeCard.classList.remove('flipped');
  actionButtons.classList.add('hidden');
  activeIndexIndex = null;
  isFlipped = false;
}

// Keep Card (put back/keep in pool)
function keepCard() {
  if (activeIndexIndex === null) return;
  
  // Transition out active card and then clear
  activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  activeCard.style.transform = 'translateY(100px) scale(0.9)';
  activeCard.style.opacity = '0';
  
  setTimeout(() => {
    clearActiveCard();
    // Restore styling properties for next card
    activeCard.style.transition = '';
    activeCard.style.transform = '';
    activeCard.style.opacity = '';
    showToast('Đã giữ lại thẻ trong bộ');
  }, 300);
}

// Remove Card (remove from deck & delete its line in text box)
function removeCurrentCard() {
  if (activeIndexIndex === null) return;

  const originalDeckIndex = remainingIndices[activeIndexIndex];
  const cardData = deck[originalDeckIndex];
  const targetLineIndex = cardData.lineIndex;

  // 1. Remove line from textarea
  const lines = cardInput.value.split('\n');
  if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
    lines.splice(targetLineIndex, 1);
    
    isProgrammaticChange = true;
    cardInput.value = lines.join('\n');
  }

  // 2. Remove index from active remaining list
  remainingIndices.splice(activeIndexIndex, 1);

  // 3. Shift remaining indices that are greater than targetLineIndex
  // Because in the updated textarea, those lines moved up by 1 position.
  remainingIndices = remainingIndices.map(idx => {
    const origCard = deck[idx];
    if (origCard.lineIndex > targetLineIndex) {
      // Find where it maps in the new line system
      return idx; // Will be re-mapped when parseCards builds the new deck
    }
    return idx;
  });

  // Since we modified textarea, let's trigger parseCards programmatically
  // This will rebuild `deck` based on the new text, where new index maps are correct.
  // We need to keep our `remainingIndices` aligned.
  // Actually, let's calculate the new remainingIndices based on mapping:
  // Before deletion, the cards kept in the pool had specific texts.
  // Let's adjust remainingIndices:
  // An index in remainingIndices pointed to deck[idx].
  // Now that one line is deleted:
  // - Any index pointing to a card before targetLineIndex retains its index value.
  // - The targetLineIndex card is deleted (already removed from remainingIndices).
  // - Any index pointing to a card after targetLineIndex is decremented by 1.
  remainingIndices = remainingIndices.map(idx => {
    if (idx > originalDeckIndex) {
      return idx - 1;
    }
    return idx;
  });

  // Re-run parser
  parseCards();

  // Clear card display with animation
  activeCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  activeCard.style.transform = 'translateX(150px) rotate(15deg) scale(0.9)';
  activeCard.style.opacity = '0';

  setTimeout(() => {
    clearActiveCard();
    activeCard.style.transition = '';
    activeCard.style.transform = '';
    activeCard.style.opacity = '';
    showToast('Đã loại bỏ thẻ khỏi bộ', 'info');
  }, 300);
}

// Toggle flip card face
function toggleFlip() {
  if (activeIndexIndex === null) return;
  activeCard.classList.toggle('flipped');
  isFlipped = !isFlipped;
}

// Sidebar Visibility toggle
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

// Drag and Drop Logic
function setupDragAndDrop() {
  // Drag start from pile
  deckPile.addEventListener('dragstart', (e) => {
    if (remainingIndices.length === 0) {
      e.preventDefault();
      return;
    }
    deckPile.classList.add('dragging');
    e.dataTransfer.setData('text/plain', 'draw');
    e.dataTransfer.effectAllowed = 'copy';
  });

  deckPile.addEventListener('dragend', () => {
    deckPile.classList.remove('dragging');
  });

  // Card slot drop target
  cardSlot.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (remainingIndices.length > 0) {
      cardSlot.classList.add('drag-over');
    }
  });

  cardSlot.addEventListener('dragleave', () => {
    cardSlot.classList.remove('drag-over');
  });

  cardSlot.addEventListener('drop', (e) => {
    e.preventDefault();
    cardSlot.classList.remove('drag-over');
    
    if (remainingIndices.length === 0) {
      showToast('Hiện trong bộ không có thẻ', 'warning');
      return;
    }
    
    const data = e.dataTransfer.getData('text/plain');
    if (data === 'draw') {
      drawCard();
    }
  });

  // Click on pile to draw as well
  deckPile.addEventListener('click', () => {
    if (remainingIndices.length === 0) {
      showToast('Hiện trong bộ không có thẻ', 'warning');
      return;
    }
    drawCard();
  });
}

// Event Listeners setup
function setupEventListeners() {
  // Input parser
  cardInput.addEventListener('input', parseCards);

  // Buttons
  hideSidebarBtn.addEventListener('click', toggleSidebar);
  showSidebarBtn.addEventListener('click', toggleSidebar);
  
  activeCard.addEventListener('click', toggleFlip);
  
  keepBtn.addEventListener('click', keepCard);
  removeBtn.addEventListener('click', removeCurrentCard);

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // If typing in input, ignore shortcuts
    if (document.activeElement === cardInput) {
      return;
    }

    const key = e.key;

    if (key === ' ') {
      // Space -> Draw card (if slot empty) or flip card (if slot active)
      e.preventDefault();
      if (activeIndexIndex === null) {
        drawCard();
      } else {
        toggleFlip();
      }
    } else if (key === 'ArrowLeft' || key.toLowerCase() === 'k') {
      // Left arrow / K -> Keep card
      if (activeIndexIndex !== null) {
        keepCard();
      }
    } else if (key === 'ArrowRight' || key.toLowerCase() === 'r') {
      // Right arrow / R -> Remove card
      if (activeIndexIndex !== null) {
        removeCurrentCard();
      }
    } else if (key.toLowerCase() === 'h') {
      // H -> Toggle sidebar
      toggleSidebar();
    }
  });
}

// Initial setup
function init() {
  setupDragAndDrop();
  setupEventListeners();
  
  // Set default cards if text area is empty
  if (!cardInput.value.trim()) {
    cardInput.value = `Xin chào/Hello\nCảm ơn/Thank you\nTạm biệt/Goodbye\nTrái táo/Apple\nQuả chuối/Banana\nXe máy/Motorcycle\n/Mặt trước trống\nMặt sau trống/\n\nLỗi định dạng không có gạch chéo`;
  }
  
  parseCards();
}

// Run application
document.addEventListener('DOMContentLoaded', init);
