import { VIS } from './landmarks.js';
import { add, clamp, dist, lerp, levelAngle, mid, norm, scale, segAngle, sub } from './geom.js';

/**
 * Turn raw joints into renderable body geometry (head circle, torso quad, limbs, scale).
 * Shared by the skeleton and avatar renderers. Returns null if the shoulders aren't visible.
 */
export function buildBody(j) {
  const ok = (n) => !!j[n] && j[n].v >= VIS;
  if (!ok('leftShoulder') || !ok('rightShoulder')) return null;

  const LS = j.leftShoulder;
  const RS = j.rightShoulder;
  const sMid = mid(LS, RS);
  const sw = dist(LS, RS);

  // If hips are out of frame (person close to camera), estimate them so the torso still renders.
  let LH, RH;
  const hipsEstimated = !(ok('leftHip') && ok('rightHip'));
  if (hipsEstimated) {
    LH = add(lerp(LS, sMid, 0.2), { x: 0, y: sw * 1.4 });
    RH = add(lerp(RS, sMid, 0.2), { x: 0, y: sw * 1.4 });
  } else {
    LH = j.leftHip;
    RH = j.rightHip;
  }
  const hMid = mid(LH, RH);
  const torsoLen = dist(sMid, hMid);

  // Body scale: robust when the person turns sideways (shoulder width collapses).
  const s = Math.max(sw, torsoLen * 0.62, 1);
  const down = norm(sub(hMid, sMid));
  const out = (p, c, k) => add(p, scale(norm(sub(p, c)), k));

  const torso = {
    ls: out(LS, sMid, s * 0.07),
    rs: out(RS, sMid, s * 0.07),
    rh: out(RH, hMid, s * 0.05),
    lh: out(LH, hMid, s * 0.05),
  };

  const arms = ['left', 'right'].map((side) => {
    const S = side === 'left' ? LS : RS;
    if (!ok(`${side}Elbow`)) return { side, S, E: null, W: null, hand: null };
    const E = j[`${side}Elbow`];
    const W = ok(`${side}Wrist`) ? j[`${side}Wrist`] : null;
    let hand = null;
    if (W) {
      hand = ok(`${side}Index`)
        ? lerp(W, j[`${side}Index`], 0.45)
        : add(W, scale(norm(sub(W, E)), s * 0.08));
    }
    return { side, S, E, W, hand };
  });

  const legs = ['left', 'right'].map((side) => {
    const H = side === 'left' ? LH : RH;
    const outer = Math.sign(H.x - hMid.x) || (side === 'left' ? -1 : 1);
    if (hipsEstimated || !ok(`${side}Knee`)) return { side, H, K: null, A: null, F: null, outer };
    const K = j[`${side}Knee`];
    const A = ok(`${side}Ankle`) ? j[`${side}Ankle`] : null;
    let F = null;
    if (A) F = ok(`${side}FootIndex`) ? j[`${side}FootIndex`] : add(A, { x: 0, y: s * 0.15 });
    return { side, H, K, A, F, outer };
  });

  return {
    joints: j, ok, s,
    LS, RS, LH, RH, sMid, hMid, down, torsoLen,
    halfShoulder: sw / 2,
    spineAngle: segAngle(sMid, hMid),
    hipsEstimated,
    torso, arms, legs,
    head: computeHead(j, ok, sMid, down, s),
  };
}

function computeHead(j, ok, sMid, down, s) {
  const eyes = ok('leftEye') && ok('rightEye');
  const ears = ok('leftEar') && ok('rightEar');

  let angle = 0;
  if (eyes) angle = levelAngle(j.leftEye, j.rightEye);
  else if (ears) angle = levelAngle(j.leftEar, j.rightEar);

  let c;
  let earD = 0;
  if (ears) { c = mid(j.leftEar, j.rightEar); earD = dist(j.leftEar, j.rightEar); }
  else if (eyes) { c = mid(j.leftEye, j.rightEye); earD = dist(j.leftEye, j.rightEye) * 2.2; }
  else if (ok('nose')) c = { x: j.nose.x, y: j.nose.y };
  else c = add(sMid, scale(down, -s * 0.85));

  const r = Math.max(earD * 0.75, s * 0.34);
  const up = { x: Math.sin(angle), y: -Math.cos(angle) };
  c = add(c, scale(up, r * 0.12)); // ears sit slightly below the skull's center

  // "look" = where the nose points relative to the head, in head-local units, for face offset.
  let look = { x: 0, y: 0 };
  if (ok('nose')) {
    const d = sub(j.nose, c);
    const ca = Math.cos(-angle);
    const sa = Math.sin(-angle);
    const lx = (d.x * ca - d.y * sa) / r;
    const ly = (d.x * sa + d.y * ca) / r;
    look = { x: clamp(lx * 1.2, -0.6, 0.6), y: clamp(ly - 0.3, -0.4, 0.4) };
  }
  return { c, r, angle, look };
}
