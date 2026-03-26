import type { DistributionType, Regime, AudioFeatures } from '../types';
import type { SeededRNG } from '../types';
import { lerp } from '../utils';

const ALL_DISTRIBUTIONS: DistributionType[] = [
  'gaussian', 'uniform', 'poisson', 'exponential',
  'beta', 'binomial', 'gamma', 'lognormal', 'pareto',
];

// Transition affinities: which distributions naturally flow into which
// Higher values = more likely transition. This makes the state machine feel musical,
// not random — certain regimes prefer certain successors.
const AFFINITY: Partial<Record<DistributionType, Partial<Record<DistributionType, number>>>> = {
  gaussian:    { uniform: 0.3, beta: 0.2, gamma: 0.2, lognormal: 0.15, exponential: 0.1 },
  uniform:     { gaussian: 0.3, poisson: 0.2, binomial: 0.2, beta: 0.15 },
  poisson:     { exponential: 0.3, gamma: 0.25, binomial: 0.2, pareto: 0.15 },
  exponential: { gaussian: 0.3, gamma: 0.2, lognormal: 0.2, pareto: 0.15 },
  beta:        { gaussian: 0.3, uniform: 0.2, lognormal: 0.2, gamma: 0.15 },
  binomial:    { poisson: 0.3, uniform: 0.2, gaussian: 0.2, gamma: 0.15 },
  gamma:       { exponential: 0.3, lognormal: 0.25, poisson: 0.2, gaussian: 0.15 },
  lognormal:   { pareto: 0.3, exponential: 0.2, gamma: 0.2, gaussian: 0.15 },
  pareto:      { exponential: 0.3, lognormal: 0.2, poisson: 0.2, gaussian: 0.2 },
};

export class MarkovEngine {
  regime: Regime;
  private rng: SeededRNG;
  private transitionCooldown = 0;

  // Smoothed transition blend target
  private blendTarget = 0;

  constructor(rng: SeededRNG) {
    this.rng = rng;
    this.regime = {
      primary: 'gaussian',
      secondary: null,
      blend: 0,
      age: 0,
      stability: 0.7,
    };
  }

  update(audio: AudioFeatures) {
    this.regime.age++;
    if (this.transitionCooldown > 0) this.transitionCooldown--;

    // Smooth blend interpolation
    this.regime.blend = lerp(this.regime.blend, this.blendTarget, 0.02);

    // Stability increases over time (regime wants to persist)
    // but decreases with strong audio events
    this.regime.stability = Math.min(1, this.regime.stability + 0.001);
    if (audio.onset) {
      this.regime.stability *= 0.7;
    }
    this.regime.stability -= audio.spectralFlux * 0.1;
    this.regime.stability = Math.max(0, this.regime.stability);

    // --- Transition logic ---

    // Strong onset + low stability = abrupt regime change
    if (audio.onset && this.regime.stability < 0.4 && this.transitionCooldown <= 0) {
      this.transitionAbrupt(audio);
      return;
    }

    // Gradual morphing: after the regime has lived long enough
    // Start blending toward a new secondary distribution
    if (this.regime.age > 180 && this.regime.secondary === null && this.rng.next() < 0.01) {
      this.regime.secondary = this.pickNext(this.regime.primary);
      this.blendTarget = 0.3 + this.rng.next() * 0.4; // blend 30-70%
    }

    // If we've been blending for a while, maybe commit to the secondary
    if (this.regime.secondary && this.regime.blend > 0.5 && this.regime.age > 360) {
      if (this.rng.next() < 0.005 || (audio.onset && this.rng.next() < 0.3)) {
        this.regime.primary = this.regime.secondary;
        this.regime.secondary = null;
        this.regime.blend = 0;
        this.blendTarget = 0;
        this.regime.age = 0;
        this.regime.stability = 0.6;
        this.transitionCooldown = 60;
      }
    }

    // Energy-based: high sustained bass can force regime toward heavier distributions
    if (audio.bass > 0.7 && this.regime.age > 120 && this.transitionCooldown <= 0) {
      if (this.rng.next() < 0.008) {
        this.regime.secondary = this.rng.next() < 0.5 ? 'gamma' : 'exponential';
        this.blendTarget = 0.5;
      }
    }

    // Quiet passage: drift toward calmer distributions
    if (audio.volume < 0.1 && this.regime.age > 240 && this.transitionCooldown <= 0) {
      if (this.rng.next() < 0.005) {
        this.regime.secondary = this.rng.next() < 0.5 ? 'gaussian' : 'uniform';
        this.blendTarget = 0.4;
      }
    }
  }

  private transitionAbrupt(audio: AudioFeatures) {
    // On strong events, jump to a high-energy distribution
    const energetic: DistributionType[] = ['poisson', 'pareto', 'lognormal', 'gamma'];
    const calm: DistributionType[] = ['gaussian', 'uniform', 'beta'];

    const pool = audio.volume > 0.5 ? energetic : calm;
    const next = pool[Math.floor(this.rng.next() * pool.length)];

    // Avoid staying in the same distribution
    if (next !== this.regime.primary) {
      this.regime.primary = next;
      this.regime.secondary = null;
      this.regime.blend = 0;
      this.blendTarget = 0;
      this.regime.age = 0;
      this.regime.stability = 0.5 + this.rng.next() * 0.3;
      this.transitionCooldown = 90; // ~1.5 seconds at 60fps
    }
  }

  private pickNext(current: DistributionType): DistributionType {
    const affinities = AFFINITY[current] || {};
    const candidates: { dist: DistributionType; weight: number }[] = [];

    for (const dist of ALL_DISTRIBUTIONS) {
      if (dist === current) continue;
      candidates.push({ dist, weight: affinities[dist] || 0.05 });
    }

    // Weighted random selection
    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    let r = this.rng.next() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c.dist;
    }
    return candidates[candidates.length - 1].dist;
  }
}
