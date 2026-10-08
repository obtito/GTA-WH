// Sustained frame-time windows, with slower recovery than downscaling. This
// avoids alternating sharp/soft frames every few seconds on a loaded GPU.
export class AdaptiveRenderScale {
  constructor(maxScale, minScale = .75) {
    this.max = maxScale;
    this.min = Math.min(minScale, maxScale);
    this.scale = maxScale;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.frames = 0;
    this.fastSeconds = 0;
  }

  sample(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return this.scale;
    this.elapsed += seconds;
    this.frames++;
    if (this.elapsed < 3) return this.scale;
    const fps = this.frames / this.elapsed;
    if (fps < 50) {
      this.scale = Math.max(this.min, this.scale - .15);
      this.fastSeconds = 0;
    } else if (fps > 59) {
      this.fastSeconds += this.elapsed;
      if (this.fastSeconds >= 12) {
        this.scale = Math.min(this.max, this.scale + .05);
        this.fastSeconds = 0;
      }
    } else {
      this.fastSeconds = 0;
    }
    this.elapsed = 0;
    this.frames = 0;
    return this.scale;
  }
}
