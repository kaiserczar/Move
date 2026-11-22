import { LANDMARK_NAMES } from './landmarks.js';
import { dist } from './geom.js';

const VISIBLE_MS = 250;   // keep drawing a player briefly through dropped frames
const RESERVE_MS = 2000;  // keep a slot's identity this long so a returning person gets it back

/** Center of a pose (shoulders + hips) in pixel space, or null if too little is visible. */
function centerOf(pts) {
  let idx = [11, 12, 23, 24].filter((i) => pts[i].v > 0.5);
  if (idx.length < 2) idx = pts.map((_, i) => i).filter((i) => pts[i].v > 0.5);
  if (!idx.length) return null;
  const c = { x: 0, y: 0 };
  for (const i of idx) { c.x += pts[i].x; c.y += pts[i].y; }
  return { x: c.x / idx.length, y: c.y / idx.length };
}

function toJoints(pts) {
  const j = {};
  LANDMARK_NAMES.forEach((name, i) => { j[name] = pts[i]; });
  return j;
}

/**
 * MediaPipe returns poses in arbitrary order each frame. This keeps a stable player slot
 * (P1..P4) per person by matching each detection to the nearest slot from the previous frame,
 * and smooths landmarks to reduce jitter.
 */
export class PlayerTracker {
  constructor(maxPlayers = 4) {
    this.maxPlayers = maxPlayers;
    this.reset();
  }

  reset() {
    this.slots = Array.from({ length: this.maxPlayers }, (_, id) => ({
      id, pts: null, center: null, lastSeen: -Infinity,
    }));
  }

  /**
   * @param {Array<Array<{x,y,v}>>} poses landmarks already converted to display pixel space
   * @param {number} now performance.now()
   * @param {number} width canvas width, used to scale distance thresholds
   */
  update(poses, now, width) {
    const dets = poses
      .map((pts) => ({ pts, center: centerOf(pts) }))
      .filter((d) => d.center);

    // Greedy nearest-neighbour matching against recently seen slots.
    const maxMatch = width * 0.25;
    const pairs = [];
    for (const slot of this.slots) {
      if (!slot.pts || now - slot.lastSeen >= RESERVE_MS) continue;
      dets.forEach((d, di) => {
        const dd = dist(slot.center, d.center);
        if (dd < maxMatch) pairs.push({ slot, di, dd });
      });
    }
    pairs.sort((a, b) => a.dd - b.dd);

    const usedSlots = new Set();
    const usedDets = new Set();
    for (const { slot, di } of pairs) {
      if (usedSlots.has(slot) || usedDets.has(di)) continue;
      usedSlots.add(slot);
      usedDets.add(di);
      this.#apply(slot, dets[di], now, width);
    }

    // New people: assign left-to-right into the lowest free slot.
    const unmatched = dets
      .filter((_, i) => !usedDets.has(i))
      .sort((a, b) => a.center.x - b.center.x);
    for (const det of unmatched) {
      const candidates = this.slots.filter((s) => !usedSlots.has(s));
      if (!candidates.length) break;
      const free = candidates.filter((s) => !s.pts || now - s.lastSeen >= RESERVE_MS);
      const slot = free[0] ?? candidates.sort((a, b) => a.lastSeen - b.lastSeen)[0];
      slot.pts = null;
      usedSlots.add(slot);
      this.#apply(slot, det, now, width);
    }
  }

  #apply(slot, det, now, width) {
    if (!slot.pts) {
      slot.pts = det.pts.map((p) => ({ ...p }));
    } else {
      // Adaptive smoothing: heavy when still (kills jitter), light when moving fast (low lag).
      for (let i = 0; i < det.pts.length; i++) {
        const s = slot.pts[i];
        const n = det.pts[i];
        const a = Math.min(1, 0.3 + Math.hypot(n.x - s.x, n.y - s.y) / (width * 0.04));
        s.x += (n.x - s.x) * a;
        s.y += (n.y - s.y) * a;
        s.v += (n.v - s.v) * 0.5;
      }
    }
    slot.center = det.center;
    slot.lastSeen = now;
  }

  /** Currently visible players: [{ id, joints: { nose: {x,y,v}, leftElbow: ..., ... } }] */
  players(now) {
    return this.slots
      .filter((s) => s.pts && now - s.lastSeen < VISIBLE_MS)
      .map((s) => ({ id: s.id, joints: toJoints(s.pts) }));
  }
}
