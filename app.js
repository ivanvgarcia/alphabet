// ─── DOM References ───────────────────────────────────────────────────────────
const mainDisplay      = document.querySelector(".main-display");
const letterInput      = document.querySelector(".letter-input");
const sentenceViewer   = document.querySelector(".sentence");
const clearButton      = document.querySelector(".clear-button");
const sentenceDisplay  = document.getElementById("sentenceDisplay");
const letterName       = document.getElementById("letterName");
const letterCounter    = document.getElementById("letterCounter");
const muteBtn          = document.getElementById("muteBtn");
const letterGrid       = document.getElementById("letterGrid");
const numberGrid       = document.getElementById("numberGrid");
const modeBtns         = document.querySelectorAll(".mode-btn");

// ─── State ────────────────────────────────────────────────────────────────────
let createdSentence = [];
let isMuted         = localStorage.getItem("alphabetMuted") === "true";
let currentMode     = localStorage.getItem("alphabetMode") || "alphabet";
let colorIndex      = 0;
let autoClearTimer  = null;

// Respect the user's reduced-motion preference
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Child-friendly color palette
const COLORS = [
  "#ff4757", "#ff6b81", "#ffa502", "#ffdd59",
  "#7bed9f", "#2ed573", "#1e90ff", "#70a1ff",
  "#a29bfe", "#fd79a8", "#e17055", "#00b894"
];

// Letter names for the alphabet
const LETTER_NAMES = {
  A:"A", B:"B", C:"C", D:"D", E:"E", F:"F", G:"G", H:"H",
  I:"I", J:"J", K:"K", L:"L", M:"M", N:"N", O:"O", P:"P",
  Q:"Q", R:"R", S:"S", T:"T", U:"U", V:"V", W:"W", X:"X",
  Y:"Y", Z:"Z"
};

// ─── Sound System (Web Audio API) ─────────────────────────────────────────────
let audioCtx          = null;
let activeOscillator  = null;
let activeGainNode    = null;
let soundThrottleTimer = null;
let lastSoundTime      = 0;
const MIN_SOUND_GAP_MS = 100; // minimum gap between sounds to prevent cacophony

function getAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
  }
  // Resume if suspended by the browser's autoplay policy
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function stopCurrentSound() {
  if (activeGainNode && audioCtx) {
    try {
      activeGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      activeGainNode.gain.setValueAtTime(activeGainNode.gain.value, audioCtx.currentTime);
      activeGainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
    } catch (e) { /* ignore */ }
  }
  if (activeOscillator) {
    try { activeOscillator.stop(audioCtx ? audioCtx.currentTime + 0.03 : 0); } catch (e) { /* ignore */ }
    activeOscillator = null;
  }
  activeGainNode = null;
}

// C-major scale frequencies mapped to A-Z (cycling through the scale)
const NOTE_FREQUENCIES = [
  261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, // C D E F G A B
  523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77,
  1046.50, 1174.66, 1318.51, 1396.91, 1567.98, 1760.00,
  1975.53, 2093.00, 2349.32, 2637.02, 2793.83, 3135.96
];

function _playNoteNow(letterOrNum) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    stopCurrentSound();

    const oscillator = ctx.createOscillator();
    const gainNode   = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    let idx = 0;
    if (/^[A-Z]$/.test(letterOrNum)) {
      idx = letterOrNum.charCodeAt(0) - 65;
    } else if (!isNaN(letterOrNum)) {
      idx = (parseInt(letterOrNum, 10) - 1) % NOTE_FREQUENCIES.length;
    }
    oscillator.frequency.value = NOTE_FREQUENCIES[idx] || 440;
    oscillator.type = "sine";

    const t = ctx.currentTime;
    gainNode.gain.setValueAtTime(0.4, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    oscillator.start(t);
    oscillator.stop(t + 0.4);

    activeOscillator = oscillator;
    activeGainNode   = gainNode;
    lastSoundTime    = Date.now();

    oscillator.onended = () => {
      if (activeOscillator === oscillator) {
        activeOscillator = null;
        activeGainNode   = null;
      }
    };
  } catch (e) {
    // Audio not available – silently ignore
  }
}

// Throttle with trailing play: fire immediately if enough gap has passed, otherwise
// schedule the latest request to play when the throttle window expires.
// This prevents sound cacophony during rapid button mashing (toddler scenario)
// while ensuring every burst of input ends with an audible note.
function playNote(letterOrNum) {
  if (isMuted) return;

  const now = Date.now();
  const timeSinceLast = now - lastSoundTime;

  // Cancel any trailing play scheduled from a previous rapid press
  if (soundThrottleTimer) {
    clearTimeout(soundThrottleTimer);
    soundThrottleTimer = null;
  }

  if (timeSinceLast >= MIN_SOUND_GAP_MS) {
    // Enough time since the last sound – play immediately
    _playNoteNow(letterOrNum);
  } else {
    // Too soon – schedule a trailing play for when the throttle window expires
    soundThrottleTimer = setTimeout(() => {
      soundThrottleTimer = null;
      _playNoteNow(letterOrNum);
    }, MIN_SOUND_GAP_MS - timeSinceLast);
  }
}

function playCelebration() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    stopCurrentSound();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const start = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch (e) {
    // Audio not available – silently ignore
  }
}

// ─── Mode Management ──────────────────────────────────────────────────────────
function applyMode(mode) {
  currentMode = mode;
  try { localStorage.setItem("alphabetMode", mode); } catch (e) { /* quota exceeded – ignore */ }

  modeBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  if (mode === "numbers") {
    sentenceDisplay.classList.add("hidden");
    letterGrid.classList.add("hidden");
    numberGrid.classList.remove("hidden");
  } else if (mode === "letters") {
    sentenceDisplay.classList.add("hidden");
    letterGrid.classList.remove("hidden");
    numberGrid.classList.add("hidden");
  } else {
    // alphabet (default)
    sentenceDisplay.classList.remove("hidden");
    letterGrid.classList.remove("hidden");
    numberGrid.classList.add("hidden");
  }
}

modeBtns.forEach(btn => {
  btn.addEventListener("click", () => applyMode(btn.dataset.mode));
});

// ─── Mute Toggle ──────────────────────────────────────────────────────────────
function applyMute(muted) {
  isMuted = muted;
  try { localStorage.setItem("alphabetMuted", muted); } catch (e) { /* quota exceeded – ignore */ }
  muteBtn.textContent = muted ? "🔇" : "🔊";
  // Eagerly resume audio context when the user unmutes
  if (!muted) { getAudioContext(); }
}

muteBtn.addEventListener("click", () => applyMute(!isMuted));

// ─── Display Letter ───────────────────────────────────────────────────────────
function displayLetter(letter) {
  // Pick the next color
  const color = COLORS[colorIndex % COLORS.length];
  colorIndex++;

  letterInput.textContent = letter;
  letterInput.style.color = color;
  letterInput.style.textShadow = `1.5rem .5rem .1rem ${COLORS[(colorIndex + 3) % COLORS.length]}`;

  // Update letter name display
  letterName.textContent = LETTER_NAMES[letter] || letter;
  letterName.style.color = color;

  // Trigger animation only when reduced motion is not preferred
  if (!prefersReducedMotion) {
    letterInput.classList.remove("animation", "bounce", "spin");
    void letterInput.offsetWidth; // reflow to restart animation
    const animations = ["animation", "bounce", "spin"];
    letterInput.classList.add(animations[colorIndex % animations.length]);
  }

  // Track the letter and update sentence / counter
  createdSentence.push(letter);
  if (currentMode === "alphabet") {
    sentenceViewer.textContent = createdSentence.join("");
    sentenceViewer.classList.toggle("sentence-animate");
  }
  updateCounter();

  playNote(letter);
  resetAutoClear();
}

// ─── Update Counter ───────────────────────────────────────────────────────────
function updateCounter() {
  const count = createdSentence.length;
  if (currentMode === "numbers") {
    letterCounter.textContent = count === 1 ? "1 number" : `${count} numbers`;
  } else {
    letterCounter.textContent = count === 1 ? "1 letter" : `${count} letters`;
  }
}

// ─── Auto-Clear Timer ─────────────────────────────────────────────────────────
function resetAutoClear() {
  if (autoClearTimer) clearTimeout(autoClearTimer);
  autoClearTimer = setTimeout(() => {
    clearAll();
  }, 30000); // 30 seconds of inactivity
}

function clearAll() {
  createdSentence = [];
  sentenceViewer.textContent = "";
  updateCounter();
  playCelebration();
  letterInput.classList.remove("animation", "bounce", "spin");
}

// ─── Clear Button ─────────────────────────────────────────────────────────────
clearButton.addEventListener("click", () => {
  clearAll();
});

// ─── Keyboard Input ───────────────────────────────────────────────────────────
window.addEventListener("keydown", event => {
  if (event.repeat) return; // ignore key-hold auto-repeat to prevent rapid keypresses
  const key    = event.keyCode;
  const letter = event.key.toUpperCase();

  if (currentMode === "numbers") {
    // In numbers mode only accept digit keys
    if (key >= 49 && key <= 57) {
      const digit = String(key - 48);
      displayLetter(digit);
    }
    return;
  }

  if (key >= 65 && key <= 90) {
    displayLetter(letter);
  } else if (key === 32) {
    createdSentence.push(" ");
    if (currentMode === "alphabet") {
      sentenceViewer.textContent = createdSentence.join("");
    }
    updateCounter();
    resetAutoClear();
  } else if (key === 8) {
    createdSentence.pop();
    if (currentMode === "alphabet") {
      sentenceViewer.textContent = createdSentence.join("");
    }
    updateCounter();
  }
});

// ─── Letter Button Grid ───────────────────────────────────────────────────────
document.querySelectorAll(".letter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const letter = btn.dataset.letter;
    displayLetter(letter);
  });
});

// ─── Mouse Trail ──────────────────────────────────────────────────────────────
// Only create mouse trail on devices with a real pointer (skip on touch-only
// devices to avoid unnecessary DOM nodes and animation loops)
const hasPointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

if (hasPointer) {
  var dots  = [],
      mouse = { x: 0, y: 0 };

  var Dot = function() {
    this.x = 0;
    this.y = 0;
    this.node = (function() {
      var n = document.createElement("div");
      n.className = "trail";
      document.body.appendChild(n);
      return n;
    })();
  };

  Dot.prototype.draw = function() {
    this.node.style.left = this.x + "px";
    this.node.style.top  = this.y + "px";
  };

  for (var i = 0; i < 12; i++) {
    dots.push(new Dot());
  }

  function draw() {
    var x = mouse.x,
        y = mouse.y;

    dots.forEach(function(dot, index, dots) {
      var nextDot = dots[index + 1] || dots[0];
      dot.x = x;
      dot.y = y;
      dot.draw();
      x += (nextDot.x - dot.x) * 0.6;
      y += (nextDot.y - dot.y) * 0.6;
    });
  }

  window.addEventListener("mousemove", function(event) {
    mouse.x = event.pageX;
    mouse.y = event.pageY;
  });

  function animate() {
    draw();
    requestAnimationFrame(animate);
  }

  animate();
}

// ─── Initialise ───────────────────────────────────────────────────────────────
applyMode(currentMode);
applyMute(isMuted);

