import type { AudioFeatures } from '../types';
import { expDecay } from '../utils';

// Audio analyzer using Web Audio API
// Extracts musical features: energy bands, onset detection, spectral features
export class AudioAnalyzer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private fftSize = 2048;
  private freqData = new Uint8Array(new ArrayBuffer(0));
  private timeData = new Uint8Array(new ArrayBuffer(0));
  private prevSpectrum: Float32Array = new Float32Array(0);

  // Smoothed features
  private smoothVolume = 0;
  private smoothBass = 0;
  private smoothMid = 0;
  private smoothTreble = 0;
  private smoothCentroid = 0;
  private prevEnergy = 0;
  private onsetThreshold = 0.15;
  private smoothFlux = 0;

  active = false;

  async start(): Promise<void> {
    try {
      // Request microphone — this captures whatever audio source the user routes
      // (physical mic, virtual audio cable, or system loopback)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.8;

      this.sourceNode = this.ctx.createMediaStreamSource(stream);
      this.sourceNode.connect(this.analyser);

      const bufLen = this.analyser.frequencyBinCount;
      this.freqData = new Uint8Array(new ArrayBuffer(bufLen));
      this.timeData = new Uint8Array(new ArrayBuffer(this.fftSize));
      this.prevSpectrum = new Float32Array(bufLen);

      this.active = true;
    } catch (err) {
      console.error('Audio init failed:', err);
      this.active = false;
    }
  }

  // Extract all audio features for this frame
  getFeatures(): AudioFeatures {
    if (!this.active || !this.analyser) {
      return {
        volume: 0, bass: 0, mid: 0, treble: 0,
        onset: false, spectralCentroid: 0, spectralFlux: 0,
      };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const binCount = this.freqData.length;
    const sampleRate = this.ctx!.sampleRate;
    const binHz = sampleRate / this.fftSize;

    // --- Energy bands ---
    // Bass: 20-250 Hz
    const bassEnd = Math.min(Math.floor(250 / binHz), binCount);
    // Mid: 250-4000 Hz
    const midEnd = Math.min(Math.floor(4000 / binHz), binCount);
    // Treble: 4000-16000 Hz
    const trebleEnd = Math.min(Math.floor(16000 / binHz), binCount);

    let bassSum = 0, midSum = 0, trebleSum = 0, totalSum = 0;
    for (let i = 0; i < binCount; i++) {
      const v = this.freqData[i] / 255;
      totalSum += v;
      if (i < bassEnd) bassSum += v;
      else if (i < midEnd) midSum += v;
      else if (i < trebleEnd) trebleSum += v;
    }

    const rawVolume = totalSum / binCount;
    const rawBass = bassEnd > 0 ? bassSum / bassEnd : 0;
    const rawMid = (midEnd - bassEnd) > 0 ? midSum / (midEnd - bassEnd) : 0;
    const rawTreble = (trebleEnd - midEnd) > 0 ? trebleSum / (trebleEnd - midEnd) : 0;

    // Smooth with exponential decay
    const smoothing = 0.15;
    this.smoothVolume = expDecay(this.smoothVolume, rawVolume, smoothing);
    this.smoothBass = expDecay(this.smoothBass, rawBass, smoothing);
    this.smoothMid = expDecay(this.smoothMid, rawMid, smoothing);
    this.smoothTreble = expDecay(this.smoothTreble, rawTreble, smoothing);

    // --- Spectral centroid (brightness) ---
    let weightedSum = 0;
    let magnitudeSum = 0;
    for (let i = 0; i < binCount; i++) {
      const mag = this.freqData[i] / 255;
      weightedSum += i * mag;
      magnitudeSum += mag;
    }
    const rawCentroid = magnitudeSum > 0
      ? (weightedSum / magnitudeSum) / binCount
      : 0;
    this.smoothCentroid = expDecay(this.smoothCentroid, rawCentroid, 0.1);

    // --- Spectral flux (rate of spectral change) ---
    let flux = 0;
    for (let i = 0; i < binCount; i++) {
      const diff = (this.freqData[i] / 255) - this.prevSpectrum[i];
      if (diff > 0) flux += diff; // half-wave rectified
      this.prevSpectrum[i] = this.freqData[i] / 255;
    }
    flux /= binCount;
    this.smoothFlux = expDecay(this.smoothFlux, flux, 0.2);

    // --- Onset detection ---
    // Simple energy-based onset: sharp rise in total energy
    const currentEnergy = rawVolume;
    const energyDelta = currentEnergy - this.prevEnergy;
    const onset = energyDelta > this.onsetThreshold && currentEnergy > 0.15;
    this.prevEnergy = currentEnergy;

    // Adaptive threshold
    this.onsetThreshold = expDecay(this.onsetThreshold, Math.max(0.08, energyDelta * 1.5), 0.01);

    return {
      volume: this.smoothVolume,
      bass: this.smoothBass,
      mid: this.smoothMid,
      treble: this.smoothTreble,
      onset,
      spectralCentroid: this.smoothCentroid,
      spectralFlux: this.smoothFlux,
    };
  }
}
