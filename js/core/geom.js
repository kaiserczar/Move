// Small 2D vector helpers. Points are plain {x, y} objects.

export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function norm(a) {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
}

/** Interior angle ABC in degrees (180 = straight). */
export function angleAt(a, b, c) {
  const v1 = sub(a, b);
  const v2 = sub(c, b);
  const d = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1);
  return (Math.acos(clamp(d, -1, 1)) * 180) / Math.PI;
}

/** Angle of line a-b, folded into (-90°, 90°] so a "level" line never renders upside down. */
export function levelAngle(a, b) {
  let ang = Math.atan2(b.y - a.y, b.x - a.x);
  if (ang > Math.PI / 2) ang -= Math.PI;
  else if (ang <= -Math.PI / 2) ang += Math.PI;
  return ang;
}

/** Canvas rotation that maps local +y onto the direction a -> b. */
export const segAngle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
