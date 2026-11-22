/**
 * Jump and duck detection.
 *
 * Each player gets a standing baseline (shoulder, hip and ankle heights plus torso length),
 * learned while they stand still. Movement is measured against that baseline in units of the
 * baseline torso length, so it works the same near or far from the camera.
 *
 *   jump: hips AND shoulders rise well above standing height (and ankles too, when visible).
 *   duck: shoulders drop well below standing height (squat, crouch or bend forward).
 *
 * Hysteresis (separate enter/exit thresholds) keeps states from flickering.
 */

const DEFAULTS = {
  jumpEnter: 0.22,   // hip rise to call it a jump, in torso lengths
  jumpExit: 0.1,     // hip rise below which the player has landed
  duckEnter: 0.45,   // shoulder drop to call it a duck
  duckExit: 0.28,    // shoulder drop below which the player is standing again
  calibrateMs: 500,  // steady standing needed before detection starts
  baselineMs: 700,   // time constant for baseline drift while standing
  maxJumpMs: 1500,   // nobody stays airborne this long: re-calibrate instead
  maxDuckMs: 8000,   // a very long "duck" is more likely a new position: re-calibrate
  forgetMs: 1000,    // a player unseen this long starts fresh (the slot may be someone new)
};

function avgY(pts) {
  const ys = pts.filter(Boolean).map((p) => p.y);
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
}

/** Heights of interest for one frame, or null when the hips aren't really visible. */
function measure(body) {
  if (!body || body.hipsEstimated) return null;
  const ankles = body.legs.map((l) => l.A);
  return {
    sh: body.sMid.y,
    hip: body.hMid.y,
    ankle: ankles.every(Boolean) ? avgY(ankles) : null,
    torso: body.torsoLen,
  };
}

export class MotionDetector {
  constructor(options = {}) {
    this.opt = { ...DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.people = new Map();
  }

  #fresh(now) {
    return { state: 'stand', since: now, base: null, steadySince: now, lastSeen: now, lastT: now, rise: 0, drop: 0, vy: 0, prevHip: null };
  }

  /**
   * Call once per new pose frame with players that have `body` (from buildBody).
   * Sets `p.motion` on each player and returns this frame's events:
   * [{ type: 'jump' | 'land' | 'duck' | 'stand', playerId, time }]
   */
  update(players, now) {
    const o = this.opt;
    const events = [];
    for (const p of players) {
      let m = this.people.get(p.id);
      if (!m || now - m.lastSeen > o.forgetMs) { m = this.#fresh(now); this.people.set(p.id, m); }
      const dt = Math.max(1, now - m.lastT);
      m.lastSeen = now;
      m.lastT = now;

      const cur = measure(p.body);
      if (!cur) { p.motion = this.#view(m); continue; }

      // Hip velocity in torso lengths per second (+ = up), for games that want it.
      if (m.prevHip != null && m.base) m.vy = ((m.prevHip - cur.hip) / m.base.torso) * (1000 / dt);
      m.prevHip = cur.hip;

      if (!m.base) { m.base = { ...cur }; m.steadySince = now; }
      const b = m.base;
      const u = b.torso;
      m.rise = (b.hip - cur.hip) / u;       // + = hips higher than standing
      const shRise = (b.sh - cur.sh) / u;
      m.drop = (cur.sh - b.sh) / u;         // + = shoulders lower than standing
      const ankleRise = cur.ankle != null && b.ankle != null ? (b.ankle - cur.ankle) / u : null;
      const scaleShift = Math.abs(cur.torso / u - 1);

      const ready = now - m.steadySince >= o.calibrateMs;
      const set = (state) => {
        if (state === m.state) return;
        const type = state === 'stand' ? (m.state === 'jump' ? 'land' : 'stand') : state;
        m.state = state;
        m.since = now;
        events.push({ type, playerId: p.id, time: now });
      };

      if (m.state === 'stand') {
        const jumping = m.rise > o.jumpEnter && shRise > o.jumpEnter * 0.7 && (ankleRise == null || ankleRise > o.jumpEnter * 0.6);
        if (ready && jumping) set('jump');
        else if (ready && m.drop > o.duckEnter) set('duck');
        else this.#learn(m, cur, now, dt, scaleShift);
      } else if (m.state === 'jump') {
        if (m.rise < o.jumpExit) set('stand');
        else if (now - m.since > o.maxJumpMs) this.#recalibrate(m, cur, now);
      } else if (m.state === 'duck') {
        if (m.drop < o.duckExit) set('stand');
        else if (now - m.since > o.maxDuckMs) this.#recalibrate(m, cur, now);
      }
      p.motion = this.#view(m);
    }
    return events;
  }

  /** Last known motion state for a player, or null. */
  get(playerId) {
    const m = this.people.get(playerId);
    return m ? this.#view(m) : null;
  }

  #learn(m, cur, now, dt, scaleShift) {
    const b = m.base;
    const steady = Math.abs(m.rise) < 0.08 && Math.abs(m.drop) < 0.12 && scaleShift < 0.15;
    if (!steady) {
      // Out of the standing band without being a jump/duck: either fidgeting or the player moved
      // nearer/farther. Re-learn if it persists or the body clearly changed size.
      m.unsteadySince ??= now;
      if (now - m.unsteadySince > this.opt.calibrateMs * 3 || scaleShift > 0.25) this.#recalibrate(m, cur, now);
      return;
    }
    m.unsteadySince = null;
    const a = 1 - Math.exp(-dt / this.opt.baselineMs);
    b.sh += (cur.sh - b.sh) * a;
    b.hip += (cur.hip - b.hip) * a;
    b.torso += (cur.torso - b.torso) * a;
    if (cur.ankle != null) b.ankle = b.ankle == null ? cur.ankle : b.ankle + (cur.ankle - b.ankle) * a;
  }

  #recalibrate(m, cur, now) {
    m.base = { ...cur };
    m.steadySince = now;
    m.unsteadySince = null;
    m.rise = 0;
    m.drop = 0;
    if (m.state !== 'stand') { m.state = 'stand'; m.since = now; }
  }

  #view(m) {
    return {
      state: m.state,
      since: m.since,
      ready: !!m.base && m.lastT - m.steadySince >= this.opt.calibrateMs,
      rise: m.rise,
      drop: m.drop,
      vy: m.vy,
    };
  }
}
