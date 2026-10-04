import p5 from 'p5';
import type { AudioFeatures, PlateDrive, Regime, SeededRNG, VisualParams } from '../../types';
import { paramsAt, profile, sample } from '../../engine/distributions';

const NUM_LINES = 40;
const POINTS_PER_LINE = 160;
// Each ridge back from the front shows the density this many seconds earlier.
const LAG_PER_LINE = 1.2;

export interface PlateGeometry {
  left: number;
  width: number;
  top: number;
  bottom: number;
  peak: number;
}

export function plateGeometry(p: p5): PlateGeometry {
  const left = p.width * 0.08;
  const top = p.height * 0.3;
  const bottom = p.height * 0.86;
  return { left, width: p.width - left * 2, top, bottom, peak: ((bottom - top) / NUM_LINES) * 11 };
}

// The plate: a stack of ridges, each one the live density of the current regime.
// Act II adds displacement from sampled noise, act III from the network's outputs.
export class RidgelineLayer {
  private offsets: Float32Array[] = [];
  private prevFrame: Float32Array[] = [];
  private shapeA = new Float32Array(POINTS_PER_LINE);
  private shapeB = new Float32Array(POINTS_PER_LINE);
  private ys = new Float32Array(POINTS_PER_LINE);

  init(_p: p5) {
    this.offsets = Array.from({ length: NUM_LINES }, () => new Float32Array(POINTS_PER_LINE));
    this.prevFrame = Array.from({ length: NUM_LINES }, () => new Float32Array(POINTS_PER_LINE));
  }

  draw(
    p: p5,
    params: VisualParams,
    audio: AudioFeatures,
    regime: Regime,
    rng: SeededRNG,
    frame: number,
    drive: PlateDrive,
  ) {
    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const { left, width, top, bottom, peak } = plateGeometry(p);
    const spacing = (bottom - top) / (NUM_LINES - 1);
    const displacementScale = 22 + params.displacement * 74 + params.midMorph * 44;
    const jitterScale = params.jitter * 6 + params.trebleFragmentation * 9;
    const net = drive.net;
    const ghostAlpha = (0.03 + params.decay * 0.08) * drive.noise;

    for (let i = 0; i < NUM_LINES; i++) {
      let drawn = 0;
      const lineProgress = i / (NUM_LINES - 1);
      const time = regime.time - (NUM_LINES - 1 - i) * LAG_PER_LINE;
      const shape = profile(regime.primary, paramsAt(regime.primary, time), this.shapeA);
      if (regime.secondary) {
        const other = profile(regime.secondary, paramsAt(regime.secondary, time), this.shapeB);
        for (let j = 0; j < POINTS_PER_LINE; j++) {
          shape[j] += (other[j] - shape[j]) * regime.blend;
        }
      }

      const baseY = top + spacing * i * (1 + params.bassWarp * 0.06 * drive.noise)
        + Math.sin(frame * 0.006 + lineProgress * Math.PI * 2) * spacing * 0.12;
      const offsets = this.offsets[i];

      for (let j = 0; j < POINTS_PER_LINE; j++) {
        const t = j / (POINTS_PER_LINE - 1);
        const density = shape[j];
        let y = baseY - density * peak;

        if (drive.noise > 0.001) {
          const noiseVal = p.noise(t * 3.2 + frame * 0.0024, lineProgress * 5 + frame * 0.0018, frame * 0.0008);
          const envelope = Math.sin(t * Math.PI) ** 1.85;
          // Neighbouring points share some of each draw, so it reads as a waveform.
          drawn = drawn * 0.45 + sample(regime.primary, rng, regime.params) * 0.55;
          // Noise lives mostly inside the curve: it fills the distribution.
          const displacement = ((noiseVal - 0.45) * 0.8 + drawn * 0.16 * (1 + audio.volume * 2.2))
            * displacementScale * envelope * (0.25 + density) * drive.noise;
          offsets[j] = offsets[j] * (0.88 + params.decay * 0.08) + displacement * 0.08;
          y -= displacement + offsets[j] * 0.34;
          y += (rng.next() - 0.5) * jitterScale * (0.4 + audio.treble * 2.8) * drive.noise;
        }

        if (drive.netAmt > 0.001) {
          const k = t * (net.length - 1);
          const k0 = Math.floor(k);
          const v = net[k0] + (net[Math.min(net.length - 1, k0 + 1)] - net[k0]) * (k - k0);
          y -= v * (0.2 + density) * peak * 0.6 * drive.netAmt;
        }

        this.ys[j] = y;
      }

      const xAt = (j: number) => left + (j / (POINTS_PER_LINE - 1)) * width;

      // Ghost of the previous frame, in rust
      if (ghostAlpha > 0.004) {
        const prev = this.prevFrame[i];
        ctx.beginPath();
        for (let j = 0; j < POINTS_PER_LINE; j++) ctx.lineTo(xAt(j), prev[j]);
        ctx.strokeStyle = `rgba(213, 117, 75, ${ghostAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Occlude the ridges behind, then ink this one
      ctx.beginPath();
      for (let j = 0; j < POINTS_PER_LINE; j++) ctx.lineTo(xAt(j), this.ys[j]);
      ctx.lineTo(left + width, baseY);
      ctx.lineTo(left, baseY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(11, 14, 21, 0.78)';
      ctx.fill();

      ctx.beginPath();
      for (let j = 0; j < POINTS_PER_LINE; j++) ctx.lineTo(xAt(j), this.ys[j]);
      const r = 224 + lineProgress * 22;
      const g = 208 - lineProgress * 18 + audio.mid * 12;
      const b = 182 - lineProgress * 34 + (params.extremeEvent ? 18 : 0);
      const a = (40 + lineProgress * 130 + audio.volume * 56) / 255;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, a)})`;
      ctx.lineWidth = 0.6 + lineProgress * 0.8 + audio.mid * 0.75;
      ctx.stroke();

      this.prevFrame[i].set(this.ys);
    }
  }
}
