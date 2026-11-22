// Avatar part catalogue. Each part draws itself from the body geometry built in core/body.js.
//
//   Heads:   draw(ctx, r, look, skin)  — called in a head-local frame (origin = head center,
//            rotated with the head, radius r). `look` ({x,y} in -0.6..0.6) shifts the face
//            toward where the nose is pointing.
//   Tops:    back?(ctx, body), torso(ctx, body, skin), arm(ctx, body, arm)
//   Bottoms: leg(ctx, body, leg), pelvis(ctx, body), shoe colour
//
// To add a part, append an object to the relevant array; the UI picks it up automatically.

import { along, circle, ellipse, limb, poly, shade, tracePoly } from './draw.js';
import { add, lerp, norm, scale, sub } from '../core/geom.js';

export const SKINS = ['#f7d7bd', '#e9b48c', '#c68a5e', '#8d5a3b', '#5a3824'];

// ---------- shared helpers ----------

function torsoShape(ctx, b, color, round = 0.16) {
  const t = b.torso;
  poly(ctx, [t.ls, t.rs, t.rh, t.lh], color, b.s * round);
}

/** Local frame on the torso: origin at shoulder midpoint, +y down the spine, +x across. */
function bodyFrame(ctx, b, fn) {
  ctx.save();
  ctx.translate(b.sMid.x, b.sMid.y);
  ctx.rotate(b.spineAngle);
  fn(b.torsoLen, Math.max(b.halfShoulder, b.s * 0.3));
  ctx.restore();
}

function sleeve(ctx, b, arm, color, kind, cuff) {
  const s = b.s;
  if (!arm.E) return;
  if (kind === 'short') {
    circle(ctx, arm.S, s * 0.135, color);
    limb(ctx, arm.S, lerp(arm.S, arm.E, 0.55), s * 0.27, color, 'butt');
    return;
  }
  limb(ctx, arm.S, arm.E, s * 0.24, color);
  if (arm.W) {
    limb(ctx, arm.E, arm.W, s * 0.21, color, 'butt');
    if (cuff) limb(ctx, lerp(arm.E, arm.W, 0.85), arm.W, s * 0.215, cuff, 'butt');
  }
}

function crewNeck(ctx, b, skin, rim, r) {
  bodyFrame(ctx, b, () => {
    ctx.beginPath();
    ctx.arc(0, -b.s * 0.03, r, 0, Math.PI);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.strokeStyle = rim;
    ctx.lineWidth = b.s * 0.035;
    ctx.stroke();
  });
}

function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function pantsLeg(ctx, b, leg, color, wThigh = 0.3, wShin = 0.25) {
  limb(ctx, leg.H, leg.K, b.s * wThigh, color);
  if (leg.A) limb(ctx, leg.K, leg.A, b.s * wShin, color, 'butt');
}

function pelvisShape(ctx, b, color) {
  const t = b.torso;
  const s = b.s;
  const d = b.down;
  poly(ctx, [
    t.lh, t.rh,
    add(b.RH, scale(d, s * 0.3)),
    add(b.hMid, scale(d, s * 0.36)),
    add(b.LH, scale(d, s * 0.3)),
  ], color, s * 0.12);
}

/** Stripes down the outer side of a limb segment. */
function sideStripes(ctx, a, c, outer, halfW, s, color) {
  along(ctx, a, c, (L) => {
    ctx.fillStyle = color;
    for (const k of [0.45, 0.72]) {
      // local +x is screen-right for a vertical limb; `outer` says which side faces outward
      ctx.fillRect(outer * halfW * k - s * 0.012, 0, s * 0.024, L);
    }
  });
}

// ---------- heads ----------

export const HEADS = [
  {
    name: 'Kid',
    draw(ctx, r, look, skin) {
      const ox = look.x * r * 0.35;
      const oy = look.y * r * 0.3;
      const ear = shade(skin, -0.1);
      circle(ctx, { x: -r * 0.95, y: r * 0.08 }, r * 0.2, ear);
      circle(ctx, { x: r * 0.95, y: r * 0.08 }, r * 0.2, ear);
      circle(ctx, { x: 0, y: 0 }, r, skin);
      // hair cap with a swept fringe
      ctx.fillStyle = '#3b2416';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.04, Math.PI * 0.98, Math.PI * 2.02);
      ctx.quadraticCurveTo(r * 0.7 + ox, -r * 0.55, ox + r * 0.1, -r * 0.42);
      ctx.quadraticCurveTo(-r * 0.5 + ox, -r * 0.2, -r * 1.0, r * 0.05);
      ctx.closePath();
      ctx.fill();
      for (const sx of [-1, 1]) {
        circle(ctx, { x: sx * r * 0.36 + ox, y: r * 0.05 + oy }, r * 0.12, '#1d1d24');
        circle(ctx, { x: sx * r * 0.36 + ox + r * 0.04, y: oy + r * 0.01 }, r * 0.04, '#fff');
      }
      ctx.globalAlpha = 0.35;
      circle(ctx, { x: -r * 0.55 + ox, y: r * 0.35 + oy }, r * 0.13, '#ff6f82');
      circle(ctx, { x: r * 0.55 + ox, y: r * 0.35 + oy }, r * 0.13, '#ff6f82');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#5a2a2a';
      ctx.lineWidth = r * 0.08;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ox, r * 0.28 + oy, r * 0.28, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    },
  },
  {
    name: 'Robot',
    draw(ctx, r, look) {
      const ox = look.x * r * 0.2;
      const oy = look.y * r * 0.18;
      const metal = '#c4cfdf';
      const trim = '#8a96a8';
      limb(ctx, { x: 0, y: -r * 0.85 }, { x: 0, y: -r * 1.28 }, r * 0.08, trim);
      circle(ctx, { x: 0, y: -r * 1.35 }, r * 0.13, '#ff4d5e');
      ctx.fillStyle = trim;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.roundRect(sx * r * 0.95 - r * 0.12, -r * 0.22, r * 0.24, r * 0.44, r * 0.08);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.roundRect(-r * 0.9, -r * 0.88, r * 1.8, r * 1.76, r * 0.32);
      ctx.fillStyle = metal;
      ctx.fill();
      ctx.lineWidth = r * 0.06;
      ctx.strokeStyle = trim;
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-r * 0.68, -r * 0.45, r * 1.36, r * 0.6, r * 0.22);
      ctx.fillStyle = '#1b2433';
      ctx.fill();
      ctx.save();
      ctx.shadowColor = '#4ff0ff';
      ctx.shadowBlur = r * 0.3;
      for (const sx of [-1, 1]) circle(ctx, { x: sx * r * 0.3 + ox, y: -r * 0.15 + oy }, r * 0.12, '#4ff0ff');
      ctx.restore();
      ctx.beginPath();
      ctx.roundRect(-r * 0.4, r * 0.36, r * 0.8, r * 0.28, r * 0.08);
      ctx.fillStyle = trim;
      ctx.fill();
      ctx.strokeStyle = '#5d6878';
      ctx.lineWidth = r * 0.04;
      ctx.beginPath();
      for (let i = 1; i < 5; i++) {
        const x = -r * 0.4 + (r * 0.8 * i) / 5;
        ctx.moveTo(x, r * 0.4);
        ctx.lineTo(x, r * 0.6);
      }
      ctx.stroke();
    },
  },
  {
    name: 'Cat',
    draw(ctx, r, look) {
      const ox = look.x * r * 0.35;
      const oy = look.y * r * 0.3;
      const fur = '#f29a3a';
      const dark = '#c96f1c';
      for (const sx of [-1, 1]) {
        poly(ctx, [{ x: sx * r * 0.88, y: -r * 0.3 }, { x: sx * r * 0.78, y: -r * 1.22 }, { x: sx * r * 0.18, y: -r * 0.82 }], fur);
        poly(ctx, [{ x: sx * r * 0.72, y: -r * 0.5 }, { x: sx * r * 0.7, y: -r * 1.0 }, { x: sx * r * 0.36, y: -r * 0.76 }], '#ffb3c1');
      }
      circle(ctx, { x: 0, y: 0 }, r, fur);
      ctx.strokeStyle = dark;
      ctx.lineWidth = r * 0.09;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const x of [-0.25, 0, 0.25]) {
        ctx.moveTo(x * r, -r * 0.94);
        ctx.lineTo(x * r * 0.8, -r * 0.62);
      }
      ctx.stroke();
      ellipse(ctx, ox, r * 0.42 + oy, r * 0.5, r * 0.34, '#fff3e0');
      for (const sx of [-1, 1]) {
        ellipse(ctx, sx * r * 0.38 + ox, -r * 0.06 + oy, r * 0.17, r * 0.2, '#9be15d');
        ellipse(ctx, sx * r * 0.38 + ox, -r * 0.06 + oy, r * 0.05, r * 0.16, '#111');
      }
      poly(ctx, [{ x: ox - r * 0.09, y: r * 0.22 + oy }, { x: ox + r * 0.09, y: r * 0.22 + oy }, { x: ox, y: r * 0.32 + oy }], '#ff7b9c');
      ctx.strokeStyle = '#5b3a1e';
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.arc(ox - r * 0.1, r * 0.33 + oy, r * 0.1, 0, Math.PI);
      ctx.moveTo(ox + r * 0.2, r * 0.33 + oy);
      ctx.arc(ox + r * 0.1, r * 0.33 + oy, r * 0.1, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,40,20,0.7)';
      ctx.lineWidth = r * 0.03;
      ctx.beginPath();
      for (const sx of [-1, 1]) {
        for (const k of [-1, 0, 1]) {
          ctx.moveTo(sx * r * 0.32 + ox, r * 0.4 + oy + k * r * 0.07);
          ctx.lineTo(sx * r * 1.1 + ox, r * 0.36 + oy + k * r * 0.16);
        }
      }
      ctx.stroke();
    },
  },
  {
    name: 'Alien',
    draw(ctx, r, look) {
      const ox = look.x * r * 0.3;
      const oy = look.y * r * 0.25;
      for (const sx of [-1, 1]) {
        limb(ctx, { x: sx * r * 0.3, y: -r * 0.8 }, { x: sx * r * 0.55, y: -r * 1.33 }, r * 0.07, '#5fb83a');
        circle(ctx, { x: sx * r * 0.56, y: -r * 1.38 }, r * 0.13, '#c6ff7a');
      }
      ellipse(ctx, 0, -r * 0.08, r * 0.92, r * 1.08, '#86e05a');
      for (const sx of [-1, 1]) {
        ellipse(ctx, sx * r * 0.38 + ox, oy, r * 0.3, r * 0.16, '#0d0d14', -sx * 0.45);
        circle(ctx, { x: sx * r * 0.32 + ox, y: oy - r * 0.05 }, r * 0.05, 'rgba(255,255,255,0.8)');
      }
      ctx.strokeStyle = '#2f6a1c';
      ctx.lineWidth = r * 0.06;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ox, r * 0.42 + oy, r * 0.13, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    },
  },
  {
    name: 'Pumpkin',
    draw(ctx, r, look) {
      const ox = look.x * r * 0.3;
      const oy = look.y * r * 0.25;
      const orange = '#f57c1f';
      ctx.beginPath();
      ctx.roundRect(-r * 0.1, -r * 1.22, r * 0.2, r * 0.42, r * 0.06);
      ctx.fillStyle = '#5c7a2e';
      ctx.fill();
      ctx.strokeStyle = '#c45a0c';
      ctx.lineWidth = r * 0.05;
      for (const x of [-0.45, 0.45, 0]) {
        ctx.beginPath();
        ctx.ellipse(x * r, 0, r * 0.6, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fillStyle = orange;
        ctx.fill();
        ctx.stroke();
      }
      ctx.save();
      ctx.shadowColor = '#ffb703';
      ctx.shadowBlur = r * 0.25;
      const glow = '#ffd23f';
      for (const sx of [-1, 1]) {
        const ex = sx * r * 0.38 + ox;
        poly(ctx, [{ x: ex - r * 0.17, y: -r * 0.04 + oy }, { x: ex + r * 0.17, y: -r * 0.04 + oy }, { x: ex, y: -r * 0.34 + oy }], glow);
      }
      poly(ctx, [{ x: ox - r * 0.08, y: r * 0.18 + oy }, { x: ox + r * 0.08, y: r * 0.18 + oy }, { x: ox, y: r * 0.06 + oy }], glow);
      const mouth = [[-0.55, 0.3], [-0.36, 0.42], [-0.18, 0.32], [0, 0.44], [0.18, 0.32], [0.36, 0.42], [0.55, 0.3], [0.4, 0.6], [0, 0.68], [-0.4, 0.6]];
      poly(ctx, mouth.map(([x, y]) => ({ x: x * r + ox, y: y * r + oy })), glow);
      ctx.restore();
    },
  },
];

// ---------- tops ----------

export const TOPS = [
  {
    name: 'T-Shirt',
    color: '#e5484d',
    torso(ctx, b, skin) {
      torsoShape(ctx, b, this.color);
      crewNeck(ctx, b, skin, shade(this.color, -0.25), b.s * 0.15);
      bodyFrame(ctx, b, (L) => star(ctx, 0, L * 0.42, b.s * 0.13, '#fff'));
    },
    arm(ctx, b, arm) { sleeve(ctx, b, arm, this.color, 'short'); },
  },
  {
    name: 'Hoodie',
    color: '#7d8796',
    back(ctx, b) {
      // hood bunched behind the head, joined down to the shoulders
      const h = b.head;
      limb(ctx, h.c, b.sMid, h.r * 1.7, shade(this.color, -0.22));
      ctx.save();
      ctx.translate(h.c.x, h.c.y);
      ctx.rotate(h.angle);
      ellipse(ctx, 0, h.r * 0.2, h.r * 1.27, h.r * 1.3, shade(this.color, -0.22));
      ctx.restore();
    },
    torso(ctx, b) {
      const s = b.s;
      torsoShape(ctx, b, this.color);
      const dark = shade(this.color, -0.3);
      bodyFrame(ctx, b, (L, w) => {
        ellipse(ctx, 0, 0, w * 0.42, s * 0.14, dark);
        // kangaroo pocket
        ctx.beginPath();
        ctx.moveTo(-w * 0.55, L * 0.62);
        ctx.lineTo(w * 0.55, L * 0.62);
        ctx.lineTo(w * 0.72, L * 0.98);
        ctx.lineTo(-w * 0.72, L * 0.98);
        ctx.closePath();
        ctx.fillStyle = shade(this.color, -0.12);
        ctx.fill();
        // drawstrings
        ctx.strokeStyle = '#f2f2f2';
        ctx.lineWidth = s * 0.025;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const sx of [-1, 1]) {
          ctx.moveTo(sx * w * 0.2, s * 0.08);
          ctx.lineTo(sx * w * 0.24, L * 0.36);
        }
        ctx.stroke();
      });
    },
    arm(ctx, b, arm) { sleeve(ctx, b, arm, this.color, 'long', shade(this.color, -0.2)); },
  },
  {
    name: 'Tank Top',
    color: '#f5c542',
    torso(ctx, b, skin) {
      const s = b.s;
      const t = b.torso;
      poly(ctx, [
        lerp(b.LS, b.sMid, 0.3), lerp(b.RS, b.sMid, 0.3),
        lerp(b.RS, b.RH, 0.3), t.rh, t.lh, lerp(b.LS, b.LH, 0.3),
      ], this.color, s * 0.1);
      bodyFrame(ctx, b, (L, w) => {
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.05, w * 0.38, s * 0.3, 0, 0, Math.PI);
        ctx.fillStyle = skin;
        ctx.fill();
        ctx.fillStyle = '#2b6cb0';
        ctx.fillRect(-w * 1.2, L * 0.5, w * 2.4, s * 0.07);
        ctx.fillRect(-w * 1.2, L * 0.62, w * 2.4, s * 0.07);
      });
    },
    arm() {},
  },
  {
    name: 'Suit',
    color: '#26324f',
    torso(ctx, b) {
      const s = b.s;
      torsoShape(ctx, b, this.color);
      bodyFrame(ctx, b, (L, w) => {
        poly(ctx, [{ x: -w * 0.4, y: -s * 0.04 }, { x: w * 0.4, y: -s * 0.04 }, { x: 0, y: L * 0.52 }], '#f4f4f4');
        poly(ctx, [
          { x: -s * 0.045, y: s * 0.02 }, { x: s * 0.045, y: s * 0.02 },
          { x: s * 0.07, y: L * 0.42 }, { x: 0, y: L * 0.52 }, { x: -s * 0.07, y: L * 0.42 },
        ], '#d63a3a');
        poly(ctx, [{ x: -s * 0.07, y: -s * 0.02 }, { x: s * 0.07, y: -s * 0.02 }, { x: s * 0.045, y: s * 0.08 }, { x: -s * 0.045, y: s * 0.08 }], '#b02a2a');
        ctx.strokeStyle = shade(this.color, 0.2);
        ctx.lineWidth = s * 0.03;
        ctx.beginPath();
        ctx.moveTo(-w * 0.4, -s * 0.04);
        ctx.lineTo(0, L * 0.52);
        ctx.lineTo(w * 0.4, -s * 0.04);
        ctx.stroke();
        circle(ctx, { x: 0, y: L * 0.66 }, s * 0.03, '#11182b');
        circle(ctx, { x: 0, y: L * 0.82 }, s * 0.03, '#11182b');
      });
    },
    arm(ctx, b, arm) { sleeve(ctx, b, arm, this.color, 'long', '#f4f4f4'); },
  },
  {
    name: 'Sweater',
    color: '#1f9e89',
    stripe: '#f3ead3',
    torso(ctx, b) {
      const s = b.s;
      const t = b.torso;
      torsoShape(ctx, b, this.color);
      ctx.save();
      tracePoly(ctx, [t.ls, t.rs, t.rh, t.lh]);
      ctx.clip();
      bodyFrame(ctx, b, (L) => {
        ctx.fillStyle = this.stripe;
        for (let y = s * 0.18; y < L + s * 0.2; y += s * 0.22) ctx.fillRect(-s * 2, y, s * 4, s * 0.08);
      });
      ctx.restore();
      bodyFrame(ctx, b, (L, w) => {
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.02, w * 0.36, s * 0.12, 0, 0, Math.PI);
        ctx.strokeStyle = shade(this.color, -0.3);
        ctx.lineWidth = s * 0.06;
        ctx.stroke();
      });
    },
    arm(ctx, b, arm) {
      if (!arm.E) return;
      const s = b.s;
      sleeve(ctx, b, arm, this.color, 'long', shade(this.color, -0.3));
      const band = (a, c, w) => along(ctx, a, c, (L) => {
        ctx.fillStyle = this.stripe;
        for (let y = s * 0.12; y < L - s * 0.08; y += s * 0.22) ctx.fillRect(-w / 2, y, w, s * 0.07);
      });
      band(arm.S, arm.E, s * 0.24);
      if (arm.W) band(arm.E, lerp(arm.E, arm.W, 0.85), s * 0.21);
    },
  },
];

// ---------- bottoms ----------

export const BOTTOMS = [
  {
    name: 'Jeans',
    color: '#3b5ba5',
    shoe: '#6b4423',
    leg(ctx, b, leg) {
      const s = b.s;
      pantsLeg(ctx, b, leg, this.color);
      const seam = shade(this.color, 0.2);
      ctx.save();
      ctx.setLineDash([s * 0.04, s * 0.03]);
      limb(ctx, lerp(leg.H, leg.K, 0.1), leg.K, s * 0.015, seam, 'butt');
      if (leg.A) limb(ctx, leg.K, lerp(leg.K, leg.A, 0.86), s * 0.015, seam, 'butt');
      ctx.restore();
      if (leg.A) limb(ctx, lerp(leg.K, leg.A, 0.88), leg.A, s * 0.26, shade(this.color, 0.15), 'butt');
    },
    pelvis(ctx, b) { pelvisShape(ctx, b, this.color); },
  },
  {
    name: 'Shorts',
    color: '#c8a165',
    shoe: '#f4f4f4',
    leg(ctx, b, leg) {
      const s = b.s;
      const hem = lerp(leg.H, leg.K, 0.6);
      circle(ctx, leg.H, s * 0.165, this.color);
      limb(ctx, leg.H, hem, s * 0.33, this.color, 'butt');
      limb(ctx, lerp(leg.H, leg.K, 0.52), hem, s * 0.33, shade(this.color, -0.15), 'butt');
    },
    pelvis(ctx, b) { pelvisShape(ctx, b, this.color); },
  },
  {
    name: 'Skirt',
    color: '#d6457a',
    shoe: '#1d1d1d',
    leg(ctx, b, leg) {
      // knee socks
      if (leg.A) limb(ctx, lerp(leg.K, leg.A, 0.4), leg.A, b.s * 0.225, '#f2f2f2', 'butt');
    },
    pelvis(ctx, b) {
      const s = b.s;
      const t = b.torso;
      const dir = norm(sub(b.RH, b.LH));
      const hem = (leg, H) => (leg.K ? lerp(H, leg.K, 0.7) : add(H, scale(b.down, s * 0.75)));
      const lb = add(hem(b.legs[0], b.LH), scale(dir, -s * 0.22));
      const rb = add(hem(b.legs[1], b.RH), scale(dir, s * 0.22));
      poly(ctx, [t.lh, t.rh, rb, lb], this.color, s * 0.06);
      ctx.strokeStyle = shade(this.color, -0.2);
      ctx.lineWidth = s * 0.025;
      ctx.beginPath();
      for (let i = 1; i < 6; i++) {
        const top = lerp(t.lh, t.rh, i / 6);
        const bot = lerp(lb, rb, i / 6);
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bot.x, bot.y);
      }
      ctx.stroke();
      limb(ctx, t.lh, t.rh, s * 0.1, shade(this.color, -0.25));
    },
  },
  {
    name: 'Cargo',
    color: '#6b7448',
    shoe: '#4a3b2a',
    leg(ctx, b, leg) {
      const s = b.s;
      pantsLeg(ctx, b, leg, this.color);
      along(ctx, leg.H, leg.K, (L) => {
        const pw = s * 0.15;
        const x = leg.outer * s * 0.07 - pw / 2;
        ctx.fillStyle = shade(this.color, -0.18);
        ctx.fillRect(x, L * 0.38, pw, L * 0.34);
        ctx.fillStyle = shade(this.color, -0.32);
        ctx.fillRect(x, L * 0.38, pw, L * 0.07);
      });
    },
    pelvis(ctx, b) { pelvisShape(ctx, b, this.color); },
  },
  {
    name: 'Track Pants',
    color: '#24242b',
    shoe: '#e8e8e8',
    leg(ctx, b, leg) {
      const s = b.s;
      pantsLeg(ctx, b, leg, this.color, 0.29, 0.23);
      sideStripes(ctx, leg.H, leg.K, leg.outer, s * 0.145, s, '#f2f2f2');
      if (leg.A) sideStripes(ctx, leg.K, leg.A, leg.outer, s * 0.115, s, '#f2f2f2');
    },
    pelvis(ctx, b) { pelvisShape(ctx, b, this.color); },
  },
];
