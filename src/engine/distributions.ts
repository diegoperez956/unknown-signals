import type { DistributionType, SeededRNG } from '../types';

// Each distribution sampler returns values that meaningfully shape visual behavior.
// These are not decorative labels — the statistical properties directly drive the motion.

export function sample(type: DistributionType, rng: SeededRNG): number {
  switch (type) {
    case 'gaussian':
      // Bell-shaped: most values near center, soft tails
      // Visual: central clustering, convergent motion, soft density
      return rng.gaussian(0, 1);

    case 'uniform':
      // Flat: all values equally likely
      // Visual: even spread, calm drift, democratic spacing
      return rng.next() * 2 - 1;

    case 'poisson': {
      // Discrete event count: clustered bursts
      // Visual: punctuated spawning, staccato rhythm
      const lambda = 3;
      let L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= rng.next();
      } while (p > L);
      return (k - 1 - lambda) / Math.sqrt(lambda); // normalize roughly to ~N(0,1)
    }

    case 'exponential': {
      // Strong decay: mostly small, occasionally large
      // Visual: rapid falloff, fading tails, concentrated energy
      const u = rng.next();
      return -Math.log(1 - u); // Exponential(1), range [0, inf)
    }

    case 'beta': {
      // Asymmetric: biased toward edges or center depending on params
      // Visual: edge-seeking density, skewed fields, asymmetric forms
      // Using a=2, b=5 for right-skew
      const a = 2, b = 5;
      const ga = sampleGammaRaw(rng, a);
      const gb = sampleGammaRaw(rng, b);
      return (ga / (ga + gb)) * 2 - 1; // map [0,1] to [-1,1]
    }

    case 'binomial': {
      // Quantized: discrete steps, structured variation
      // Visual: snapping, stepped motion, grid-like behavior
      const n = 8;
      const p = 0.5;
      let successes = 0;
      for (let i = 0; i < n; i++) {
        if (rng.next() < p) successes++;
      }
      return (successes - n * p) / Math.sqrt(n * p * (1 - p)); // normalize
    }

    case 'gamma': {
      // Delayed surge: builds up then peaks
      // Visual: compound timing, delayed reactions, rolling energy
      const k = 3;
      const raw = sampleGammaRaw(rng, k);
      return (raw - k) / Math.sqrt(k); // normalize roughly
    }

    case 'lognormal': {
      // Long tail: mostly moderate, occasional huge excursions
      // Visual: sudden magnitude spikes, dramatic reach
      const normal = rng.gaussian(0, 0.5);
      return Math.exp(normal) - 1; // shifted so mean ~0.13
    }

    case 'pareto': {
      // Extreme tails: rare but massive events
      // Visual: dramatic outliers, mostly calm then explosive
      const alpha = 2;
      const u = rng.next();
      return (1 / Math.pow(1 - u, 1 / alpha)) - 1; // Pareto(1, alpha) shifted
    }
  }
}

// Raw gamma sampling via Marsaglia & Tsang's method
function sampleGammaRaw(rng: SeededRNG, shape: number): number {
  if (shape < 1) {
    return sampleGammaRaw(rng, shape + 1) * Math.pow(rng.next(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do {
      x = rng.gaussian();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng.next();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Get the "character" of a distribution as visual parameter biases
export function getDistributionCharacter(type: DistributionType): {
  spread: number;
  clustering: number;
  eventiness: number;
  decayRate: number;
  asymmetry: number;
  quantization: number;
  tailWeight: number;
  burstiness: number;
} {
  switch (type) {
    case 'gaussian':
      return { spread: 0.4, clustering: 0.8, eventiness: 0.1, decayRate: 0.3, asymmetry: 0.0, quantization: 0.0, tailWeight: 0.2, burstiness: 0.1 };
    case 'uniform':
      return { spread: 0.9, clustering: 0.1, eventiness: 0.1, decayRate: 0.2, asymmetry: 0.0, quantization: 0.0, tailWeight: 0.0, burstiness: 0.0 };
    case 'poisson':
      return { spread: 0.5, clustering: 0.5, eventiness: 0.8, decayRate: 0.4, asymmetry: 0.2, quantization: 0.6, tailWeight: 0.3, burstiness: 0.9 };
    case 'exponential':
      return { spread: 0.3, clustering: 0.6, eventiness: 0.3, decayRate: 0.9, asymmetry: 0.7, quantization: 0.0, tailWeight: 0.4, burstiness: 0.2 };
    case 'beta':
      return { spread: 0.6, clustering: 0.4, eventiness: 0.2, decayRate: 0.3, asymmetry: 0.9, quantization: 0.0, tailWeight: 0.2, burstiness: 0.1 };
    case 'binomial':
      return { spread: 0.5, clustering: 0.3, eventiness: 0.4, decayRate: 0.3, asymmetry: 0.1, quantization: 0.9, tailWeight: 0.1, burstiness: 0.4 };
    case 'gamma':
      return { spread: 0.5, clustering: 0.5, eventiness: 0.5, decayRate: 0.5, asymmetry: 0.5, quantization: 0.1, tailWeight: 0.5, burstiness: 0.6 };
    case 'lognormal':
      return { spread: 0.6, clustering: 0.3, eventiness: 0.6, decayRate: 0.4, asymmetry: 0.6, quantization: 0.0, tailWeight: 0.8, burstiness: 0.5 };
    case 'pareto':
      return { spread: 0.3, clustering: 0.7, eventiness: 0.9, decayRate: 0.6, asymmetry: 0.8, quantization: 0.0, tailWeight: 1.0, burstiness: 0.8 };
  }
}
