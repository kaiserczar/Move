import { HINGES, VIS, jointAngles } from './landmarks.js';
import { add, mid, norm, scale, sub } from './geom.js';
import { HAND_BONES } from './hands.js';

const BONES = [
  ['leftShoulder', 'rightShoulder'], ['leftHip', 'rightHip'],
  ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
  ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'], ['leftWrist', 'leftIndex'],
  ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'], ['rightWrist', 'rightIndex'],
  ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'], ['leftAnkle', 'leftFootIndex'],
  ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle'], ['rightAnkle', 'rightFootIndex'],
];
const END_JOINTS = ['leftShoulder', 'rightShoulder', 'leftWrist', 'rightWrist', 'leftHip', 'rightHip', 'leftAnkle', 'rightAnkle'];

/** Draw a stick-figure skeleton: head, neck, torso, both arms and legs, with elbows/knees highlighted. */
export function drawSkeleton(ctx, player, color, { angles = false } = {}) {
  const j = player.joints;
  const b = player.body;
  const ok = (n) => !!j[n] && j[n].v >= VIS;
  const s = b ? b.s : 100;
  const lw = Math.max(3, s * 0.06);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const neckEnd = b && {
    x: b.head.c.x - Math.sin(b.head.angle) * b.head.r * 0.85,
    y: b.head.c.y + Math.cos(b.head.angle) * b.head.r * 0.85,
  };

  for (const pass of [{ w: lw + 4, c: 'rgba(0,0,0,0.5)' }, { w: lw, c: color }]) {
    ctx.strokeStyle = pass.c;
    ctx.lineWidth = pass.w;
    ctx.beginPath();
    for (const [a, c] of BONES) {
      if (!ok(a) || !ok(c)) continue;
      ctx.moveTo(j[a].x, j[a].y);
      ctx.lineTo(j[c].x, j[c].y);
    }
    if (b) {
      ctx.moveTo(b.sMid.x, b.sMid.y);
      ctx.lineTo(neckEnd.x, neckEnd.y);
    }
    ctx.stroke();
    if (b) {
      ctx.beginPath();
      ctx.arc(b.head.c.x, b.head.c.y, b.head.r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const n of END_JOINTS) {
    if (!ok(n)) continue;
    dot(ctx, j[n], lw * 0.95, '#fff', color, lw * 0.35);
  }
  // Elbows and knees are emphasised: these are the hinge joints games will care about.
  for (const n of Object.keys(HINGES)) {
    if (!ok(n)) continue;
    dot(ctx, j[n], lw * 1.6, color, '#fff', lw * 0.45);
  }

  // Hands: fine 21-point skeleton plus an open/closed marker
  // (hollow ring = open, filled disc = fist).
  for (const hand of [player.hands?.left, player.hands?.right]) {
    if (!hand) continue;
    const pts = hand.points;
    const hw = Math.max(1.5, lw * 0.4);
    for (const pass of [{ w: hw + 2, c: 'rgba(0,0,0,0.5)' }, { w: hw, c: color }]) {
      ctx.strokeStyle = pass.c;
      ctx.lineWidth = pass.w;
      ctx.beginPath();
      for (const [a, c] of HAND_BONES) {
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[c].x, pts[c].y);
      }
      ctx.stroke();
    }
    const palm = mid(pts[0], pts[9]);
    const r = Math.max(lw * 1.6, Math.hypot(pts[9].x - pts[0].x, pts[9].y - pts[0].y) * 1.1);
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, lw * 0.5);
    ctx.strokeStyle = '#fff';
    if (hand.state === 'closed') {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    } else {
      ctx.setLineDash([r * 0.5, r * 0.3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (angles) {
    const center = b ? mid(b.sMid, b.hMid) : null;
    const fs = Math.max(12, s * 0.12);
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [name, deg] of Object.entries(jointAngles(j))) {
      const p = j[name];
      const dir = center ? norm(sub(p, center)) : { x: 1, y: 0 };
      const at = add(p, scale(dir, fs * 2.2));
      const text = `${Math.round(deg)}°`;
      const w = ctx.measureText(text).width + fs * 0.8;
      ctx.fillStyle = 'rgba(10,12,20,0.8)';
      ctx.beginPath();
      ctx.roundRect(at.x - w / 2, at.y - fs * 0.75, w, fs * 1.5, fs * 0.75);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(text, at.x, at.y + 1);
    }
  }
  ctx.restore();
}

function dot(ctx, p, r, fill, stroke, sw) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = sw;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}
