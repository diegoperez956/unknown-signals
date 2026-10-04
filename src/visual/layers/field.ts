import p5 from 'p5';
import type { AudioFeatures, Regime, SeededRNG, VisualParams } from '../../types';
import { sample } from '../../engine/distributions';

const GRID_COLS = 13;
const GRID_ROWS = 10;

interface LatticePoint {
  x: number;
  y: number;
}

export class FieldLayer {
  private offsetX: Float32Array = new Float32Array(0);
  private offsetY: Float32Array = new Float32Array(0);

  init(_p: p5) {
    this.offsetX = new Float32Array(GRID_COLS * GRID_ROWS);
    this.offsetY = new Float32Array(GRID_COLS * GRID_ROWS);
  }

  draw(p: p5, params: VisualParams, audio: AudioFeatures, regime: Regime, rng: SeededRNG, frame: number) {
    const points: LatticePoint[] = [];
    const quantStep = params.quantization > 0.52
      ? Math.max(8, Math.floor(params.quantization * 20))
      : 0;

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const idx = row * GRID_COLS + col;
        const nx = col / (GRID_COLS - 1);
        const ny = row / (GRID_ROWS - 1);

        const baseX = p.width * (0.08 + nx * 0.84);
        const baseY = p.height * (0.12 + ny * 0.72);
        const flow = p.noise(nx * 2.8 + frame * 0.0015, ny * 3.4 - frame * 0.0011, regime.age * 0.004);
        const lateral = sample(regime.primary, rng, regime.params) * p.width * 0.006 * (0.4 + params.displacement);
        const vertical = sample(regime.primary, rng, regime.params) * p.height * 0.008 * (0.45 + params.displacement);

        this.offsetX[idx] = this.offsetX[idx] * 0.9 + ((flow - 0.5) * (18 + params.displacement * 24) + lateral) * 0.1;
        this.offsetY[idx] = this.offsetY[idx] * 0.88 + (
          Math.sin(frame * 0.01 * params.speed + nx * 5 + ny * 3) * (4 + audio.mid * 14)
          + (flow - 0.5) * (16 + params.displacement * 18)
          + vertical
          - audio.bass * 12 * (1 - ny)
        ) * 0.12;

        let x = baseX + this.offsetX[idx];
        let y = baseY + this.offsetY[idx];

        if (quantStep > 0) {
          x = Math.round(x / quantStep) * quantStep;
          y = Math.round(y / quantStep) * quantStep;
        }

        points.push({ x, y });
      }
    }

    p.push();
    p.noFill();

    for (let row = 0; row < GRID_ROWS; row++) {
      p.stroke(110, 136, 155, 18 + row * 2 + audio.volume * 10);
      p.strokeWeight(row % 3 === 0 ? 1.1 : 0.75);
      p.beginShape();
      for (let col = 0; col < GRID_COLS; col++) {
        const point = points[row * GRID_COLS + col];
        p.vertex(point.x, point.y);
      }
      p.endShape();
    }

    for (let col = 0; col < GRID_COLS; col++) {
      p.stroke(184, 170, 142, 10 + col * 1.3 + audio.spectralCentroid * 20);
      p.strokeWeight(col % 4 === 0 ? 0.95 : 0.65);
      p.beginShape();
      for (let row = 0; row < GRID_ROWS; row++) {
        const point = points[row * GRID_COLS + col];
        p.vertex(point.x, point.y);
      }
      p.endShape();
    }

    p.noStroke();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if ((row + col) % 3 !== 0) continue;
        const point = points[row * GRID_COLS + col];
        p.fill(
          226,
          206 - row * 4,
          172 + col * 2,
          14 + (audio.onset ? 24 : 0),
        );
        p.circle(point.x, point.y, 1.5 + audio.treble * 1.6);
      }
    }

    p.pop();
  }
}
