import type { AudioFeatures, Regime, SeededRNG } from '../types';
import { getDistributionCharacter, sample } from '../engine/distributions';
import { clamp, expDecay, lerp } from '../utils';

interface Grain {
  freq: number;
  amp: number;
  phase: number;
  decay: number;
}

const TAU = Math.PI * 2;

// Sound made only of draws from the current distributions: Poisson-timed sine grains
// whose pitch and loudness are samples, over a bed of i.i.d. per-sample draws.
// It is always rendered (the plate listens to it); "hear it" just schedules the
// same buffers to the speakers.
export class NoiseSynth {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private nextTime = 0;
  private rate = 48000;
  private grains: Grain[] = [];
  private bed = 0;
  private lowState = 0;
  private highState = 0;
  private rng: SeededRNG;
  private prevVolume = 0;
  readonly features: AudioFeatures = {
    volume: 0, bass: 0, mid: 0, treble: 0, onset: false, spectralCentroid: 0, spectralFlux: 0,
  };

  constructor(rng: SeededRNG) {
    this.rng = rng;
  }

  get audible(): boolean {
    return this.ctx?.state === 'running';
  }

  // Must be called from a user gesture the first time (autoplay policy).
  async setAudible(on: boolean) {
    if (on && !this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.45;
      this.out.connect(this.ctx.destination);
    }
    if (!this.ctx) return;
    if (on) await this.ctx.resume();
    else await this.ctx.suspend();
  }

  // Render the next stretch of signal and update features. Driven by the audio clock
  // when audible, otherwise by frame time.
  pump(dt: number, regime: Regime): AudioFeatures {
    let n: number;
    const ctx = this.audible ? this.ctx! : null;
    if (ctx) {
      this.rate = ctx.sampleRate;
      this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.02);
      n = Math.floor((ctx.currentTime + 0.12 - this.nextTime) * this.rate);
    } else {
      n = Math.min(4096, Math.round(dt * this.rate));
    }
    if (n < 64) return this.features;

    const buf = this.render(n, regime);

    if (ctx && this.out) {
      const audio = ctx.createBuffer(1, n, this.rate);
      audio.copyToChannel(buf, 0);
      const src = ctx.createBufferSource();
      src.buffer = audio;
      src.connect(this.out);
      src.start(this.nextTime);
      this.nextTime += n / this.rate;
    }
    return this.features;
  }

  private render(n: number, regime: Regime): Float32Array<ArrayBuffer> {
    const { primary, secondary, blend, params, secondaryParams } = regime;
    const a = getDistributionCharacter(primary);
    const b = secondary ? getDistributionCharacter(secondary) : a;
    const eventiness = lerp(a.eventiness, b.eventiness, blend);
    const decayRate = lerp(a.decayRate, b.decayRate, blend);
    const spread = lerp(a.spread, b.spread, blend);

    const rate = this.rate;
    const pGrain = (1.2 + eventiness * 5) / rate;
    const grainDecay = Math.exp(-1 / (rate * (0.05 + (1 - decayRate) * 0.5)));
    const bedCoef = 1 - Math.exp((-TAU * (300 + spread * 2600)) / rate);
    const lowCoef = 1 - Math.exp((-TAU * 150) / rate);
    const highCoef = 1 - Math.exp((-TAU * 3000) / rate);

    const draw = () => (secondary && this.rng.next() < blend
      ? sample(secondary, this.rng, secondaryParams!)
      : sample(primary, this.rng, params));

    const buf = new Float32Array(n);
    let onset = false;
    let tot = 0, low = 0, mid = 0, high = 0, crossings = 0, prev = 0;

    for (let i = 0; i < n; i++) {
      if (this.rng.next() < pGrain && this.grains.length < 24) {
        const amp = 0.1 + Math.min(0.32, Math.abs(draw()) * 0.11);
        this.grains.push({
          freq: 55 * 2 ** clamp(2.6 + draw() * 0.9, 0, 6),
          amp,
          phase: 0,
          decay: grainDecay,
        });
        onset ||= amp > 0.2;
      }

      let x = 0;
      for (const g of this.grains) {
        x += Math.sin(g.phase) * g.amp;
        g.phase += (TAU * g.freq) / rate;
        g.amp *= g.decay;
      }
      this.bed += (draw() * 0.06 - this.bed) * bedCoef;
      x = Math.tanh((x + this.bed) * 1.2) * 0.8;
      buf[i] = x;

      this.lowState += (x - this.lowState) * lowCoef;
      this.highState += (x - this.highState) * highCoef;
      tot += x * x;
      low += this.lowState * this.lowState;
      mid += (this.highState - this.lowState) ** 2;
      high += (x - this.highState) ** 2;
      if ((x >= 0) !== (prev >= 0)) crossings++;
      prev = x;
    }
    this.grains = this.grains.filter((g) => g.amp > 1e-3);

    const f = this.features;
    const volume = Math.min(1, Math.sqrt(tot / n) * 2.4);
    f.volume = expDecay(f.volume, volume, 0.15);
    f.bass = expDecay(f.bass, Math.min(1, Math.sqrt(low / n) * 3), 0.15);
    f.mid = expDecay(f.mid, Math.min(1, Math.sqrt(mid / n) * 3), 0.15);
    f.treble = expDecay(f.treble, Math.min(1, Math.sqrt(high / n) * 5), 0.15);
    f.spectralCentroid = expDecay(f.spectralCentroid, Math.min(1, (crossings / n) * rate / 2 / 6000), 0.1);
    f.spectralFlux = expDecay(f.spectralFlux, Math.min(1, Math.abs(volume - this.prevVolume) * 4), 0.2);
    f.onset = onset;
    this.prevVolume = volume;
    return buf;
  }
}
