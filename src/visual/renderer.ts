import p5 from 'p5';
import type { AudioFeatures, Regime, VisualParams } from '../types';
import { getDistributionCharacter } from '../engine/distributions';
import { SeedManager } from '../engine/seeds';
import { lerp } from '../utils';
import { BackdropLayer } from './layers/backdrop';
import { FieldLayer } from './layers/field';
import { DensityLayer } from './layers/density';
import { RidgelineLayer } from './layers/ridgelines';
import { ParticleLayer } from './layers/particles';

// Light mathematical gallery aesthetic inspired by profConradi:
// warm parchment background, dark ink-like strokes, attractor traces,
// contour ridgelines. Like an animated scientific illustration.

export class Renderer {
  private backdrop = new BackdropLayer();
  private field = new FieldLayer();
  private density = new DensityLayer();
  private ridges = new RidgelineLayer();
  private particles = new ParticleLayer();
  private seeds: SeedManager;
  private frame = 0;

  private currentParams: VisualParams = this.defaultParams();

  constructor(seeds: SeedManager) {
    this.seeds = seeds;
  }

  init(p: p5) {
    this.backdrop.init(p);
    this.field.init(p);
    this.density.init(p);
    this.ridges.init(p);
    this.particles.init(p);
  }

  resize(p: p5) {
    this.init(p);
  }

  draw(p: p5, audio: AudioFeatures, regime: Regime) {
    this.frame++;

    const targetParams = this.computeParams(regime, audio);
    this.smoothParams(targetParams);
    const params = this.currentParams;

    // Layer order: backdrop -> field lattice -> density wash -> ridgelines -> particles -> accent marks
    this.backdrop.draw(p, params, audio, regime, this.seeds.stream('backdrop'), this.frame);

    p.push();
    this.field.draw(p, params, audio, regime, this.seeds.stream('field'), this.frame);
    p.pop();

    p.push();
    this.density.draw(p, params, audio, regime, this.seeds.stream('density'), this.frame);
    p.pop();

    p.push();
    this.ridges.draw(p, params, audio, regime, this.seeds.stream('ridges'), this.frame);
    p.pop();

    p.push();
    this.particles.draw(p, params, audio, regime, this.seeds.stream('particles'), this.frame);
    p.pop();

    this.drawAccentMarks(p, audio, params);
  }

  private drawAccentMarks(p: p5, audio: AudioFeatures, params: VisualParams) {
    // Subtle copper/slate accent glyphs like mathematical notation marks
    const ctx = p.drawingContext as CanvasRenderingContext2D;

    // Warm copper bloom — faint, like aged paper foxing
    const x1 = p.width * (0.72 + audio.spectralCentroid * 0.08);
    const y1 = p.height * 0.2;
    const r1 = Math.min(p.width, p.height) * (0.08 + audio.volume * 0.04);
    const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, r1);
    g1.addColorStop(0, `rgba(212, 165, 116, ${0.06 + audio.volume * 0.03})`);
    g1.addColorStop(1, 'rgba(212, 165, 116, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = g1;
    ctx.fillRect(x1 - r1, y1 - r1, r1 * 2, r1 * 2);
    ctx.restore();

    // Thin crosshair marks at accent points
    p.push();
    p.stroke(45, 74, 94, 18 + audio.volume * 16);
    p.strokeWeight(0.6);
    const cx = p.width * 0.78;
    const cy = p.height * 0.22;
    const arm = 12 + audio.treble * 8;
    p.line(cx - arm, cy, cx + arm, cy);
    p.line(cx, cy - arm, cx, cy + arm);
    p.noFill();
    p.stroke(212, 165, 116, 14 + audio.spectralCentroid * 18);
    p.circle(cx, cy, arm * 2.4);
    p.pop();

    // Margin marks — like a printed page
    const inset = Math.max(20, Math.min(p.width, p.height) * 0.03);
    p.push();
    p.stroke(225, 225, 223, 60);
    p.strokeWeight(0.5);
    // Corner ticks
    const tick = 14;
    p.line(inset, inset, inset + tick, inset);
    p.line(inset, inset, inset, inset + tick);
    p.line(p.width - inset, inset, p.width - inset - tick, inset);
    p.line(p.width - inset, inset, p.width - inset, inset + tick);
    p.line(inset, p.height - inset, inset + tick, p.height - inset);
    p.line(inset, p.height - inset, inset, p.height - inset - tick);
    p.line(p.width - inset, p.height - inset, p.width - inset - tick, p.height - inset);
    p.line(p.width - inset, p.height - inset, p.width - inset, p.height - inset - tick);
    p.pop();
  }

  private computeParams(regime: Regime, audio: AudioFeatures): VisualParams {
    const primaryChar = getDistributionCharacter(regime.primary);
    const secondaryChar = regime.secondary
      ? getDistributionCharacter(regime.secondary)
      : primaryChar;
    const blend = regime.blend;

    const b = (key: keyof typeof primaryChar) =>
      lerp(primaryChar[key] as number, secondaryChar[key] as number, blend);

    return {
      spread: 0.16 + b('spread') * 0.48,
      clustering: b('clustering'),
      symmetry: 0.36 + (1 - b('asymmetry')) * 0.28,
      quantization: b('quantization'),

      speed: 0.14 + b('eventiness') * 0.2 + audio.volume * 0.24,
      decay: 0.68 + (1 - b('decayRate')) * 0.18 + audio.volume * 0.1,
      jitter: 0.03 + b('tailWeight') * 0.11 + audio.treble * 0.1,
      displacement: 0.18 + b('spread') * 0.26 + b('tailWeight') * 0.08 + audio.bass * 0.18,

      burstProbability: 0.018 + b('burstiness') * 0.08,
      burstMagnitude: 0.12 + b('tailWeight') * 0.24 + b('eventiness') * 0.08,
      extremeEvent: audio.onset && b('tailWeight') > 0.74 && Math.random() < 0.05,

      bassWarp: audio.bass,
      midMorph: audio.mid,
      trebleFragmentation: audio.treble,
    };
  }

  private smoothParams(target: VisualParams) {
    const rate = 0.08;
    const params = this.currentParams as unknown as Record<keyof VisualParams, number | boolean>;

    for (const key of Object.keys(target) as (keyof VisualParams)[]) {
      if (typeof target[key] === 'boolean') {
        params[key] = target[key];
      } else {
        params[key] = lerp(
          params[key] as number,
          target[key] as number,
          rate,
        );
      }
    }
  }

  private defaultParams(): VisualParams {
    return {
      spread: 0.4,
      clustering: 0.45,
      symmetry: 0.58,
      quantization: 0,
      speed: 0.2,
      decay: 0.78,
      jitter: 0.06,
      displacement: 0.24,
      burstProbability: 0.04,
      burstMagnitude: 0.2,
      extremeEvent: false,
      bassWarp: 0,
      midMorph: 0,
      trebleFragmentation: 0,
    };
  }

  getDebugInfo(regime: Regime, audio: AudioFeatures): string {
    const secondary = regime.secondary ? ` / ${regime.secondary} (${(regime.blend * 100).toFixed(0)}%)` : '';
    return `${regime.primary}${secondary} | age:${regime.age} stab:${regime.stability.toFixed(2)} | vol:${audio.volume.toFixed(2)} bass:${audio.bass.toFixed(2)} mid:${audio.mid.toFixed(2)} hi:${audio.treble.toFixed(2)}`;
  }
}
