
const STAGES = [
  { duration: 28, biteMin: 1300, biteMax: 2200, closedFor: [650, 980], goalPerSecond: 28 },
  { duration: 26, biteMin: 900, biteMax: 1700, closedFor: [620, 920], goalPerSecond: 33 },
  { duration: 24, biteMin: 650, biteMax: 1300, closedFor: [560, 860], goalPerSecond: 38 }
];

const dogImage = document.getElementById('dogImage');
const brush = document.getElementById('brush');
const plaque = document.getElementById('plaque');
const mouthZone = document.getElementById('mouthZone');
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('startButton');
const stateBadge = document.getElementById('stateBadge');
const fxText = document.getElementById('fxText');
const timeText = document.getElementById('timeText');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const stageText = document.getElementById('stageText');
const livesEl = document.getElementById('lives');
const gameArea = document.getElementById('gameArea');
const muteButton = document.getElementById('muteButton');

const ASSETS = {
  open: 'assets/dog-open.png',
  closed: 'assets/dog-closed.png',
  heartFull: 'assets/heart-full.png',
  heartBroken: 'assets/heart-broken.png'
};

const state = {
  running: false,
  stageIndex: 0,
  timeLeft: 0,
  progress: 0,
  livesLost: 0,
  mouthOpen: true,
  pointerX: 0.78,
  pointerY: 0.84,
  brushing: false,
  lastTs: 0,
  nextBiteAt: 0,
  closedUntil: 0,
  biteLock: false,
  audioAllowed: true
};

function preloadAssets() {
  Object.values(ASSETS).forEach(src => {
    const img = new Image();
    img.src = src;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function resetForStage(index) {
  const stage = STAGES[index];
  state.stageIndex = index;
  state.timeLeft = stage.duration;
  state.progress = 0;
  state.mouthOpen = true;
  state.nextBiteAt = performance.now() + rand(stage.biteMin, stage.biteMax);
  state.closedUntil = 0;
  state.biteLock = false;
  dogImage.src = ASSETS.open;
  stageText.textContent = `${index + 1} / ${STAGES.length}`;
  updateHud();
  setStateBadge(true);
  updatePlaque();
}

function startGame() {
  state.running = true;
  state.livesLost = 0;
  buildLives();
  overlay.classList.remove('show');
  resetForStage(0);
  state.lastTs = performance.now();
  requestAnimationFrame(loop);
}

function buildLives() {
  livesEl.innerHTML = '';
  for (let i = 0; i < 3; i += 1) {
    const img = document.createElement('img');
    img.className = 'life-icon';
    img.src = i < state.livesLost ? ASSETS.heartBroken : ASSETS.heartFull;
    img.alt = i < state.livesLost ? 'ダメージ済み' : '残機';
    livesEl.appendChild(img);
  }
}

function updateHud() {
  timeText.textContent = state.timeLeft.toFixed(1);
  progressText.textContent = `${Math.floor(state.progress)}%`;
  progressBar.style.width = `${state.progress}%`;
}

function setStateBadge(isOpen) {
  stateBadge.textContent = isOpen ? 'OPEN' : 'CLOSED';
  stateBadge.classList.toggle('open', isOpen);
  stateBadge.classList.toggle('closed', !isOpen);
}

function updatePlaque() {
  const scale = clamp(0.55 + (100 - state.progress) / 100 * 0.85, 0.55, 1.4);
  plaque.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${(100 - state.progress) * 0.18 - 8}deg)`;
  plaque.style.opacity = String(clamp((100 - state.progress) / 110, 0.05, 0.88));
}

function showFx(text, kind) {
  fxText.textContent = text;
  fxText.className = `fx-text show ${kind}`;
  clearTimeout(showFx.timer);
  showFx.timer = setTimeout(() => {
    fxText.className = 'fx-text';
  }, 520);
}

function setOverlay(title, body, buttonText = 'もう一回') {
  overlay.innerHTML = `
    <div class="overlay-card">
      <h2>${title}</h2>
      <p>${body}</p>
      <div class="controls">
        <button id="restartButton" class="primary">${buttonText}</button>
      </div>
    </div>
  `;
  overlay.classList.add('show');
  document.getElementById('restartButton').addEventListener('click', startGame);
}

function getRectsOverlap(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function getBrushRect() {
  return brush.getBoundingClientRect();
}

function getMouthRect() {
  return mouthZone.getBoundingClientRect();
}

function setBrushPosition(clientX, clientY) {
  const rect = gameArea.getBoundingClientRect();
  const x = clamp((clientX - rect.left) / rect.width, 0.06, 0.94);
  const y = clamp((clientY - rect.top) / rect.height, 0.08, 0.94);
  state.pointerX = x;
  state.pointerY = y;
  brush.style.left = `${x * 100}%`;
  brush.style.top = `${y * 100}%`;
}

function damagePlayer() {
  if (state.biteLock) return;
  state.biteLock = true;
  state.livesLost += 1;
  buildLives();
  showFx('ガブッ!!', 'bad');
  playBite();
  gameArea.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }],
    { duration: 180, iterations: 1 }
  );
  if (state.livesLost >= 3) {
    state.running = false;
    setOverlay('ゲームオーバー', '3回噛まれてしまった…。もう一度チャレンジ。');
  }
}

function nextStage() {
  playSuccess();
  if (state.stageIndex >= STAGES.length - 1) {
    state.running = false;
    setOverlay('クリア！', '歯みがき大成功。GitHubにそのまま置けるブラウザゲーム完成版です。', '最初から遊ぶ');
    return;
  }
  const next = state.stageIndex + 1;
  overlay.innerHTML = `
    <div class="overlay-card">
      <h2>ステージ ${next} クリア！</h2>
      <p>次はもっと噛むのが速い。油断厳禁。</p>
      <div class="controls">
        <button id="nextButton" class="primary">次へ</button>
      </div>
    </div>
  `;
  overlay.classList.add('show');
  document.getElementById('nextButton').addEventListener('click', () => {
    overlay.classList.remove('show');
    resetForStage(next);
    state.lastTs = performance.now();
    requestAnimationFrame(loop);
  });
}

function maybeToggleMouth(now) {
  const stage = STAGES[state.stageIndex];
  if (state.mouthOpen && now >= state.nextBiteAt) {
    state.mouthOpen = false;
    state.closedUntil = now + rand(stage.closedFor[0], stage.closedFor[1]);
    dogImage.src = ASSETS.closed;
    setStateBadge(false);
    playClose();
  } else if (!state.mouthOpen && now >= state.closedUntil) {
    state.mouthOpen = true;
    state.nextBiteAt = now + rand(stage.biteMin, stage.biteMax);
    state.biteLock = false;
    dogImage.src = ASSETS.open;
    setStateBadge(true);
    playOpen();
  }
}

function updateGame(dt, now) {
  maybeToggleMouth(now);

  const brushingNow = state.brushing;
  brush.classList.toggle('active', brushingNow);

  const brushRect = getBrushRect();
  const mouthRect = getMouthRect();
  const inMouth = getRectsOverlap(brushRect, mouthRect);

  if (brushingNow && inMouth) {
    if (state.mouthOpen) {
      const gain = STAGES[state.stageIndex].goalPerSecond * dt;
      state.progress = clamp(state.progress + gain, 0, 100);
      playBrush();
      if (Math.random() < 0.06) showFx('シャカシャカ', 'good');
      updatePlaque();
      if (state.progress >= 100) {
        nextStage();
        return;
      }
    } else {
      damagePlayer();
    }
  }

  state.timeLeft = clamp(state.timeLeft - dt, 0, 999);
  if (state.timeLeft <= 0) {
    state.running = false;
    setOverlay('時間切れ', '全部みがく前にタイムアップ。もう一度！');
  }

  updateHud();
}

function loop(now) {
  if (!state.running) return;
  const dt = Math.min((now - state.lastTs) / 1000, 0.05);
  state.lastTs = now;
  updateGame(dt, now);
  if (state.running) requestAnimationFrame(loop);
}

function installPointerControls() {
  const activate = (e) => {
    state.brushing = true;
    if (e) updateFromEvent(e);
  };
  const deactivate = () => {
    state.brushing = false;
  };
  const updateFromEvent = (e) => {
    const point = e.touches ? e.touches[0] : e;
    if (!point) return;
    setBrushPosition(point.clientX, point.clientY);
  };

  gameArea.addEventListener('mousedown', (e) => { activate(e); });
  window.addEventListener('mousemove', updateFromEvent);
  window.addEventListener('mouseup', deactivate);

  gameArea.addEventListener('touchstart', (e) => { activate(e); e.preventDefault(); }, { passive: false });
  gameArea.addEventListener('touchmove', (e) => { updateFromEvent(e); e.preventDefault(); }, { passive: false });
  window.addEventListener('touchend', deactivate);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      state.brushing = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') state.brushing = false;
  });
}

let audioContext = null;
let lastBrushAt = 0;
let muted = false;

function ensureAudio() {
  if (muted || !state.audioAllowed) return null;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

function tone(freq, duration, type = 'sine', gainValue = 0.03) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.stop(ctx.currentTime + duration);
}

function playBrush() {
  const now = performance.now();
  if (now - lastBrushAt < 90) return;
  lastBrushAt = now;
  tone(860, 0.04, 'square', 0.012);
}

function playBite() {
  tone(180, 0.12, 'sawtooth', 0.06);
  setTimeout(() => tone(120, 0.16, 'sawtooth', 0.045), 40);
}

function playSuccess() {
  tone(659, 0.12, 'triangle', 0.05);
  setTimeout(() => tone(784, 0.12, 'triangle', 0.05), 90);
  setTimeout(() => tone(988, 0.18, 'triangle', 0.05), 180);
}

function playOpen() {
  tone(520, 0.05, 'sine', 0.015);
}

function playClose() {
  tone(240, 0.05, 'square', 0.02);
}

muteButton.addEventListener('click', () => {
  muted = !muted;
  muteButton.textContent = muted ? '🔈 サウンド OFF' : '🔊 サウンド ON';
  muteButton.setAttribute('aria-pressed', String(muted));
});

startButton.addEventListener('click', startGame);
preloadAssets();
buildLives();
installPointerControls();
updateHud();
updatePlaque();
