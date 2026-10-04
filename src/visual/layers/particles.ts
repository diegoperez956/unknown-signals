import p5 from 'p5';
import type { AudioFeatures, PlateDrive, Regime, SeededRNG, VisualParams } from '../../types';
import { draw, toUnit } from '../../engine/distributions';
import type { PlateGeometry } from './ridgelines';

const MAX_PARTICLES = 420;
const TRAIL_LENGTH = 18;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  trail: Float32Array;
  trailLen: number;
  brightness: number;
  warmth: number;
}

export class ParticleLayer {
  private particles: Particle[] = [];
  private pool: Particle[] = [];

  init(_p: p5) {
    this.particles = [];
    this.pool = [];
  }

  private spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    brightness: number,
    warmth: number,
  ): Particle {
    let particle = this.pool.pop();
    if (!particle) {
      particle = {
        x,
        y,
        vx,
        vy,
        life,
        maxLife: life,
        trail: new Float32Array(TRAIL_LENGTH * 2),
        trailLen: 0,
        brightness,
        warmth,
      };
    } else {
      particle.x = x;
      particle.y = y;
      particle.vx = vx;
      particle.vy = vy;
      particle.life = life;
      particle.maxLife = life;
      particle.trailLen = 0;
      particle.brightness = brightness;
      particle.warmth = warmth;
    }
    return particle;
  }

  // Particles are literal draws: x is a sample from the regime's distribution, placed
  // on the plate's axis, released from the floor to rise into the ridges.
  draw(
    p: p5,
    params: VisualParams,
    audio: AudioFeatures,
    regime: Regime,
    rng: SeededRNG,
    frame: number,
    drive: PlateDrive,
    plate: PlateGeometry,
  ) {
    const width = p.width;
    const height = p.height;
    const strength = Math.min(1, drive.noise + drive.netAmt);

    let spawnCount = 1 + Math.floor(params.burstProbability * 6);
    if (audio.onset) spawnCount += 10 + Math.floor(params.burstMagnitude * 16);
    if (params.extremeEvent) spawnCount += 18;
    spawnCount = Math.min(Math.round(spawnCount * strength), MAX_PARTICLES - this.particles.length);

    for (let i = 0; i < spawnCount; i++) {
      const fromSecondary = regime.secondary && rng.next() < regime.blend;
      const type = fromSecondary ? regime.secondary! : regime.primary;
      const raw = draw(type, rng, fromSecondary ? regime.secondaryParams! : regime.params);
      const u = toUnit(type, raw);
      if (u < 0 || u > 1) continue;
      const x = plate.left + u * plate.width;
      const y = plate.bottom + 6 + rng.next() * 10;
      const speed = 0.4 + params.speed * 0.8 + audio.volume * 1.8;
      const vx = (rng.next() - 0.5) * 0.3;
      const vy = -(1.2 + rng.next() * 1.6) * speed - audio.bass * 0.6;
      const life = 40 + rng.next() * 70 * (1 + params.decay);
      const brightness = 110 + rng.next() * 120;
      const warmth = rng.next();

      this.particles.push(this.spawn(x, y, vx, vy, life, brightness, warmth));
    }

    const alive: Particle[] = [];

    for (const particle of this.particles) {
      const noiseAngle = p.noise(particle.x * 0.0034, particle.y * 0.003, frame * 0.0024) * Math.PI * 4;
      const noiseForce = 0.05 + audio.mid * 0.25;
      particle.vx += Math.cos(noiseAngle) * noiseForce;
      particle.vy += Math.sin(noiseAngle) * noiseForce;

      particle.vy -= 0.012 + audio.treble * 0.08;
      particle.vy -= audio.bass * params.bassWarp * 0.08;

      const damping = 0.975 - params.decay * 0.01;
      particle.vx *= damping;
      particle.vy *= damping;

      particle.vx += (rng.next() - 0.5) * params.trebleFragmentation * 1.4;
      particle.vy += (rng.next() - 0.5) * params.trebleFragmentation * 1.4;

      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life--;

      if (particle.trailLen < TRAIL_LENGTH) {
        particle.trail[particle.trailLen * 2] = particle.x;
        particle.trail[particle.trailLen * 2 + 1] = particle.y;
        particle.trailLen++;
      } else {
        particle.trail.copyWithin(0, 2);
        particle.trail[(TRAIL_LENGTH - 1) * 2] = particle.x;
        particle.trail[(TRAIL_LENGTH - 1) * 2 + 1] = particle.y;
      }

      if (
        particle.life > 0
        && particle.x > -40
        && particle.x < width + 40
        && particle.y > -40
        && particle.y < height + 40
      ) {
        alive.push(particle);
        this.drawParticle(p, particle, audio);
      } else {
        this.pool.push(particle);
      }
    }

    this.particles = alive;
  }

  private drawParticle(p: p5, particle: Particle, audio: AudioFeatures) {
    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const lifeRatio = particle.life / particle.maxLife;
    const warm = particle.warmth * 0.7 + audio.spectralCentroid * 0.3;

    ctx.beginPath();
    for (let i = 0; i < particle.trailLen; i++) {
      ctx.lineTo(particle.trail[i * 2], particle.trail[i * 2 + 1]);
    }
    ctx.strokeStyle = `rgba(${165 + warm * 80}, ${132 + warm * 48}, ${180 - warm * 42}, ${(lifeRatio * particle.brightness * 0.2) / 255})`;
    ctx.lineWidth = 0.5 + lifeRatio * 0.7;
    ctx.stroke();

    ctx.fillStyle = `rgba(240, 228, 202, ${(40 + lifeRatio * 80 + audio.treble * 28) / 255})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 1 + audio.treble, 0, Math.PI * 2);
    ctx.fill();
  }
}
