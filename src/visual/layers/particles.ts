import p5 from 'p5';
import type { AudioFeatures, Regime, SeededRNG, VisualParams } from '../../types';
import { sample } from '../../engine/distributions';

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

  draw(p: p5, params: VisualParams, audio: AudioFeatures, regime: Regime, rng: SeededRNG, frame: number) {
    const width = p.width;
    const height = p.height;

    let spawnCount = 1 + Math.floor(params.burstProbability * 6);
    if (audio.onset) spawnCount += 10 + Math.floor(params.burstMagnitude * 16);
    if (params.extremeEvent) spawnCount += 18;
    spawnCount = Math.min(spawnCount, MAX_PARTICLES - this.particles.length);

    for (let i = 0; i < spawnCount; i++) {
      const sx = sample(regime.primary, rng);
      const sy = sample(regime.secondary || regime.primary, rng);
      const x = width * 0.5 + sx * width * 0.18 * (0.5 + params.spread);
      const y = height * 0.56 + sy * height * 0.12 * (0.5 + params.spread);
      const speed = 0.4 + params.speed * 0.8 + audio.volume * 1.8;
      const angle = -Math.PI / 2 + (rng.next() - 0.5) * 1.8;
      const magnitude = (0.4 + Math.abs(sample(regime.primary, rng)) * 0.6) * speed;
      const vx = Math.cos(angle) * magnitude;
      const vy = Math.sin(angle) * magnitude - audio.bass * 0.6;
      const life = 28 + rng.next() * 48 * (1 + params.decay);
      const brightness = 110 + rng.next() * 120;
      const warmth = rng.next();

      this.particles.push(this.spawn(x, y, vx, vy, life, brightness, warmth));
    }

    const alive: Particle[] = [];

    for (const particle of this.particles) {
      const noiseAngle = p.noise(particle.x * 0.0034, particle.y * 0.003, frame * 0.0024) * Math.PI * 4;
      const noiseForce = 0.18 + audio.mid * 0.7;
      particle.vx += Math.cos(noiseAngle) * noiseForce;
      particle.vy += Math.sin(noiseAngle) * noiseForce;

      particle.vy -= 0.012 + audio.treble * 0.08;
      particle.vy += audio.bass * params.bassWarp * 0.28;

      const damping = 0.9 - params.decay * 0.05;
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
    const lifeRatio = particle.life / particle.maxLife;
    p.push();
    p.noFill();

    for (let i = 1; i < particle.trailLen; i++) {
      const alpha = (i / particle.trailLen) * lifeRatio * particle.brightness * 0.28;
      const warm = particle.warmth * 0.7 + audio.spectralCentroid * 0.3;
      p.stroke(
        165 + warm * 80,
        132 + warm * 48,
        180 - warm * 42,
        alpha,
      );
      p.strokeWeight(0.45 + (i / particle.trailLen) * 1.1 * lifeRatio);
      p.line(
        particle.trail[(i - 1) * 2],
        particle.trail[(i - 1) * 2 + 1],
        particle.trail[i * 2],
        particle.trail[i * 2 + 1],
      );
    }

    p.noStroke();
    p.fill(240, 228, 202, 28 + lifeRatio * 48 + audio.treble * 28);
    p.circle(particle.x, particle.y, 1.8 + audio.treble * 1.8);
    p.pop();
  }
}
