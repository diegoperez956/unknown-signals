// Sanity check for the distribution math: every density integrates to ~1 and the
// sampler agrees with the stated moments. Run with `npm run check`.
import { ALL_DISTRIBUTIONS, draw, moments, paramsAt, pdf } from './distributions.ts';
import { createRNG } from './seeds.ts';

const DISCRETE = new Set(['poisson', 'binomial']);
const rng = createRNG(7);
let failures = 0;

for (const type of ALL_DISTRIBUTIONS) {
  for (const time of [0, 13, 40]) {
    const p = paramsAt(type, time);
    let mass = 0;
    if (DISCRETE.has(type)) {
      for (let k = 0; k <= 60; k++) mass += pdf(type, k, p);
    } else {
      const dx = 1e-3;
      for (let x = -20 + dx / 2; x < 60; x += dx) mass += pdf(type, x, p) * dx;
    }

    const n = 40000;
    let sum = 0, sq = 0;
    for (let i = 0; i < n; i++) {
      const v = draw(type, rng, p);
      sum += v;
      sq += v * v;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sq / n - mean * mean);
    const [m, s] = moments(type, p);

    // Pareto's density has a long tail past the integration window and heavy sample noise.
    const tailSlack = type === 'pareto' ? 0.02 : 0.005;
    const ok = Math.abs(mass - 1) < tailSlack
      && Math.abs(mean - m) < 0.05 * Math.max(1, Math.abs(m))
      && Math.abs(sd - s) < (type === 'pareto' ? 0.3 : 0.06) * s;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${type.padEnd(12)} t=${String(time).padEnd(3)} mass=${mass.toFixed(4)} mean=${mean.toFixed(3)}/${m.toFixed(3)} sd=${sd.toFixed(3)}/${s.toFixed(3)}`);
  }
}

if (failures) throw new Error(`${failures} check(s) failed`);
