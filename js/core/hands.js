import { VIS } from './landmarks.js';
import { add, dist, norm, scale, sub } from './geom.js';

// Hand tracking. People standing far enough back to be fully in frame have hands only a few
// dozen pixels wide, too small for the hand model's palm detector on the full frame. Instead
// we crop a square around each pose-tracked wrist, upscale it, and run the hand model on that.
// Crops are processed oldest-first within a per-frame time budget, so with several players
// each hand is refreshed every frame or two.

const CROP_PX = 256;
const STALE_MS = 500; // forget a hand not re-detected for this long

/** MediaPipe 21-point hand topology. */
export const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const FINGERS = [[5, 8], [9, 12], [13, 16], [17, 20]]; // [knuckle, tip] for index..pinky

/**
 * 0 = fist, 1 = flat open hand. For each finger, compares wrist-to-tip distance with
 * wrist-to-knuckle distance (about 1.0 when curled, about 1.7 when extended). Uses 3D world
 * landmarks so it holds up when the palm is tilted. The thumb is ignored as it is unreliable.
 */
function opennessOf(lm) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  let sum = 0;
  for (const [knuckle, tip] of FINGERS) {
    const ratio = d(lm[0], lm[tip]) / (d(lm[0], lm[knuckle]) || 1);
    sum += Math.min(1, Math.max(0, (ratio - 1.05) / 0.6));
  }
  return sum / FINGERS.length;
}

export class HandTracker {
  constructor() {
    this.detector = null;
    this.hands = new Map();
    this.canvas = document.createElement('canvas');
    this.canvas.width = CROP_PX;
    this.canvas.height = CROP_PX;
    this.ctx = this.canvas.getContext('2d');
  }

  setDetector(detector) {
    this.detector?.close();
    this.detector = detector;
  }

  reset() { this.hands.clear(); }

  /** Run hand detection for as many wrists as fit in the time budget. Call once per new video frame. */
  update(video, players, { mirror, now, width, height, budgetMs = 12, maxCrops = 8 }) {
    if (!this.detector) return;
    const jobs = [];
    for (const p of players) {
      for (const side of ['left', 'right']) {
        const job = this.#plan(p, side, height);
        if (job) jobs.push(job);
      }
    }
    jobs.sort((a, b) => a.st.lastTry - b.st.lastTry);
    const t0 = performance.now();
    let n = 0;
    for (const job of jobs) {
      if (n >= maxCrops || (n > 0 && performance.now() - t0 > budgetMs)) break;
      this.#detect(video, job, mirror, now, width);
      n++;
    }
  }

  /**
   * Current hand for a player, positioned at their current pose wrist:
   * { state: 'open' | 'closed', openness: 0..1, points: [21 x {x, y}] } or null if unknown.
   */
  get(playerId, side, now, wrist) {
    const st = this.hands.get(`${playerId}:${side}`);
    if (!st || !wrist || now - st.lastSeen > STALE_MS) return null;
    return {
      state: st.state,
      openness: st.openness,
      points: st.rel.map((r) => ({ x: wrist.x + r.x, y: wrist.y + r.y })),
    };
  }

  #slot(key) {
    let st = this.hands.get(key);
    if (!st) {
      st = { lastTry: -Infinity, lastSeen: -Infinity, openness: null, state: null, rel: null };
      this.hands.set(key, st);
    }
    return st;
  }

  #plan(p, side, height) {
    const j = p.joints;
    const ok = (n) => !!j[n] && j[n].v >= VIS;
    if (!ok(`${side}Wrist`)) return null;
    const wrist = j[`${side}Wrist`];
    const elbow = ok(`${side}Elbow`) ? j[`${side}Elbow`] : null;
    const s = p.body?.s ?? 100;
    const forearm = elbow ? dist(elbow, wrist) : 0;
    const size = Math.min(height * 0.6, Math.max(forearm * 1.5, s * 0.75, 64));
    let dir = { x: 0, y: -1 };
    if (ok(`${side}Index`)) dir = norm(sub(j[`${side}Index`], wrist));
    else if (elbow) dir = norm(sub(wrist, elbow));
    return {
      st: this.#slot(`${p.id}:${side}`),
      wrist,
      center: add(wrist, scale(dir, size * 0.22)),
      size,
    };
  }

  #detect(video, { st, wrist, center, size }, mirror, now, width) {
    st.lastTry = now;
    // Crop from the raw (unmirrored) video frame.
    const sx = (mirror ? width - center.x : center.x) - size / 2;
    const sy = center.y - size / 2;
    const g = this.ctx;
    g.fillStyle = '#000';
    g.fillRect(0, 0, CROP_PX, CROP_PX);
    g.drawImage(video, sx, sy, size, size, 0, 0, CROP_PX, CROP_PX);

    let res;
    try { res = this.detector.detect(this.canvas); } catch (err) { console.warn(err); return; }
    if (!res.landmarks?.length) return;

    const toDisplay = (lm) => {
      const rx = sx + lm.x * size;
      return { x: mirror ? width - rx : rx, y: sy + lm.y * size };
    };

    // The crop may contain a second hand (yours or a neighbour's): take the one nearest this wrist.
    let best = -1;
    let bestD = Infinity;
    res.landmarks.forEach((lms, i) => {
      const d = dist(toDisplay(lms[0]), wrist);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (bestD > size * 0.45) return;

    const pts = res.landmarks[best].map(toDisplay);
    const o = opennessOf(res.worldLandmarks?.[best] ?? res.landmarks[best]);
    const fresh = now - st.lastSeen < STALE_MS;

    st.openness = fresh && st.openness != null ? st.openness + (o - st.openness) * 0.5 : o;
    // Hysteresis so the state doesn't flicker around the threshold.
    if (!fresh || st.state == null) st.state = st.openness >= 0.5 ? 'open' : 'closed';
    else if (st.state !== 'open' && st.openness > 0.6) st.state = 'open';
    else if (st.state !== 'closed' && st.openness < 0.35) st.state = 'closed';

    // Store the shape relative to the wrist so it can be re-anchored to the (fresher) pose wrist.
    const rel = pts.map((p) => ({ x: p.x - pts[0].x, y: p.y - pts[0].y }));
    st.rel = fresh && st.rel
      ? st.rel.map((r, i) => ({ x: r.x + (rel[i].x - r.x) * 0.6, y: r.y + (rel[i].y - r.y) * 0.6 }))
      : rel;
    st.lastSeen = now;
  }
}
