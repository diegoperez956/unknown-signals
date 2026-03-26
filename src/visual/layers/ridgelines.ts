import p5 from 'p5';
import type { AudioFeatures, Regime, SeededRNG, VisualParams } from '../../types';
import { sample } from '../../engine/distributions';

const NUM_LINES = 54;
const POINTS_PER_LINE = 180;

interface RidgeLine {
  baseY: number;
  phase: number;
  offsets: Float32Array;
}

export class RidgelineLayer {
  private lines: RidgeLine[] = [];
  private prevFrame: Float32Array[] = [];

  init(p: p5) {
    this.lines = [];
    this.prevFrame = [];

    const spacing = p.height / (NUM_LINES + 8);
    for (let i = 0; i < NUM_LINES; i++) {
      this.lines.push({
        baseY: spacing * (i + 3),
        phase: (i / NUM_LINES) * Math.PI * 2,
        offsets: new Float32Array(POINTS_PER_LINE),
      });
      this.prevFrame.push(new Float32Array(POINTS_PER_LINE));
    }
  }

  draw(p: p5, params: VisualParams, audio: AudioFeatures, regime: Regime, rng: SeededRNG, frame: number) {
    const width = p.width;
    const height = p.height;
    const spacing = height / (NUM_LINES + 8);
    const verticalWarp = 1 + params.bassWarp * 0.34;
    const displacementScale = 22 + params.displacement * 74 + params.midMorph * 44;
    const jitterScale = params.jitter * 6 + params.trebleFragmentation * 9;
    const margin = width * 0.07;
    const drawWidth = width - margin * 2;

    for (let i = 0; i < NUM_LINES; i++) {
      const line = this.lines[i];
      const lineProgress = i / Math.max(1, NUM_LINES - 1);
      line.baseY = height * 0.28 + spacing * i * verticalWarp;
      line.baseY += Math.sin(frame * 0.006 + line.phase) * spacing * 0.12;

      const points: number[] = [];

      for (let j = 0; j < POINTS_PER_LINE; j++) {
        const t = j / (POINTS_PER_LINE - 1);
        const x = margin + t * drawWidth;

        const primary = sample(regime.primary, rng);
        const secondary = regime.secondary ? sample(regime.secondary, rng) : primary;
        const blendedSample = primary * (1 - regime.blend) + secondary * regime.blend;

        const noiseVal = p.noise(
          t * 3.2 + frame * 0.0024,
          lineProgress * 5 + frame * 0.0018,
          frame * 0.0008,
        );

        const envelope = Math.sin(t * Math.PI) ** 1.85;
        const displacement = (
          (noiseVal - 0.45) * 0.8
          + blendedSample * 0.16 * (1 + audio.volume * 2.2)
        ) * displacementScale * envelope;

        const jitter = (rng.next() - 0.5) * jitterScale * (0.4 + audio.treble * 2.8);
        line.offsets[j] = line.offsets[j] * (0.88 + params.decay * 0.08) + displacement * 0.08;

        const y = line.baseY - displacement - line.offsets[j] * 0.34 + jitter;
        points.push(x, y);
      }

      if (this.prevFrame[i]) {
        p.push();
        p.noFill();
        p.stroke(213, 117, 75, 8 + params.decay * 20);
        p.strokeWeight(0.5);
        p.beginShape();
        for (let j = 0; j < POINTS_PER_LINE; j++) {
          p.vertex(margin + (j / (POINTS_PER_LINE - 1)) * drawWidth, this.prevFrame[i][j]);
        }
        p.endShape();
        p.pop();
      }

      p.push();
      p.noFill();
      p.stroke(
        224 + lineProgress * 22,
        208 - lineProgress * 18 + audio.mid * 12,
        182 - lineProgress * 34 + (params.extremeEvent ? 18 : 0),
        34 + lineProgress * 100 + audio.volume * 56,
      );
      p.strokeWeight(0.55 + lineProgress * 0.74 + audio.mid * 0.75);

      p.beginShape();
      for (let j = 0; j < POINTS_PER_LINE; j++) {
        const x = points[j * 2];
        const y = points[j * 2 + 1];
        p.vertex(x, y);
        this.prevFrame[i][j] = y;
      }
      p.endShape();
      p.pop();
    }
  }
}
