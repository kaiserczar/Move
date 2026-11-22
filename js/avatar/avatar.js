import { BOTTOMS, HEADS, SKINS, TOPS } from './parts.js';
import { circle, limb, shade, tracePoly } from './draw.js';
import { buildBody } from '../core/body.js';
import { dist } from '../core/geom.js';

/**
 * Draw a full avatar over a body built by buildBody().
 * cfg = { head, top, bottom, skin } — indices into the part catalogues.
 * hands = optional { left, right } from HandTracker.get().
 */
export function drawAvatar(ctx, b, cfg, hands = null) {
  const head = HEADS[cfg.head] ?? HEADS[0];
  const top = TOPS[cfg.top] ?? TOPS[0];
  const bottom = BOTTOMS[cfg.bottom] ?? BOTTOMS[0];
  const skin = SKINS[cfg.skin] ?? SKINS[0];
  const s = b.s;

  ctx.save();
  ctx.lineJoin = 'round';

  top.back?.(ctx, b);

  // Legs: skin, shoes, then clothing on top.
  if (!b.hipsEstimated) {
    for (const leg of b.legs) {
      if (!leg.K) continue;
      limb(ctx, leg.H, leg.K, s * 0.27, skin);
      if (leg.A) limb(ctx, leg.K, leg.A, s * 0.21, skin);
    }
    for (const leg of b.legs) {
      if (!leg.A) continue;
      limb(ctx, leg.A, leg.F, s * 0.21, shade(bottom.shoe, -0.45));
      limb(ctx, leg.A, leg.F, s * 0.16, bottom.shoe);
    }
    for (const leg of b.legs) if (leg.K) bottom.leg(ctx, b, leg);
    bottom.pelvis(ctx, b);
  }

  // Neck, torso, arms (arms in front so crossing them over the body reads correctly).
  limb(ctx, b.sMid, b.head.c, s * 0.17, shade(skin, -0.08));
  top.torso(ctx, b, skin);
  for (const arm of b.arms) {
    if (!arm.E) continue;
    limb(ctx, arm.S, arm.E, s * 0.19, skin);
    if (arm.W) limb(ctx, arm.E, arm.W, s * 0.16, skin);
    top.arm(ctx, b, arm);
  }

  const h = b.head;
  ctx.save();
  ctx.translate(h.c.x, h.c.y);
  ctx.rotate(h.angle);
  head.draw(ctx, h.r, h.look, skin);
  ctx.restore();

  // Hands last so waving in front of the face stays visible. Uses the tracked hand shape when
  // available (so fists, open palms and pointing all show), otherwise a simple round hand.
  for (const arm of b.arms) {
    const tracked = hands?.[arm.side];
    if (tracked && arm.W) drawHand(ctx, tracked.points, skin, s);
    else if (arm.hand) circle(ctx, arm.hand, s * 0.095, skin);
  }

  ctx.restore();
}

const PALM = [0, 1, 5, 9, 13, 17];
const FINGER_CHAINS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];

function drawHand(ctx, pts, skin, s) {
  const fw = Math.max(dist(pts[5], pts[17]) * 0.38, s * 0.035);
  const outline = shade(skin, -0.35);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Outline pass, then skin pass on top, so the hand reads as one cartoon shape.
  for (const [color, extra] of [[outline, Math.max(1.5, fw * 0.25)], [skin, 0]]) {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    tracePoly(ctx, PALM.map((i) => pts[i]));
    ctx.lineWidth = fw + extra;
    ctx.fill();
    ctx.stroke();
    FINGER_CHAINS.forEach((chain, k) => {
      ctx.lineWidth = (k === 0 ? fw * 1.1 : fw) + extra;
      ctx.beginPath();
      chain.forEach((i, n) => (n ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y)));
      ctx.stroke();
    });
  }
}

// A neutral standing pose (mirrored view: the subject's left is on screen-left), used for thumbnails.
const MANNEQUIN_POINTS = {
  nose: [50, 20], leftEye: [47, 17], rightEye: [53, 17], leftEar: [43, 19], rightEar: [57, 19],
  leftShoulder: [36, 40], rightShoulder: [64, 40],
  leftElbow: [30, 62], rightElbow: [70, 62],
  leftWrist: [27, 82], rightWrist: [73, 82],
  leftIndex: [26, 88], rightIndex: [74, 88],
  leftHip: [42, 85], rightHip: [58, 85],
  leftKnee: [41, 115], rightKnee: [59, 115],
  leftAnkle: [40, 145], rightAnkle: [60, 145],
  leftFootIndex: [35, 151], rightFootIndex: [65, 151],
};
const MANNEQUIN = buildBody(Object.fromEntries(
  Object.entries(MANNEQUIN_POINTS).map(([k, [x, y]]) => [k, { x, y, v: 1 }]),
));

/** Render a cropped avatar preview. focus = { x, y, size } in mannequin units (0..100 wide, ~155 tall). */
export function renderThumb(canvas, cfg, focus) {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.round((canvas.clientWidth || 64) * dpr);
  if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  const k = px / focus.size;
  ctx.setTransform(k, 0, 0, k, px / 2 - focus.x * k, px / 2 - focus.y * k);
  drawAvatar(ctx, MANNEQUIN, cfg);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
