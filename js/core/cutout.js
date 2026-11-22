// Background removal: cuts the real people out of the camera image using a person mask.
//
// The selfie model gives a small (256x144) confidence mask. To hide its blockiness and flicker
// we smooth it over time, apply a soft threshold, then let the browser upscale it with bilinear
// filtering plus a slight blur, which gives feathered edges at full resolution.

const STALE_MS = 500;
const LOW = 0.35;  // confidence below this is fully background
const HIGH = 0.65; // above this is fully person

export class PersonCutout {
  constructor() {
    this.task = null;
    this.mask = document.createElement('canvas');
    this.maskCtx = this.mask.getContext('2d');
    this.person = document.createElement('canvas');
    this.personCtx = this.person.getContext('2d');
    this.smooth = null;
    this.image = null;
    this.lastUpdate = -Infinity;
  }

  setTask(task) {
    this.task?.close();
    this.task = task;
  }

  /** True when a recent mask is available to draw with. */
  ready(now) {
    return !!this.task && now - this.lastUpdate < STALE_MS;
  }

  /** Segment the current video frame. Call once per new video frame. */
  update(video, now) {
    if (!this.task) return;
    let result;
    try {
      result = this.task.segmentForVideo(video, now);
    } catch (err) {
      console.warn(err);
      return;
    }
    try {
      const masks = result.confidenceMasks;
      if (!masks?.length) return;
      // Single-output selfie model: channel 0 = person. Multi-class models put background first.
      const m = masks[0];
      const invert = masks.length > 1;
      const data = m.getAsFloat32Array();
      const w = m.width;
      const h = m.height;

      const fresh = now - this.lastUpdate < STALE_MS && this.mask.width === w && this.mask.height === h;
      if (this.mask.width !== w || this.mask.height !== h || !this.image) {
        this.mask.width = w;
        this.mask.height = h;
        this.smooth = new Float32Array(w * h);
        this.image = this.maskCtx.createImageData(w, h);
        this.image.data.fill(255);
      }

      const k = fresh ? 0.6 : 1; // temporal smoothing against edge flicker
      const sm = this.smooth;
      const out = this.image.data;
      for (let i = 0; i < sm.length; i++) {
        const c = invert ? 1 - data[i] : data[i];
        sm[i] += (c - sm[i]) * k;
        let t = (sm[i] - LOW) / (HIGH - LOW);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        out[i * 4 + 3] = t * t * (3 - 2 * t) * 255;
      }
      this.maskCtx.putImageData(this.image, 0, 0);
      this.lastUpdate = now;
    } finally {
      result.close?.();
    }
  }

  /** Draw only the people from the current video frame onto ctx (over whatever is already there). */
  drawPeople(ctx, video, W, H, mirror) {
    if (this.person.width !== W || this.person.height !== H) {
      this.person.width = W;
      this.person.height = H;
    }
    const p = this.personCtx;
    p.globalCompositeOperation = 'copy';
    p.drawImage(video, 0, 0, W, H);
    p.globalCompositeOperation = 'destination-in';
    p.imageSmoothingEnabled = true;
    p.imageSmoothingQuality = 'high';
    p.filter = `blur(${Math.max(1, W / 640).toFixed(1)}px)`;
    p.drawImage(this.mask, 0, 0, W, H);
    p.filter = 'none';
    p.globalCompositeOperation = 'source-over';

    ctx.save();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(this.person, 0, 0);
    ctx.restore();
  }
}
