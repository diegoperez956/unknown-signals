import type { DistParams, DistributionType, SeededRNG } from '../types';

// Each distribution is real: a parameterised density, a sampler, and its moments.
// Parameters drift slowly over time so the curves breathe; the plate draws the
// densities directly (act I), streams samples from them (act II), and uses them
// as the weight prior of the little network (act III).

interface Spec {
  domain: [number, number];
  discrete?: boolean;
  params(a: number, b: number): DistParams; // a, b in [-1, 1]
  pdf(x: number, p: DistParams): number;
  draw(rng: SeededRNG, p: DistParams): number;
  moments(p: DistParams): [mean: number, sd: number];
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);

const SPECS: Record<DistributionType, Spec> = {
  gaussian: {
    domain: [-4, 4],
    params: (a, b) => ({ mu: 0.9 * a, sigma: 0.95 + 0.35 * b }),
    pdf: (x, { mu, sigma }) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) / (sigma * SQRT_2PI),
    draw: (rng, { mu, sigma }) => rng.gaussian(mu, sigma),
    moments: ({ mu, sigma }) => [mu, sigma],
  },
  uniform: {
    domain: [-3, 3],
    params: (a, b) => ({ a: -1.6 + 0.6 * a, b: 1.6 + 0.6 * b }),
    pdf: (x, { a, b }) => (x >= a && x <= b ? 1 / (b - a) : 0),
    draw: (rng, { a, b }) => a + (b - a) * rng.next(),
    moments: ({ a, b }) => [(a + b) / 2, (b - a) / Math.sqrt(12)],
  },
  poisson: {
    domain: [0, 14],
    discrete: true,
    params: (a) => ({ lambda: 3.5 + 2 * a }),
    pdf: (k, { lambda }) => (k < 0 ? 0 : Math.exp(k * Math.log(lambda) - lambda - lgamma(k + 1))),
    draw: (rng, { lambda }) => {
      const L = Math.exp(-lambda);
      let k = 0;
      let prod = rng.next();
      while (prod > L) {
        k++;
        prod *= rng.next();
      }
      return k;
    },
    moments: ({ lambda }) => [lambda, Math.sqrt(lambda)],
  },
  exponential: {
    domain: [0, 6],
    params: (a) => ({ lambda: 1.1 + 0.5 * a }),
    pdf: (x, { lambda }) => (x < 0 ? 0 : lambda * Math.exp(-lambda * x)),
    draw: (rng, { lambda }) => -Math.log(1 - rng.next()) / lambda,
    moments: ({ lambda }) => [1 / lambda, 1 / lambda],
  },
  beta: {
    domain: [0, 1],
    params: (a, b) => ({ alpha: 2.2 + a, beta: 5 + 2.5 * b }),
    pdf: (x, { alpha, beta }) => (x <= 0 || x >= 1
      ? 0
      : Math.exp((alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - lbeta(alpha, beta))),
    draw: (rng, { alpha, beta }) => {
      const ga = gammaRaw(rng, alpha);
      return ga / (ga + gammaRaw(rng, beta));
    },
    moments: ({ alpha, beta }) => {
      const s = alpha + beta;
      return [alpha / s, Math.sqrt((alpha * beta) / (s * s * (s + 1)))];
    },
  },
  binomial: {
    domain: [0, 13],
    discrete: true,
    params: (a) => ({ n: 12, p: 0.5 + 0.28 * a }),
    pdf: (k, { n, p }) => (k < 0 || k > n
      ? 0
      : Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p))),
    draw: (rng, { n, p }) => {
      let k = 0;
      for (let i = 0; i < n; i++) if (rng.next() < p) k++;
      return k;
    },
    moments: ({ n, p }) => [n * p, Math.sqrt(n * p * (1 - p))],
  },
  gamma: {
    domain: [0, 12],
    params: (a, b) => ({ k: 2.6 + 1.4 * a, theta: 0.95 + 0.35 * b }),
    pdf: (x, { k, theta }) => (x <= 0
      ? 0
      : Math.exp((k - 1) * Math.log(x) - x / theta - lgamma(k) - k * Math.log(theta))),
    draw: (rng, { k, theta }) => gammaRaw(rng, k) * theta,
    moments: ({ k, theta }) => [k * theta, Math.sqrt(k) * theta],
  },
  lognormal: {
    domain: [0, 6],
    params: (a, b) => ({ mu: 0.15 * a, sigma: 0.5 + 0.22 * b }),
    pdf: (x, { mu, sigma }) => (x <= 0
      ? 0
      : Math.exp(-((Math.log(x) - mu) ** 2) / (2 * sigma * sigma)) / (x * sigma * SQRT_2PI)),
    draw: (rng, { mu, sigma }) => Math.exp(rng.gaussian(mu, sigma)),
    moments: ({ mu, sigma }) => {
      const mean = Math.exp(mu + (sigma * sigma) / 2);
      return [mean, mean * Math.sqrt(Math.exp(sigma * sigma) - 1)];
    },
  },
  pareto: {
    domain: [0, 6],
    params: (a) => ({ xm: 1, alpha: 2.8 + 0.7 * a }),
    pdf: (x, { xm, alpha }) => (x < xm ? 0 : (alpha * xm ** alpha) / x ** (alpha + 1)),
    draw: (rng, { xm, alpha }) => xm / (1 - rng.next()) ** (1 / alpha),
    moments: ({ xm, alpha }) => [
      (alpha * xm) / (alpha - 1),
      (xm / (alpha - 1)) * Math.sqrt(alpha / (alpha - 2)),
    ],
  },
};

export const ALL_DISTRIBUTIONS = Object.keys(SPECS) as DistributionType[];

// Slow, deterministic parameter drift: same time in, same parameters out.
export function paramsAt(type: DistributionType, time: number): DistParams {
  const phase = ALL_DISTRIBUTIONS.indexOf(type) * 1.9;
  return SPECS[type].params(Math.sin(time * 0.11 + phase), Math.sin(time * 0.073 + phase * 2.3));
}

// A raw draw in the distribution's own units.
export function draw(type: DistributionType, rng: SeededRNG, params: DistParams): number {
  return SPECS[type].draw(rng, params);
}

// A standardised draw ((x - mean) / sd), clamped so heavy tails stay on the plate.
export function sample(type: DistributionType, rng: SeededRNG, params = paramsAt(type, 0)): number {
  const [mean, sd] = SPECS[type].moments(params);
  return Math.max(-8, Math.min(8, (SPECS[type].draw(rng, params) - mean) / sd));
}

// The plate shows each domain with a little air either side, so curves start at zero.
const PAD = 0.08;

// Position of a raw value across the plate, 0..1.
export function toUnit(type: DistributionType, raw: number): number {
  const [lo, hi] = SPECS[type].domain;
  return ((raw - lo) / (hi - lo) + PAD) / (1 + 2 * PAD);
}

// Density sampled across the plate into `out`, normalised to a peak of 1.
// Discrete distributions render as a comb of stems at the integers.
export function profile(type: DistributionType, params: DistParams, out: Float32Array): Float32Array {
  const spec = SPECS[type];
  const [lo, hi] = spec.domain;
  let max = 0;
  for (let i = 0; i < out.length; i++) {
    const x = lo + ((i / (out.length - 1)) * (1 + 2 * PAD) - PAD) * (hi - lo);
    let v: number;
    if (spec.discrete) {
      const k = Math.round(x);
      v = spec.pdf(k, params) * Math.max(0, 1 - Math.abs(x - k) / 0.42);
    } else {
      v = spec.pdf(x, params);
    }
    out[i] = v;
    if (v > max) max = v;
  }
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}

export function pdf(type: DistributionType, x: number, params: DistParams): number {
  return SPECS[type].pdf(x, params);
}

export function moments(type: DistributionType, params: DistParams): [number, number] {
  return SPECS[type].moments(params);
}

const SYMBOL: Record<string, string> = {
  mu: 'μ', sigma: 'σ', lambda: 'λ', theta: 'θ', alpha: 'α', beta: 'β',
};

export function describe(type: DistributionType, params: DistParams): string {
  const args = Object.entries(params)
    .map(([k, v]) => `${SYMBOL[k] ?? k}=${Number.isInteger(v) ? v : v.toFixed(2)}`)
    .join(', ');
  return `${type}(${args})`;
}

// Lanczos approximation of ln Γ(z)
function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function lbeta(a: number, b: number): number {
  return lgamma(a) + lgamma(b) - lgamma(a + b);
}

// Raw gamma sampling via Marsaglia & Tsang's method
function gammaRaw(rng: SeededRNG, shape: number): number {
  if (shape < 1) {
    return gammaRaw(rng, shape + 1) * Math.pow(rng.next(), 1 / shape);
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
