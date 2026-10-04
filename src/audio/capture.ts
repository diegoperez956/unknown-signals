// The only input is whatever the computer is playing. Desktop Chromium can share
// tab audio (and whole-system audio on Windows / ChromeOS) through getDisplayMedia;
// other browsers can share the screen but not its sound.
const ua = navigator.userAgent;
const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);

const chromium = /Chrome\/|Chromium/.test(ua);

export const canCaptureTab = !mobile && chromium && !!navigator.mediaDevices?.getDisplayMedia;
// On Linux, Firefox lists PipeWire / Pulse "Monitor of …" sources as inputs, which is
// true system audio. Chromium filters them out, so it gets tab capture instead.
export const canMonitor = /Linux/.test(ua) && !mobile && !chromium && !!navigator.mediaDevices?.getUserMedia;

// Chromium 109+; not in TypeScript's DOM lib yet.
declare class CaptureController {
  setFocusBehavior(behavior: 'focus-captured-surface' | 'no-focus-change'): void;
}

const RAW_AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

export async function captureDisplayAudio(): Promise<MediaStream> {
  const controller = typeof CaptureController === 'function' ? new CaptureController() : undefined;
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true, // Chrome will not share audio without a video surface
    audio: { ...RAW_AUDIO, suppressLocalAudioPlayback: false },
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
    controller,
  } as DisplayMediaStreamOptions);
  // Chrome jumps to a shared tab by default; stay on the piece. Only valid right now.
  try {
    controller?.setFocusBehavior('no-focus-change');
  } catch {
    // a screen or window was shared: there is no focus to keep
  }

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('no-audio');
  }
  // Only the sound matters; drop the picture.
  stream.getVideoTracks().forEach((t) => t.stop());
  return stream;
}

// Linux: PipeWire / PulseAudio expose "Monitor of <output>" as an input device, which
// is true system audio. Device labels stay hidden until the page has audio permission,
// so ask once, look for monitors, and never fall back to a real microphone. The page
// cannot tell which output is in use, so every monitor is opened and mixed.
export async function captureMonitor(): Promise<MediaStream | null> {
  let devices = await navigator.mediaDevices.enumerateDevices();
  let unlock: MediaStream | undefined;
  try {
    if (!devices.some((d) => d.kind === 'audioinput' && d.label)) {
      unlock = await navigator.mediaDevices.getUserMedia({ audio: true });
      devices = await navigator.mediaDevices.enumerateDevices();
    }
    const monitors = devices.filter((d) => d.kind === 'audioinput' && /monitor of/i.test(d.label));
    if (monitors.length === 0) return null;
    const opened = await Promise.allSettled(monitors.map((m) => navigator.mediaDevices.getUserMedia({
      audio: { ...RAW_AUDIO, deviceId: { exact: m.deviceId } },
    })));
    const streams = opened.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const failed = opened.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) {
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      throw failed.reason;
    }
    return new MediaStream(streams.flatMap((s) => s.getAudioTracks()));
  } finally {
    unlock?.getTracks().forEach((t) => t.stop());
  }
}
