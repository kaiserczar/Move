import { createHandDetector, createPersonSegmenter, createPoseDetector } from './core/vision.js';
import { PlayerTracker } from './core/tracker.js';
import { HandTracker } from './core/hands.js';
import { PersonCutout } from './core/cutout.js';
import { isVisible } from './core/landmarks.js';
import { buildBody } from './core/body.js';
import { drawSkeleton } from './core/skeleton.js';
import { dist, mid } from './core/geom.js';
import { drawAvatar } from './avatar/avatar.js';
import { MAX_PLAYERS, PLAYER_COLORS, state } from './state.js';
import { initUI } from './ui.js';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const spinner = document.getElementById('spinner');
const startBtn = document.getElementById('start-btn');
const hint = document.getElementById('hint');
const fpsEl = document.getElementById('fps');
const countEl = document.getElementById('count');

const tracker = new PlayerTracker(MAX_PLAYERS);
const handTracker = new HandTracker();
let handsLoading = null;
const cutout = new PersonCutout();
let cutoutLoading = null;
let detector = null;
let loadToken = 0;
let lastVideoTime = -1;
let players = [];
let emptySince = performance.now();
let detections = 0;
let fpsWindowStart = performance.now();

const ui = initUI({
  onDisplayChange(key) {
    if (key === 'mirror') { tracker.reset(); handTracker.reset(); }
    if (key === 'model') loadModel().catch(showModelError);
    if (key === 'hands' && state.display.hands) loadHands();
    if (key === 'cutout' && state.display.cutout) loadCutout();
  },
});

/** Background-removal model also loads lazily, only once the option is turned on. */
function loadCutout() {
  if (cutout.task || cutoutLoading) return;
  cutoutLoading = createPersonSegmenter()
    .then((task) => cutout.setTask(task))
    .catch((err) => console.error('Background removal unavailable:', err))
    .finally(() => { cutoutLoading = null; });
}

/** Hand model loads lazily in the background; pose tracking works without it. */
function loadHands() {
  if (handTracker.detector || handsLoading) return;
  handsLoading = createHandDetector()
    .then((d) => handTracker.setDetector(d))
    .catch((err) => console.error('Hand tracking unavailable:', err))
    .finally(() => { handsLoading = null; });
}

// ---------- startup ----------

function setOverlay(text, { busy = true, button = false } = {}) {
  overlay.hidden = text == null;
  if (text == null) return;
  overlayText.textContent = text;
  spinner.hidden = !busy;
  startBtn.hidden = !button;
}

function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError': return 'Camera access was blocked. Allow the camera in your browser\'s address bar, then try again.';
    case 'NotFoundError': return 'No camera was found. Connect a webcam and try again.';
    case 'NotReadableError': return 'The camera is busy in another app. Close it there and try again.';
    default: return err?.message || 'Could not start the camera.';
  }
}

function showModelError(err) {
  console.error(err);
  setOverlay('Could not load the pose model. It downloads from a CDN on first run, so check your internet connection and reload.', { busy: false });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API unavailable. Open this page from http://localhost (or https), not as a file.');
  }
  video.srcObject?.getTracks().forEach((t) => t.stop());
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
}

async function loadModel() {
  const token = ++loadToken;
  const old = detector;
  detector = null;
  old?.close();
  setOverlay(`Loading pose model (${state.display.model})…`);
  const d = await createPoseDetector(state.display.model, MAX_PLAYERS);
  if (token !== loadToken) { d.close(); return; }
  detector = d;
  tracker.reset();
  emptySince = performance.now();
  setOverlay(null);
}

async function boot() {
  try {
    setOverlay('Requesting camera access…');
    await startCamera();
  } catch (err) {
    console.error(err);
    setOverlay(cameraErrorMessage(err), { busy: false, button: true });
    return;
  }
  try { await loadModel(); } catch (err) { showModelError(err); return; }
  if (state.display.hands) loadHands();
  if (state.display.cutout) loadCutout();
}

startBtn.addEventListener('click', boot);

// ---------- frame loop ----------

function toDisplay(landmarks, W, H, mirror) {
  return landmarks.map((p) => ({
    x: (mirror ? 1 - p.x : p.x) * W,
    y: p.y * H,
    v: p.visibility ?? 1,
  }));
}

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const W = canvas.width;
  const H = canvas.height;

  let newFrame = false;
  if (detector && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = detector.detectForVideo(video, now);
    tracker.update((result.landmarks ?? []).map((lm) => toDisplay(lm, W, H, state.display.mirror)), now, W);
    detections++;
    newFrame = true;
  }

  players = tracker.players(now).map((p) => ({ ...p, body: buildBody(p.joints) }));

  const handsOn = state.display.hands;
  if (handsOn && newFrame) {
    handTracker.update(video, players, { mirror: state.display.mirror, now, width: W, height: H });
  }
  for (const p of players) {
    const hand = (side) => {
      const name = `${side}Wrist`;
      return handsOn ? handTracker.get(p.id, side, now, isVisible(p.joints, name) ? p.joints[name] : null) : null;
    };
    p.hands = { left: hand('left'), right: hand('right') };
  }

  if (newFrame && state.display.camera && state.display.cutout) cutout.update(video, now);

  render(W, H, now);
  updateHud(now);
}

function drawVideo(W, H) {
  ctx.save();
  if (state.display.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();
}

function drawBackground(W, H) {
  switch (state.display.background) {
    case 'blur':
      ctx.save();
      ctx.filter = `blur(${Math.round(W / 70)}px)`;
      drawVideo(W, H);
      ctx.restore();
      ctx.fillStyle = 'rgba(10,12,22,0.3)';
      ctx.fillRect(0, 0, W, H);
      break;
    case 'dark':
      ctx.fillStyle = '#12152a';
      ctx.fillRect(0, 0, W, H);
      break;
    case 'green':
      ctx.fillStyle = '#00b140';
      ctx.fillRect(0, 0, W, H);
      break;
    default:
      drawStage(W, H);
  }
}

function render(W, H, now) {
  const d = state.display;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (d.camera && video.readyState >= 2) {
    if (d.cutout && cutout.ready(now)) {
      drawBackground(W, H);
      cutout.drawPeople(ctx, video, W, H, d.mirror);
    } else {
      // Full camera frame (also shown while the background-removal model is still loading).
      drawVideo(W, H);
      if (d.avatar) { ctx.fillStyle = 'rgba(10,12,22,0.35)'; ctx.fillRect(0, 0, W, H); }
    }
  } else {
    drawStage(W, H);
  }

  for (const p of players) {
    const color = PLAYER_COLORS[p.id];
    if (d.avatar && p.body) drawAvatar(ctx, p.body, state.players[p.id], p.hands);
    if (d.skeleton) drawSkeleton(ctx, p, color, { angles: d.angles });
    if (p.body) drawTag(p, color, p.id === state.selected);
  }
}

function drawStage(W, H) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1d2340');
  sky.addColorStop(1, '#0b0d17');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const horizon = H * 0.72;
  const floor = ctx.createLinearGradient(0, horizon, 0, H);
  floor.addColorStop(0, '#272d4d');
  floor.addColorStop(1, '#141830');
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, W, H - horizon);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = -10; i <= 10; i++) {
    ctx.moveTo(W / 2 + i * W * 0.04, horizon);
    ctx.lineTo(W / 2 + i * W * 0.16, H);
  }
  for (let k = 1; k < 6; k++) {
    const y = horizon + (H - horizon) * (k / 6) ** 1.6;
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

function drawTag(p, color, selected) {
  const h = p.body.head;
  const fs = Math.max(14, p.body.s * 0.15);
  const x = h.c.x;
  const y = h.c.y - h.r * 1.75;
  const text = `P${p.id + 1}`;
  ctx.font = `700 ${fs}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + fs * 1.0;
  const hh = fs * 1.5;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - hh / 2, w, hh, hh / 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (selected) {
    ctx.lineWidth = Math.max(2, fs * 0.16);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
  ctx.fillStyle = '#0d0f17';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}

function updateHud(now) {
  if (now - fpsWindowStart >= 500) {
    fpsEl.textContent = `${Math.round((detections * 1000) / (now - fpsWindowStart))} fps`;
    detections = 0;
    fpsWindowStart = now;
  }
  countEl.textContent = `${players.length} ${players.length === 1 ? 'person' : 'people'}`;
  ui.setPlayerStatus(players, { hands: state.display.hands, mirror: state.display.mirror });

  if (players.length) emptySince = now;
  hint.hidden = !(detector && now - emptySince > 1500);
}

// Click an avatar on the stage to edit that player.
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const pt = {
    x: ((e.clientX - r.left) * canvas.width) / r.width,
    y: ((e.clientY - r.top) * canvas.height) / r.height,
  };
  let best = null;
  let bestD = Infinity;
  for (const p of players) {
    if (!p.body) continue;
    const d = Math.min(dist(pt, mid(p.body.sMid, p.body.hMid)), dist(pt, p.body.head.c));
    if (d < p.body.s * 1.6 && d < bestD) { best = p; bestD = d; }
  }
  if (best) ui.selectPlayer(best.id);
});

requestAnimationFrame(loop);
boot();
