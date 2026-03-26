import p5 from 'p5';
import type { AudioFeatures, Regime, SeededRNG, VisualParams } from '../../types';

const NUM_BANDS = 6;
const RESOLUTION = 72;

export class DensityLayer {
  private bandPhases: Float32Array = new Float32Array(0);

  init(_p: p5) {
    this.bandPhases = new Float32Array(NUM_BANDS);
    for (let i = 0; i < NUM_BANDS; i++) {
      this.bandPhases[i] = Math.random() * Math.PI * 2;
    }
  }

  draw(p: p5, params: VisualParams, audio: AudioFeatures, _regime: Regime, _rng: SeededRNG, frame: number) {
    p.push();

    for (let band = 0; band < NUM_BANDS; band++) {
      const progress = band / Math.max(1, NUM_BANDS - 1);
      const baseY = p.height * (0.3 + progress * 0.4);
      const amplitude = 18 + band * 7 + params.displacement * 18 + audio.mid * 10;
      const thickness = 10 + band * 4 + audio.volume * 10;

      const contour: { x: number; y: number }[] = [];
      const body: { x: number; y: number }[] = [];

      for (let i = 0; i < RESOLUTION; i++) {
        const t = i / (RESOLUTION - 1);
        const x = p.width * (0.03 + t * 0.94);
        const envelope = Math.sin(t * Math.PI) ** 1.6;
        const wave = p.noise(t * 4.4 + band * 0.3, frame * 0.002 + band * 0.8, band * 0.22);
        const harmonic = Math.sin(
          t * Math.PI * (1.4 + progress * 1.5)
          + frame * 0.01 * (0.35 + progress * 0.2)
          + this.bandPhases[band],
        ) * amplitude * 0.44;
        const y = baseY - envelope * (wave - 0.5) * amplitude * 1.4 + harmonic - audio.bass * 10 * (1 - progress);

        contour.push({ x, y });
        body.push({ x, y: y + thickness * (0.7 + p.noise(t * 3.8, band * 0.4, frame * 0.001) * 0.22) });
      }

      p.noStroke();
      p.fill(32, 37, 46, 16 + band * 5 + audio.volume * 10);
      p.beginShape();
      for (const point of contour) {
        p.vertex(point.x, point.y);
      }
      for (let i = body.length - 1; i >= 0; i--) {
        p.vertex(body[i].x, body[i].y);
      }
      p.endShape(p.CLOSE);

      for (let pass = 0; pass < 3; pass++) {
        p.noFill();
        p.stroke(
          230 - band * 4 + pass * 3,
          212 - band * 7,
          174 - band * 10 + pass * 2,
          20 + band * 10 + pass * 8 + audio.treble * 18,
        );
        p.strokeWeight(0.9 + pass * 0.5);
        p.beginShape();
        for (const point of contour) {
          p.vertex(point.x, point.y - pass * (1.8 + progress * 1.4));
        }
        p.endShape();
      }
    }

    p.pop();
  }
}
