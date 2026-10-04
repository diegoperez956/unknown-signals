import './styles.css';
import p5 from 'p5';
import { AudioAnalyzer } from './audio/analyzer';
import { canCaptureTab, canMonitor, captureDisplayAudio, captureMonitor } from './audio/capture';
import { NoiseSynth } from './audio/synth';
import { describe } from './engine/distributions';
import { MarkovEngine } from './engine/markov';
import { LAYERS, TinyNet } from './engine/network';
import { SeedManager } from './engine/seeds';
import { Renderer } from './visual/renderer';
import type { AudioFeatures, PlateDrive } from './types';
import { lerp } from './utils';

// Three acts:
//   I   silence — the distributions themselves, drawn as densities
//   II  noise   — sound synthesised from their samples shakes the plate
//   III this computer — live audio through a tiny net whose weights are samples
type Act = 0 | 1 | 2;

const audio = new AudioAnalyzer();
const seeds = new SeedManager();
const markov = new MarkovEngine(seeds.stream('markov'));
const synth = new NoiseSynth(seeds.stream('synth'));
const net = new TinyNet(seeds.stream('net'));
const renderer = new Renderer(seeds);

const drive: PlateDrive = { noise: 0, net: new Float32Array(LAYERS[LAYERS.length - 1]), netAmt: 0 };
const TARGETS: Record<Act, { noise: number; net: number }> = {
  0: { noise: 0, net: 0 },
  1: { noise: 1, net: 0 },
  2: { noise: 0.45, net: 1 },
};
// While nobody touches anything, the piece drifts between silence and noise.
const IDLE_SECONDS: Record<Act, number> = { 0: 30, 1: 60, 2: Infinity };

let act: Act = 0;
let actStarted = performance.now();
let wandering = true;
let stream: MediaStream | null = null;
let printDensity = 0; // non-zero while a print frame is pending

const calm: AudioFeatures = {
  volume: 0, bass: 0, mid: 0, treble: 0, onset: false, spectralCentroid: 0, spectralFlux: 0,
};

const ui = buildUI();

const sketch = (p: p5) => {
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.colorMode(p.RGB, 255, 255, 255, 255);
    renderer.init(p);
  };

  p.draw = () => {
    if (wandering && (performance.now() - actStarted) / 1000 > IDLE_SECONDS[act]) {
      setAct(act === 0 ? 1 : 0);
    }

    const dt = Math.min(0.1, p.deltaTime / 1000);
    let features = calm;
    if (act === 2 && audio.active) {
      features = audio.getFeatures();
      drive.net.set(net.forward(audio.bands));
    } else if (act !== 2) {
      const synthFeatures = synth.pump(dt, markov.regime);
      if (act === 1) features = synthFeatures;
    }
    net.update(markov.regime);

    const target = TARGETS[act];
    drive.noise = lerp(drive.noise, target.noise, 0.03);
    drive.netAmt = lerp(drive.netAmt, target.net, 0.03);

    markov.update(features, dt);
    renderer.draw(p, features, markov.regime, drive, net);

    if (printDensity) savePrint(p);

    if (p.frameCount % 6 === 0) updateReadout(features);
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    renderer.resize(p);
  };

  p.keyPressed = () => {
    if (p.key === '1' || p.key === '2' || p.key === '3') chooseAct(Number(p.key) - 1 as Act);
    if (p.key === 'p' || p.key === 'P') requestPrint(p);
  };
};

// Act III needs a stream; asking for it is the way in.
function chooseAct(next: Act) {
  wandering = false;
  if (next === 2 && !audio.active) void listen(openDefault);
  else setAct(next);
}

function setAct(next: Act) {
  act = next;
  actStarted = performance.now();
  if (next !== 1 && synth.audible) void toggleHear(false);
  document.body.dataset.act = String(next);
  ui.acts.forEach((b, i) => b.setAttribute('aria-pressed', String(i === next)));
}

async function toggleHear(on = !synth.audible) {
  if (on) wandering = false;
  await synth.setAudible(on);
  ui.hear.setAttribute('aria-pressed', String(synth.audible));
  ui.hear.textContent = synth.audible ? 'hush' : 'hear it';
}

const openDefault = canCaptureTab ? captureDisplayAudio : captureMonitor;

async function listen(open: () => Promise<MediaStream | null>) {
  if (!canCaptureTab && !canMonitor) return;
  wandering = false;
  note('');
  try {
    const next = await open();
    if (!next) {
      note('no “monitor of …” device listed.');
      return;
    }
    stream?.getTracks().forEach((t) => t.stop());
    stream = next;
    audio.attach(stream);
    stream.getAudioTracks()[0].addEventListener('ended', stopListening);
    document.body.classList.add('is-live');
    setAct(2);
  } catch (err) {
    const name = (err as Error).name;
    const message = (err as Error).message;
    note(message === 'no-audio'
      ? 'no sound came through. pick a tab and tick “share tab audio”.'
      : name === 'NotAllowedError'
        ? 'sharing was cancelled.'
        : `could not listen: ${message}`);
  }
}

function stopListening() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  audio.detach();
  document.body.classList.remove('is-live');
  note('stopped listening.');
  setAct(1);
}

function requestPrint(p: p5) {
  if (ui.print.disabled) return;
  // Render the next frame at 3x, save it, then drop back.
  ui.print.disabled = true;
  printDensity = p.pixelDensity();
  p.pixelDensity(3);
}

function savePrint(p: p5) {
  const canvas = (p.drawingContext as CanvasRenderingContext2D).canvas;
  const restore = printDensity;
  printDensity = 0;
  canvas.toBlob((blob) => {
    if (blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `unknown-signals-${markov.regime.primary}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    p.pixelDensity(restore);
    ui.print.disabled = false;
  }, 'image/png');
}

function updateReadout(f: AudioFeatures) {
  const r = markov.regime;
  const law = describe(r.primary, r.params);
  ui.law.textContent = [
    `p(x) = ${law} → ridge height`,
    `x ~ ${law} → noise → ridge displacement`,
    `W ~ ${law} → net ${LAYERS.join('·')} → ridge displacement`,
  ][act];
  ui.blend.textContent = r.secondary && r.blend > 0.02
    ? `+ ${Math.round(r.blend * 100)}% ${describe(r.secondary, r.secondaryParams!)}`
    : '';
  ui.live.textContent = act === 0
    ? `ridges are the density, each one 1.2 s older than the one in front`
    : `vol ${f.volume.toFixed(2)}  bass ${f.bass.toFixed(2)}  mid ${f.mid.toFixed(2)}  hi ${f.treble.toFixed(2)}`;
}

function note(text: string) {
  ui.note.textContent = text;
}

function buildUI() {
  const shell = document.createElement('div');
  shell.id = 'signal-ui';
  shell.innerHTML = `
    <header class="title-block">
      <div class="eyebrow">three studies in probability</div>
      <h1 class="title">Unknown Signals</h1>
      <nav class="acts" aria-label="acts">
        <button type="button" data-act="0">i. silence</button>
        <button type="button" data-act="1">ii. noise</button>
        <button type="button" data-act="2">iii. this computer</button>
      </nav>
    </header>
    <div class="readout" aria-live="off">
      <div id="ro-law"></div>
      <div id="ro-blend"></div>
      <div id="ro-live"></div>
    </div>
    <div class="controls">
      <button type="button" id="hear" class="for-noise" aria-pressed="false">hear it</button>
      <button type="button" id="listen" class="needs-capture">listen to this computer</button>
      <button type="button" id="monitor" class="needs-capture" hidden>listen to this computer</button>
      <button type="button" id="print" title="save this frame as a png (p)">print</button>
      <div class="note" id="note"></div>
    </div>
  `;
  document.body.appendChild(shell);

  const $ = <T extends HTMLElement>(sel: string) => shell.querySelector<T>(sel)!;
  const refs = {
    acts: [...shell.querySelectorAll<HTMLButtonElement>('.acts button')],
    hear: $<HTMLButtonElement>('#hear'),
    print: $<HTMLButtonElement>('#print'),
    law: $('#ro-law'),
    blend: $('#ro-blend'),
    live: $('#ro-live'),
    note: $('#note'),
  };

  refs.acts.forEach((b, i) => b.addEventListener('click', () => chooseAct(i as Act)));
  refs.hear.addEventListener('click', () => void toggleHear());
  $('#listen').addEventListener('click', () => void listen(captureDisplayAudio));
  $('#monitor').addEventListener('click', () => void listen(captureMonitor));
  refs.print.addEventListener('click', () => requestPrint(sketchInstance));

  $('#listen').hidden = !canCaptureTab;
  $('#monitor').hidden = !canMonitor;
  if (!canCaptureTab) {
    refs.note.textContent = canMonitor
      ? 'tab audio needs desktop chrome. on linux this browser can listen to a system monitor.'
      : 'sound capture needs desktop chrome. this is the pure math piece.';
  }
  if (!canCaptureTab && !canMonitor) {
    document.body.classList.add('no-capture');
    refs.acts[2].disabled = true;
  }
  document.body.dataset.act = '0';
  refs.acts[0].setAttribute('aria-pressed', 'true');
  return refs;
}

// The friendly-error checker costs frames and misreads minified names as clashes.
p5.disableFriendlyErrors = true;
const sketchInstance = new p5(sketch);
