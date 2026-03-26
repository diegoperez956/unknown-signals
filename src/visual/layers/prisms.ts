import p5 from 'p5';
import type { AudioFeatures, Regime, SeededRNG, VisualParams } from '../../types';
import { clamp, lerp } from '../../utils';

const PRISM_COUNT = 7;

interface Prism {
  x: number;
  y: number;
  size: number;
  depth: number;
  sides: number;
  phase: number;
  drift: number;
  skew: number;
  tint: number;
}

interface Point {
  x: number;
  y: number;
}

interface BuiltPrism {
  center: Point;
  front: Point[];
  back: Point[];
  shadowY: number;
  shadowW: number;
  shadowH: number;
  color: { r: number; g: number; b: number };
  alpha: number;
  sortKey: number;
}

export class PrismLayer {
  private prisms: Prism[] = [];

  init(_p: p5) {
    this.prisms = [];
  }

  private ensurePrisms(rng: SeededRNG) {
    if (this.prisms.length > 0) return;

    for (let i = 0; i < PRISM_COUNT; i++) {
      this.prisms.push({
        x: rng.next(),
        y: rng.next(),
        size: 0.7 + rng.next() * 0.8,
        depth: 0.24 + rng.next() * 0.38,
        sides: 3 + Math.floor(rng.next() * 4),
        phase: rng.next() * Math.PI * 2,
        drift: 0.4 + rng.next() * 1.4,
        skew: rng.next(),
        tint: rng.next(),
      });
    }
  }

  draw(p: p5, params: VisualParams, audio: AudioFeatures, regime: Regime, rng: SeededRNG, frame: number) {
    this.ensurePrisms(rng);

    const shapes = this.prisms
      .map((prism) => this.buildPrism(p, prism, params, audio, regime, frame))
      .sort((a, b) => a.sortKey - b.sortKey);

    for (const shape of shapes) {
      this.drawPrism(p, shape, audio, params);
    }
  }

  private buildPrism(
    p: p5,
    prism: Prism,
    params: VisualParams,
    audio: AudioFeatures,
    regime: Regime,
    frame: number,
  ): BuiltPrism {
    const spreadX = 0.18 + params.spread * 0.24;
    const spreadY = 0.16 + (1 - params.clustering) * 0.24;
    const x = p.width * (
      0.5
      + (prism.x - 0.5) * spreadX * 2
      + Math.sin(frame * 0.0022 * prism.drift + prism.phase) * 0.035
    );
    const y = p.height * (
      0.54
      + (prism.y - 0.5) * spreadY * 1.6
      + Math.cos(frame * 0.0017 * prism.drift + prism.phase) * 0.03
      - audio.bass * 0.02
    );

    const perspective = 0.78 + prism.y * 0.42;
    const size = prism.size
      * Math.min(p.width, p.height)
      * (0.065 + params.spread * 0.04)
      * perspective
      * (1 + audio.bass * 0.16);

    const rotation = prism.phase
      + frame * 0.012 * params.speed * prism.drift
      + audio.mid * 0.28
      + regime.blend * 0.18;

    const depth = prism.depth * size * (0.42 + params.displacement * 0.26 + audio.bass * 0.18);
    const offsetX = Math.cos(rotation - 0.8) * depth * 0.46;
    const offsetY = -depth * (0.28 + prism.skew * 0.18);

    const front: Point[] = [];
    const back: Point[] = [];

    for (let i = 0; i < prism.sides; i++) {
      const angle = rotation + (i / prism.sides) * p.TWO_PI;
      const noiseLift = p.noise(prism.phase + i * 0.41, frame * 0.004 + prism.skew, regime.age * 0.002);
      const radius = size * (0.76 + noiseLift * 0.2 + params.midMorph * 0.08);
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius * 0.82 + Math.cos(angle * 2 + prism.phase) * size * 0.04 * params.midMorph;

      front.push({ x: px, y: py });
      back.push({ x: px + offsetX, y: py + offsetY });
    }

    const color = this.samplePalette(prism.tint, audio.spectralCentroid);

    return {
      center: { x, y },
      front,
      back,
      shadowY: y + size * 0.9,
      shadowW: size * 1.8,
      shadowH: size * 0.42,
      color,
      alpha: 48 + audio.volume * 34 + params.burstMagnitude * 16,
      sortKey: y + size,
    };
  }

  private drawPrism(p: p5, shape: BuiltPrism, audio: AudioFeatures, params: VisualParams) {
    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const { color } = shape;

    p.push();
    p.noStroke();
    p.fill(74, 118, 122, 22 + audio.volume * 12);
    p.ellipse(shape.center.x, shape.shadowY, shape.shadowW, shape.shadowH);
    p.pop();

    p.push();
    ctx.shadowBlur = 22 + audio.volume * 20;
    ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.28)`;
    p.noStroke();
    p.fill(color.r, color.g, color.b, 18);
    this.drawPolygon(p, shape.back);
    ctx.shadowBlur = 0;
    p.pop();

    for (let i = 0; i < shape.front.length; i++) {
      const next = (i + 1) % shape.front.length;
      const alpha = shape.alpha * (0.45 + (i / shape.front.length) * 0.18);
      p.push();
      p.noStroke();
      p.fill(
        Math.max(0, color.r - 34),
        Math.max(0, color.g - 24),
        Math.max(0, color.b - 12),
        alpha * 0.7,
      );
      this.drawQuad(p, shape.front[i], shape.front[next], shape.back[next], shape.back[i]);
      p.pop();
    }

    p.push();
    p.stroke(255, 255, 255, 92);
    p.strokeWeight(1.1 + audio.mid * 0.9);
    p.fill(color.r, color.g, color.b, shape.alpha);
    this.drawPolygon(p, shape.front);
    p.pop();

    const center = this.average(shape.front);
    for (let i = 0; i < shape.front.length; i++) {
      const next = (i + 1) % shape.front.length;
      const triTint = 10 + i * 6 + audio.treble * 24;
      p.push();
      p.noStroke();
      p.fill(255, 255, 255, 12 + triTint);
      p.beginShape();
      p.vertex(center.x, center.y);
      p.vertex(shape.front[i].x, shape.front[i].y);
      p.vertex(shape.front[next].x, shape.front[next].y);
      p.endShape(p.CLOSE);
      p.pop();
    }

    p.push();
    p.noStroke();
    p.fill(255, 255, 255, 22 + audio.treble * 20);
    p.beginShape();
    for (const point of shape.front) {
      p.vertex(
        lerp(center.x, point.x, 0.55) - params.displacement * 6,
        lerp(center.y, point.y, 0.48) - 6,
      );
    }
    p.endShape(p.CLOSE);
    p.pop();

    p.push();
    p.noFill();
    p.stroke(255, 255, 255, 50 + audio.volume * 35);
    p.strokeWeight(1 + audio.treble * 1.4);
    for (let i = 0; i < shape.front.length; i += 2) {
      const point = shape.front[i];
      p.line(center.x, center.y, point.x, point.y);
      const sparkle = clamp(audio.treble * 4, 0, 2.4);
      p.circle(point.x, point.y, 2 + sparkle);
    }
    p.pop();
  }

  private samplePalette(t: number, brightness: number) {
    const stops = [
      { r: 157, g: 255, b: 228 },
      { r: 144, g: 221, b: 255 },
      { r: 225, g: 255, b: 243 },
      { r: 208, g: 255, b: 197 },
    ];

    const scaled = t * (stops.length - 1);
    const index = Math.floor(scaled);
    const next = Math.min(stops.length - 1, index + 1);
    const blend = scaled - index;
    const a = stops[index];
    const b = stops[next];

    return {
      r: Math.round(lerp(a.r, b.r, blend) + brightness * 12),
      g: Math.round(lerp(a.g, b.g, blend) + brightness * 8),
      b: Math.round(lerp(a.b, b.b, blend) + brightness * 18),
    };
  }

  private average(points: Point[]): Point {
    let x = 0;
    let y = 0;
    for (const point of points) {
      x += point.x;
      y += point.y;
    }
    return { x: x / points.length, y: y / points.length };
  }

  private drawPolygon(p: p5, points: Point[]) {
    p.beginShape();
    for (const point of points) {
      p.vertex(point.x, point.y);
    }
    p.endShape(p.CLOSE);
  }

  private drawQuad(p: p5, a: Point, b: Point, c: Point, d: Point) {
    p.beginShape();
    p.vertex(a.x, a.y);
    p.vertex(b.x, b.y);
    p.vertex(c.x, c.y);
    p.vertex(d.x, d.y);
    p.endShape(p.CLOSE);
  }
}
