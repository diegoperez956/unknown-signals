// --- Probability Distribution Types ---

export type DistributionType =
  | 'gaussian'
  | 'uniform'
  | 'poisson'
  | 'exponential'
  | 'beta'
  | 'binomial'
  | 'gamma'
  | 'lognormal'
  | 'pareto';

export type DistParams = Record<string, number>;

// Audio features extracted each frame
export interface AudioFeatures {
  volume: number;       // 0–1 overall amplitude
  bass: number;         // 0–1 low frequency energy
  mid: number;          // 0–1 mid frequency energy
  treble: number;       // 0–1 high frequency energy
  onset: boolean;       // beat / transient detected this frame
  spectralCentroid: number; // 0–1 brightness
  spectralFlux: number;     // 0–1 rate of spectral change
}

// Current regime state
export interface Regime {
  primary: DistributionType;
  secondary: DistributionType | null;
  blend: number;           // 0–1 interpolation between primary/secondary
  age: number;             // frames since this regime started
  stability: number;       // 0–1 how resistant to transition
  time: number;            // engine clock in seconds, drives parameter drift
  params: DistParams;      // current parameters of primary
  secondaryParams: DistParams | null;
}

// Visual behavior parameters derived from regime + audio
export interface VisualParams {
  // Structural
  spread: number;          // how spread out elements are
  clustering: number;      // tendency to group
  symmetry: number;        // bilateral/radial symmetry strength
  quantization: number;    // discrete vs continuous motion

  // Motion
  speed: number;           // base animation speed
  decay: number;           // trail/ghost persistence (0=instant, 1=forever)
  jitter: number;          // fine perturbation intensity
  displacement: number;    // large-scale warping

  // Events
  burstProbability: number; // chance of spawning event per frame
  burstMagnitude: number;   // intensity of burst events
  extremeEvent: boolean;    // rare dramatic visual moment

  // Audio-reactive modifiers
  bassWarp: number;        // structural compression from bass
  midMorph: number;        // shape tension from mids
  trebleFragmentation: number; // fine detail from highs
}

// How strongly each act's force shapes the plate (all 0–1, eased between acts)
export interface PlateDrive {
  noise: number;           // act II: displacement from sampled noise / live features
  net: Float32Array;       // act III: network outputs (-1..1), spread across the plate
  netAmt: number;
}

// Seeded RNG state
export interface SeededRNG {
  next(): number;           // 0–1
  gaussian(mean?: number, std?: number): number;
  seed: number;
}
