import type { Regime, SeededRNG } from '../types';
import { sample } from './distributions';

// A tiny dense tanh network. Its weights are drawn from the current regime's
// distribution and glide toward fresh draws, so the regime literally shapes
// how live audio is transformed before it reaches the plate.
export const LAYERS = [16, 10, 8, 8];

export class TinyNet {
  // weights[l][j * fanIn + i]: input i of layer l -> unit j of layer l + 1
  readonly weights = LAYERS.slice(1).map((n, l) => new Float32Array(n * LAYERS[l]));
  readonly activations = LAYERS.map((n) => new Float32Array(n));
  private target = this.weights.map((w) => new Float32Array(w.length));
  private mean = new Float32Array(LAYERS[0]);
  private rng: SeededRNG;
  private drawnFrom = '';
  private age = 0;

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

  // Redraw the target weights when the regime changes, and every few seconds anyway.
  update(regime: Regime) {
    const key = `${regime.primary}/${regime.secondary}`;
    if (key !== this.drawnFrom || ++this.age > 240) {
      this.drawnFrom = key;
      this.age = 0;
      this.target.forEach((w, l) => {
        const gain = 1.4 / Math.sqrt(LAYERS[l]);
        for (let i = 0; i < w.length; i++) {
          const useSecondary = regime.secondary && this.rng.next() < regime.blend;
          w[i] = gain * (useSecondary
            ? sample(regime.secondary!, this.rng, regime.secondaryParams!)
            : sample(regime.primary, this.rng, regime.params));
        }
      });
    }
    this.weights.forEach((w, l) => {
      for (let i = 0; i < w.length; i++) w[i] += (this.target[l][i] - w[i]) * 0.03;
    });
  }

  // bands: LAYERS[0] values in 0..1. Inputs are centred on their running mean so the
  // net responds to change in the music, not just loudness.
  forward(bands: Float32Array): Float32Array {
    const input = this.activations[0];
    for (let i = 0; i < input.length; i++) {
      this.mean[i] += (bands[i] - this.mean[i]) * 0.01;
      input[i] = (bands[i] - this.mean[i]) * 4;
    }
    for (let l = 0; l < this.weights.length; l++) {
      const w = this.weights[l];
      const x = this.activations[l];
      const y = this.activations[l + 1];
      for (let j = 0; j < y.length; j++) {
        let sum = 0;
        for (let i = 0; i < x.length; i++) sum += w[j * x.length + i] * x[i];
        y[j] = Math.tanh(sum);
      }
    }
    return this.activations[this.activations.length - 1];
  }
}
