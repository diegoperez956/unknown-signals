# Unknown Signals

Three studies in probability, drawn as a dark plotting-room plate of contour ridges.

Live at https://diegoperez956.github.io/unknown-signals/

## The piece

1. **Silence.** The distributions themselves: gaussian, uniform, poisson, exponential, beta, binomial, gamma, lognormal, pareto. Each ridge is the live density of the current regime, and each one further back shows it 1.2 s earlier, so the stack is a history of the parameters drifting. A Markov regime switcher glides from one distribution to the next.
2. **Noise.** Sound made only from samples of those distributions: Poisson-timed sine grains whose pitch and loudness are draws, over a bed of per-sample draws. It shakes the plate, and particles drawn from the curves rise into the ridges. Silent by default; **hear it** plays it.
3. **This computer.** Whatever the computer is playing goes through a tiny hand-written network (16 → 10 → 8 → 8, tanh), drawn above the plate. Its weights are samples from the current distribution and re-draw as the regime moves. The outputs bend the plate.

The corner readout shows the live law, e.g. `x ~ gamma(k=2.30, θ=0.80) → noise → ridge displacement`. **Print** (or `p`) saves the current frame as a 3x PNG. Keys `1` `2` `3` switch acts. Left alone, the piece drifts between silence and noise.

## Listening

The only input is what the computer is playing. No microphone, no file drop.

- **Desktop Chrome / Edge:** "listen to this computer" opens the share picker. Pick a tab and keep "share tab audio" ticked (on Windows and ChromeOS you can share the entire screen with system audio).
- **Firefox on Linux:** the same button opens every PipeWire / PulseAudio "Monitor of …" input, which is true system audio. Chrome filters those devices out, so it uses tab sharing instead.
- **Safari, other Firefox, phones:** no audio capture; the first two acts still run.

## Run it

```sh
npm install
npm run dev     # http://localhost:5173/unknown-signals/
npm run build   # typecheck + production build into dist/
npm run check   # densities integrate to 1, samplers match their moments
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Code

- `src/engine/distributions.ts`: densities, samplers, moments, parameter drift
- `src/engine/markov.ts`: regime switching and blending
- `src/engine/network.ts`: the tiny net
- `src/audio/synth.ts`: act II noise; `src/audio/analyzer.ts`, `src/audio/capture.ts`: act III input
- `src/visual/`: backdrop, lattice, ridges, particles, network diagram
