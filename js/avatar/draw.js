import { dist, segAngle } from '../core/geom.js';

/** Thick line segment (capsule by default). */
export function limb(ctx, a, b, w, color, cap = 'round') {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = cap;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function tracePoly(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

/** Filled polygon; `round` > 0 adds a same-colour stroke with round joins to soften corners. */
export function poly(ctx, pts, fill, round = 0) {
  tracePoly(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  if (round > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = round;
    ctx.strokeStyle = fill;
    ctx.stroke();
  }
}

export function circle(ctx, c, r, fill) {
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Run fn in a local frame starting at a, with +y pointing toward b. fn receives the length. */
export function along(ctx, a, b, fn) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(segAngle(a, b));
  fn(dist(a, b));
  ctx.restore();
}

/** Darken (amt < 0) or lighten (amt > 0) a #rrggbb colour. */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const ch = (v) => Math.round(v + (t - v) * k);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
