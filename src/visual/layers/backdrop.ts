import p5 from 'p5';
import type { AudioFeatures, Regime, SeededRNG, VisualParams } from '../../types';
import { getDistributionCharacter } from '../../engine/distributions';

interface DustPoint {
  x: number;
  y: number;
  size: number;
  drift: number;
  depth: number;
}

interface RingMark {
  x: number;
  y: number;
  radius: number;
  phase: number;
  bias: number;
}

export class BackdropLayer {
  private dust: DustPoint[] = [];
  private rings: RingMark[] = [];

  init(_p: p5) {
    this.dust = [];
    this.rings = [];
  }

  private ensureBackdrop(rng: SeededRNG) {
    if (this.dust.length > 0) return;

    for (let i = 0; i < 220; i++) {
      this.dust.push({
        x: rng.next(),
        y: rng.next(),
        size: 0.8 + rng.next() * 1.6,
        drift: 0.35 + rng.next() * 1.8,
        depth: rng.next(),
      });
    }

    for (let i = 0; i < 4; i++) {
      this.rings.push({
        x: 0.16 + rng.next() * 0.68,
        y: 0.12 + rng.next() * 0.36,
        radius: 0.05 + rng.next() * 0.1,
        phase: rng.next() * Math.PI * 2,
        bias: rng.next(),
      });
    }
  }

  draw(p: p5, params: VisualParams, audio: AudioFeatures, regime: Regime, rng: SeededRNG, frame: number) {
    this.ensureBackdrop(rng);

    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const char = getDistributionCharacter(regime.primary);
    const blendLift = regime.blend * 22;
    const coolLift = char.quantization * 20 + audio.spectralCentroid * 16;
    const warmLift = char.eventiness * 24 + audio.treble * 18;

    const gradient = ctx.createLinearGradient(0, 0, 0, p.height);
    gradient.addColorStop(0, `rgb(${7 + coolLift * 0.15}, ${10 + coolLift * 0.2}, ${16 + coolLift * 0.35})`);
    gradient.addColorStop(0.48, `rgb(${15 + coolLift * 0.22}, ${20 + blendLift * 0.18}, ${31 + coolLift * 0.5})`);
    gradient.addColorStop(1, `rgb(${24 + warmLift * 0.3}, ${26 + coolLift * 0.22}, ${36 + warmLift * 0.18})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, p.width, p.height);

    const washX = p.width * (0.26 + char.spread * 0.12);
    const washY = p.height * (0.18 + audio.mid * 0.04);
    const washRadius = p.width * (0.42 + char.clustering * 0.06);
    const wash = ctx.createRadialGradient(washX, washY, 0, washX, washY, washRadius);
    wash.addColorStop(0, `rgba(213, 117, 75, ${0.12 + char.eventiness * 0.08})`);
    wash.addColorStop(0.4, `rgba(120, 151, 168, ${0.08 + audio.spectralCentroid * 0.08})`);
    wash.addColorStop(1, 'rgba(120, 151, 168, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = wash;
    ctx.fillRect(washX - washRadius, washY - washRadius, washRadius * 2, washRadius * 2);
    ctx.restore();

    const floorGlowY = p.height * (0.78 - audio.bass * 0.04);
    const floorGlow = ctx.createRadialGradient(p.width * 0.54, floorGlowY, 0, p.width * 0.54, floorGlowY, p.width * 0.46);
    floorGlow.addColorStop(0, `rgba(244, 232, 205, ${0.1 + audio.volume * 0.08})`);
    floorGlow.addColorStop(0.34, `rgba(213, 117, 75, ${0.08 + params.displacement * 0.12})`);
    floorGlow.addColorStop(1, 'rgba(213, 117, 75, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = floorGlow;
    ctx.fillRect(0, floorGlowY - p.height * 0.28, p.width, p.height * 0.56);
    ctx.restore();

    p.push();
    p.stroke(255, 255, 255, 8);
    p.strokeWeight(1);
    for (let y = 0; y < p.height; y += 6) {
      p.line(0, y, p.width, y);
    }

    p.stroke(120, 151, 168, 10 + char.quantization * 10);
    for (let x = 0; x < p.width; x += Math.max(42, Math.floor(p.width / 16))) {
      p.line(x, 0, x, p.height);
    }

    p.stroke(239, 227, 199, 12);
    for (let y = 0; y < p.height; y += Math.max(34, Math.floor(p.height / 12))) {
      p.line(0, y, p.width, y);
    }
    p.pop();

    p.push();
    p.noStroke();
    for (const point of this.dust) {
      const driftX = Math.sin(frame * 0.0032 * point.drift + point.depth * 8) * p.width * 0.01;
      const driftY = Math.cos(frame * 0.0026 * point.drift + point.depth * 5) * p.height * 0.008;
      const x = point.x * p.width + driftX;
      const y = point.y * p.height + driftY - audio.bass * point.depth * 10;
      const alpha = 14 + point.depth * 22 + audio.treble * 18;

      p.fill(
        198 + point.depth * 24,
        184 + point.depth * 16,
        164 + point.depth * 12,
        alpha,
      );
      p.circle(x, y, point.size + point.depth * 1.4);
    }
    p.pop();

    for (const ring of this.rings) {
      const x = ring.x * p.width + Math.sin(frame * 0.002 + ring.phase) * p.width * 0.012;
      const y = ring.y * p.height + Math.cos(frame * 0.0018 + ring.phase) * p.height * 0.01;
      const radius = ring.radius * Math.min(p.width, p.height) * (1 + audio.volume * 0.08 + ring.bias * 0.14);

      ctx.save();
      ctx.setLineDash([12 + ring.bias * 12, 18 + ring.bias * 10]);
      ctx.lineWidth = 1.1 + ring.bias * 0.8;
      ctx.strokeStyle = `rgba(239, 227, 199, ${0.06 + audio.spectralCentroid * 0.1})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, ring.phase * 0.1, Math.PI * (1.2 + ring.bias));
      ctx.stroke();
      ctx.restore();
    }
  }
}
