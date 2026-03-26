import './styles.css';
import p5 from 'p5';
import { AudioAnalyzer } from './audio/analyzer';
import { SeedManager } from './engine/seeds';
import { MarkovEngine } from './engine/markov';
import { Renderer } from './visual/renderer';
import type { AudioFeatures, Regime } from './types';

const audio = new AudioAnalyzer();
const seeds = new SeedManager();
const markov = new MarkovEngine(seeds.stream('markov'));
const renderer = new Renderer(seeds);

let started = false;
let debugVisible = false;
let ui: UIRefs | null = null;

interface UIRefs {
  shell: HTMLDivElement;
  startButton: HTMLButtonElement;
  statusText: HTMLSpanElement;
  regimeText: HTMLDivElement;
  blendText: HTMLDivElement;
  inputText: HTMLDivElement;
  responseText: HTMLDivElement;
}

const silentFeatures: AudioFeatures = {
  volume: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  onset: false,
  spectralCentroid: 0,
  spectralFlux: 0,
};

function simulatedAudio(frame: number): AudioFeatures {
  const t = frame * 0.01;
  const pulse = (Math.sin(t * 0.7) * 0.5 + 0.5) * 0.4;
  return {
    volume: 0.16 + pulse * 0.22,
    bass: 0.12 + Math.sin(t * 0.33) * 0.15,
    mid: 0.14 + Math.sin(t * 0.5) * 0.11,
    treble: 0.06 + Math.sin(t * 1.24) * 0.08,
    onset: Math.sin(t * 2.1) > 0.985,
    spectralCentroid: 0.32 + Math.sin(t * 0.42) * 0.09,
    spectralFlux: 0.03 + Math.abs(Math.sin(t * 0.86)) * 0.05,
  };
}

const sketch = (p: p5) => {
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.RGB, 255, 255, 255, 255);
    p.background(250, 250, 248);
    renderer.init(p);
    ui = createUI();
    updateUI(silentFeatures);
  };

  p.draw = () => {
    const features = started && audio.active
      ? audio.getFeatures()
      : simulatedAudio(p.frameCount);

    markov.update(features);
    renderer.draw(p, features, markov.regime);

    if (debugVisible) {
      drawDebug(p, features);
    }

    if (ui && p.frameCount % 4 === 0) {
      updateUI(features);
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    renderer.resize(p);
  };
};

function drawDebug(p: p5, audioFeatures: AudioFeatures) {
  const info = renderer.getDebugInfo(markov.regime, audioFeatures);
  p.push();
  p.textSize(10);
  p.textFont('IBM Plex Mono');
  const w = p.textWidth(info) + 20;
  const x = p.width - w - 16;
  const y = 16;

  p.noStroke();
  p.fill(250, 250, 248, 220);
  p.rect(x, y, w, 24, 2);
  p.stroke(225, 225, 223, 255);
  p.noFill();
  p.rect(x, y, w, 24, 2);
  p.noStroke();
  p.fill(45, 74, 94, 180);
  p.text(info, x + 10, y + 16);
  p.pop();
}

function createUI(): UIRefs {
  const shell = document.createElement('div');
  shell.id = 'signal-ui';
  shell.innerHTML = `
    <section class="hero-panel">
      <div class="eyebrow">where mathematics becomes audible</div>
      <h1 class="hero-title">Unknown Signals</h1>
      <p class="hero-body">
        An animated mathematical illustration driven by live audio.
        Probability distributions shape attractor traces, contour ridges,
        and ink-like field lines as the Markov regime shifts with the music.
      </p>
      <div class="hero-actions">
        <button id="start-btn" type="button">begin listening</button>
        <span class="status-pill">
          <span class="status-dot"></span>
          <span id="status-text">simulated field</span>
        </span>
      </div>
      <div class="hero-note">press d for telemetry</div>
    </section>
    <aside class="meta-panel">
      <div class="meta-grid">
        <div class="meta-block">
          <div class="meta-label">regime</div>
          <div class="meta-value serif" id="regime-text">gaussian</div>
        </div>
        <div class="meta-block">
          <div class="meta-label">blend</div>
          <div class="meta-value" id="blend-text">single distribution</div>
        </div>
        <div class="meta-block">
          <div class="meta-label">input</div>
          <div class="meta-value" id="input-text">simulated preview</div>
        </div>
        <div class="meta-block">
          <div class="meta-label">signal</div>
          <div class="meta-value" id="response-text">awaiting audio</div>
        </div>
      </div>
      <div class="legend">
        <span class="legend-item">contour ridges</span>
        <span class="legend-item">attractor traces</span>
        <span class="legend-item">probability lattice</span>
      </div>
    </aside>
  `;

  document.body.appendChild(shell);

  const startButton = shell.querySelector<HTMLButtonElement>('#start-btn')!;
  const statusText = shell.querySelector<HTMLSpanElement>('#status-text')!;
  const regimeText = shell.querySelector<HTMLDivElement>('#regime-text')!;
  const blendText = shell.querySelector<HTMLDivElement>('#blend-text')!;
  const inputText = shell.querySelector<HTMLDivElement>('#input-text')!;
  const responseText = shell.querySelector<HTMLDivElement>('#response-text')!;

  startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    startButton.textContent = 'requesting...';
    document.body.classList.remove('audio-error');

    await audio.start();

    if (audio.active) {
      started = true;
      document.body.classList.add('is-live');
      statusText.textContent = 'live';
      inputText.textContent = 'microphone stream';
      startButton.textContent = 'listening';
      setTimeout(() => startButton.remove(), 400);
    } else {
      started = false;
      document.body.classList.add('audio-error');
      statusText.textContent = 'unavailable';
      inputText.textContent = 'permission denied';
      startButton.disabled = false;
      startButton.textContent = 'retry';
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'd' || event.key === 'D') {
      debugVisible = !debugVisible;
    }
  });

  return { shell, startButton, statusText, regimeText, blendText, inputText, responseText };
}

function updateUI(features: AudioFeatures) {
  if (!ui) return;

  ui.regimeText.textContent = formatRegime(markov.regime);
  ui.blendText.textContent = markov.regime.secondary
    ? `${markov.regime.primary} / ${markov.regime.secondary} ${Math.round(markov.regime.blend * 100)}%`
    : 'single';

  if (!started || !audio.active) {
    ui.statusText.textContent = 'simulated';
    ui.inputText.textContent = 'preview mode';
  }

  ui.responseText.textContent =
    `${features.volume.toFixed(2)} / ${features.bass.toFixed(2)} / ${features.mid.toFixed(2)} / ${features.treble.toFixed(2)}`;
}

function formatRegime(regime: Regime): string {
  if (!regime.secondary || regime.blend < 0.08) return regime.primary;
  return `${regime.primary} + ${regime.secondary}`;
}

new p5(sketch);
