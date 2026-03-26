# Unknown Signals

Unknown Signals is a browser-based music visualizer built with Vite, TypeScript, p5.js, and the Web Audio API. Live audio does not drive a generic spectrum display here; it pushes a small probabilistic system that keeps changing its own drawing logic over time.

The current pass intentionally moved away from the earlier pastel glass/prism look. The app now behaves more like a dark plotting-room instrument: contour stacks, warped lattice lines, sparse sparks, and editorial overlays that feel closer to mathematical art than to a polished consumer UI.

## Revised Design Prompt

Build a fullscreen visualizer that feels like:

- a scientific plate waking up under live sound
- a field notebook for stochastic systems
- computational printmaking with motion
- topographic contours, ghost traces, and instrument marks
- restrained, intelligent graphics instead of glossy faux-3D effects

Use a Markov-like regime switcher over real probability distributions so that:

- bass compresses and bends the terrain
- mids shear the lattice and contour bodies
- treble seeds sparks, fragmentation, and fine perturbation
- onsets can push the system into more dramatic regimes

Keep the interface lean:

- one fullscreen canvas
- one start control for microphone permissions
- one lightweight metadata overlay
- optional telemetry with the `D` key

## Visual Direction

This version leans on:

- dark graphite, bone, rust, and steel-blue instead of aqua glass gradients
- contour ridges as the primary visual mass
- a warped coordinate lattice instead of low-poly filled geometry
- sparse particle traces instead of floating prisms
- editorial typography and technical labels instead of generic UI chrome

## Research Notes

The redesign was informed by studying public repos from [profConradi](https://github.com/profConradi):

- [profConradi.github.io](https://github.com/profConradi/profConradi.github.io) for the restrained editorial palette and serif-plus-mono frontend treatment
- [gallery metadata from the site](https://raw.githubusercontent.com/profConradi/profConradi.github.io/main/content/gallery.json) for the thematic direction: eigenvalues, sandpiles, fog, orbits, plankton, broken symmetry
- [MathArt](https://github.com/profConradi/MathArt), [Fractals](https://github.com/profConradi/Fractals), and [ALife](https://github.com/profConradi/ALife) for the broader computational-art / simulation context
- [scriba.html](https://raw.githubusercontent.com/profConradi/scriba/main/scriba.html) for another example of his understated frontend styling

This project does not copy any of those works directly. It borrows the stronger shared cues: mathematical subject matter, restrained typography, and graphics that feel authored rather than flashy.

## System Overview

Core modules:

- `src/audio` extracts volume, bass, mids, treble, onset, spectral centroid, and spectral flux
- `src/engine/distributions.ts` contains the distribution samplers and visual-character mapping
- `src/engine/markov.ts` handles regime persistence, blends, and abrupt transitions
- `src/visual/renderer.ts` composes the scene
- `src/visual/layers` contains the background, lattice, density bands, ridgelines, and particles

Current layer stack:

1. Backdrop: dark gradient, wash, plotting grid, dust, and ring marks
2. Field: warped coordinate lattice
3. Density: contour bands under the main ridges
4. Ridgelines: the main topographic signal body
5. Particles: sparse sparks and ghost traces

## Distribution Mapping

- `gaussian`: centered, smooth displacement and tighter contour bodies
- `uniform`: flatter spread and calmer, more democratic spacing
- `poisson`: burstier events and more abrupt mark-making
- `exponential`: decay-heavy motion with quick falloff
- `beta`: asymmetry and edge-biased motion
- `binomial`: quantized, step-like snapping
- `gamma`: delayed surges and rolling shifts
- `lognormal`: occasional longer reaches in the motion field
- `pareto`: rare dramatic outliers and heavier visual shocks

## Local Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Audio Notes

- Browsers do not give reliable true system-audio capture in a plain web app, so this version uses microphone input via `getUserMedia`.
- If you need desktop audio, route it into the browser with a virtual audio device or loopback input.
- Before permissions are granted, the app uses simulated features so the scene still previews motion.

## Files Worth Tweaking

- `src/main.ts` for overlay copy and start-flow behavior
- `src/styles.css` for typography, palette, and HUD styling
- `src/visual/renderer.ts` for layer ordering and global accents
- `src/visual/layers/ridgelines.ts` for the main terrain character
- `src/visual/layers/field.ts` for the lattice motion

## Self-Critique

What improved in this pass:

- the scene has a much clearer point of view than the earlier glassy composition
- the UI and canvas now belong to the same visual world
- the motion reads more like technical art than decorative floating objects

What still needs eyeballing in a browser:

- the exact balance between contour density and particle count
- microphone responsiveness across different devices and browsers
- whether the overlay should stay as visible once live input begins
