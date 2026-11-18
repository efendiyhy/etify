import { create } from 'zustand';
import { getMasteringChain } from '@/playback/equalizer';
import { currentOutputLevel, ensureAudioGraph, onTrackEnded, usePlayer } from '@/state/player';

/**
 * The master recorder (REC-1): records the finished sound, after the EQ and
 * every module, exactly as it reaches the speakers, to WAV, MP3, Opus or
 * AAC. Lossless formats are captured as PCM by an AudioWorklet and can be
 * trimmed and normalised afterwards; Opus and AAC use the browser's own
 * MediaRecorder.
 *
 * The chain's output sits after the volume, so the recorder divides the
 * volume back out (volume compensation), runs its own safety limiter, and
 * can pause with the music and cut a file per song.
 */

export type RecFormat = 'wav24' | 'wav16' | 'mp3-320' | 'mp3-192' | 'opus' | 'aac';
export type RecMode = 'manual' | 'song' | 'split';

export interface RecSettings {
  format: RecFormat;
  mode: RecMode;
  /** Song modes: start the song from 0:00 when recording starts. */
  fromStart: boolean;
  /** Stop capturing while the music is paused. */
  autoPause: boolean;
  /** Take the silence off both ends (WAV and MP3). */
  trimSilence: boolean;
  /** Bring the loudest peak to −1 dBFS (WAV and MP3). */
  normalize: boolean;
  /** Record as at full volume, whatever the volume slider says. */
  compensate: boolean;
  /** A brickwall at −1 dBFS before the recorder, so nothing clips in the file. */
  safetyLimiter: boolean;
  /** Recording level, dB. */
  inputGainDb: number;
}

export interface Recording {
  id: string;
  name: string;
  url: string;
  size: number;
  seconds: number;
  format: RecFormat;
  mime: string;
  ext: string;
}

export type RecStatus = 'idle' | 'arming' | 'recording' | 'paused' | 'encoding';

interface RecState {
  settings: RecSettings;
  status: RecStatus;
  /** Seconds in the file being recorded. */
  elapsed: number;
  /** Bytes so far (an estimate for the compressed formats). */
  bytes: number;
  /** The record level's peak, dBFS, and whether it reached 0 dBFS (held until reset). */
  peakL: number;
  peakR: number;
  clipped: boolean;
  error: string | null;
  recordings: Recording[];
  set: (patch: Partial<RecSettings>) => void;
  start: () => Promise<void>;
  stop: () => void;
  resetClip: () => void;
  remove: (id: string) => void;
}

export const FORMATS: Record<RecFormat, { ext: string; mime: string; lossless: boolean; kbps?: number; pcm: boolean }> = {
  wav24: { ext: 'wav', mime: 'audio/wav', lossless: true, pcm: true },
  wav16: { ext: 'wav', mime: 'audio/wav', lossless: true, pcm: true },
  'mp3-320': { ext: 'mp3', mime: 'audio/mpeg', lossless: false, kbps: 320, pcm: true },
  'mp3-192': { ext: 'mp3', mime: 'audio/mpeg', lossless: false, kbps: 192, pcm: true },
  opus: { ext: 'webm', mime: 'audio/webm;codecs=opus', lossless: false, kbps: 256, pcm: false },
  aac: { ext: 'm4a', mime: 'audio/mp4;codecs=mp4a.40.2', lossless: false, kbps: 256, pcm: false },
};

/** Whether this browser can record [format] (Opus and AAC depend on MediaRecorder). */
export function formatSupported(format: RecFormat): boolean {
  const f = FORMATS[format];
  if (f.pcm) return typeof AudioWorkletNode !== 'undefined';
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(f.mime);
}

const KEY = 'etify:recorder';
const DEFAULTS: RecSettings = {
  format: 'wav24',
  mode: 'song',
  fromStart: true,
  autoPause: true,
  trimSilence: true,
  normalize: false,
  compensate: true,
  safetyLimiter: true,
  inputGainDb: 0,
};

function load(): RecSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<RecSettings> | null;
    if (!raw) return DEFAULTS;
    const merged = { ...DEFAULTS, ...raw };
    return {
      ...merged,
      format: merged.format in FORMATS ? merged.format : DEFAULTS.format,
      mode: ['manual', 'song', 'split'].includes(merged.mode) ? merged.mode : DEFAULTS.mode,
      inputGainDb: Math.max(-12, Math.min(12, Number(merged.inputGainDb) || 0)),
    };
  } catch {
    return DEFAULTS;
  }
}

const db2lin = (db: number) => 10 ** (db / 20);
const lin2db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

// ---- The capture graph, built per recording session ------------------------------------

interface Session {
  ctx: AudioContext;
  input: GainNode;
  limiter: DynamicsCompressorNode;
  meterL: AnalyserNode;
  meterR: AnalyserNode;
  tap: AudioWorkletNode | null;
  streamDest: MediaStreamAudioDestinationNode | null;
  timer: ReturnType<typeof setInterval>;
  unsubs: (() => void)[];
}

/** The file being recorded: PCM blocks, or the MediaRecorder's chunks. */
interface Take {
  title: string;
  videoId: string | null;
  frames: number;
  left: Float32Array[];
  right: Float32Array[];
  media: MediaRecorder | null;
  chunks: Blob[];
  startedAt: number;
}

let session: Session | null = null;
let take: Take | null = null;
let workletLoaded: Promise<void> | null = null;

function trackTitle(): { title: string; videoId: string | null } {
  const now = usePlayer.getState().nowPlaying;
  if (!now) return { title: 'Etify recording', videoId: null };
  return { title: [now.artist, now.title].filter(Boolean).join(' - ') || 'Etify recording', videoId: now.videoId };
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Etify recording';
}

function newTake(): Take {
  const { title, videoId } = trackTitle();
  const t: Take = { title, videoId, frames: 0, left: [], right: [], media: null, chunks: [], startedAt: performance.now() };
  const { format } = useRecorder.getState().settings;
  const f = FORMATS[format];
  if (!f.pcm && session?.streamDest) {
    const media = new MediaRecorder(session.streamDest.stream, { mimeType: f.mime, audioBitsPerSecond: (f.kbps ?? 256) * 1000 });
    media.ondataavailable = (e) => {
      if (e.data.size > 0) t.chunks.push(e.data);
    };
    media.start(1000);
    t.media = media;
  }
  return t;
}

/** Applies the recording level: the chosen gain, and the volume divided back out. */
function applyGain() {
  if (!session) return;
  const { inputGainDb, compensate } = useRecorder.getState().settings;
  const level = currentOutputLevel();
  const comp = compensate ? 1 / Math.max(level, 0.05) : 1;
  session.input.gain.setTargetAtTime(db2lin(inputGainDb) * comp, session.ctx.currentTime, 0.05);
  session.limiter.threshold.setTargetAtTime(useRecorder.getState().settings.safetyLimiter ? -1 : 0, session.ctx.currentTime, 0.02);
  session.limiter.ratio.setTargetAtTime(useRecorder.getState().settings.safetyLimiter ? 20 : 1, session.ctx.currentTime, 0.02);
}

function readMeters() {
  if (!session) return;
  const buf = new Float32Array(session.meterL.fftSize);
  const peak = (a: AnalyserNode) => {
    a.getFloatTimeDomainData(buf);
    let p = 0;
    for (const v of buf) p = Math.max(p, Math.abs(v));
    return p;
  };
  const l = peak(session.meterL);
  const r = peak(session.meterR);
  const clipped = useRecorder.getState().clipped || Math.max(l, r) >= 0.999;
  const elapsed = take ? take.frames / session.ctx.sampleRate : 0;
  let bytes = 0;
  const { format } = useRecorder.getState().settings;
  if (take) {
    const f = FORMATS[format];
    if (format === 'wav24') bytes = take.frames * 6;
    else if (format === 'wav16') bytes = take.frames * 4;
    else if (f.pcm) bytes = (elapsed * (f.kbps ?? 320) * 1000) / 8;
    else bytes = take.chunks.reduce((n, c) => n + c.size, 0);
  }
  const mediaElapsed = take?.media ? (performance.now() - take.startedAt) / 1000 : elapsed;
  useRecorder.setState({ peakL: lin2db(l), peakR: lin2db(r), clipped, elapsed: take?.media ? mediaElapsed : elapsed, bytes });
}

// ---- Finishing a file: trim, normalise, encode ---------------------------------------

function concat(parts: Float32Array[], frames: number): Float32Array {
  const out = new Float32Array(frames);
  let at = 0;
  for (const p of parts) {
    out.set(p.subarray(0, Math.min(p.length, frames - at)), at);
    at += p.length;
    if (at >= frames) break;
  }
  return out;
}

/** The first and last frames louder than −60 dBFS, with a 50 ms margin. */
function soundBounds(l: Float32Array, r: Float32Array, rate: number): [number, number] {
  const floor = db2lin(-60);
  let a = 0;
  while (a < l.length && Math.abs(l[a]!) < floor && Math.abs(r[a]!) < floor) a++;
  let b = l.length - 1;
  while (b > a && Math.abs(l[b]!) < floor && Math.abs(r[b]!) < floor) b--;
  const margin = Math.round(rate * 0.05);
  return [Math.max(0, a - margin), Math.min(l.length, b + margin + 1)];
}

function encodeWav(l: Float32Array, r: Float32Array, rate: number, bits: 16 | 24): Blob {
  const bytesPer = bits / 8;
  const dataSize = l.length * 2 * bytesPer;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2 * bytesPer, true);
  v.setUint16(32, 2 * bytesPer, true);
  v.setUint16(34, bits, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  let o = 44;
  const max = bits === 16 ? 32767 : 8388607;
  for (let i = 0; i < l.length; i++) {
    for (const s of [l[i]!, r[i]!]) {
      // TPDF dither for 16-bit: the quantisation noise stays noise, not distortion.
      const d = bits === 16 ? (Math.random() - Math.random()) / max : 0;
      const x = Math.round(Math.max(-1, Math.min(1, s + d)) * max);
      if (bits === 16) {
        v.setInt16(o, x, true);
        o += 2;
      } else {
        v.setUint8(o, x & 0xff);
        v.setUint8(o + 1, (x >> 8) & 0xff);
        v.setUint8(o + 2, (x >> 16) & 0xff);
        o += 3;
      }
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function encodeMp3(l: Float32Array, r: Float32Array, rate: number, kbps: number): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  // LAME takes 44.1 or 48 kHz; other rates would need resampling, and contexts run at one of these.
  const encoder = new Mp3Encoder(2, rate, kbps);
  const toInt16 = (src: Float32Array) => {
    const out = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(src[i]! * 32767)));
    return out;
  };
  const parts: BlobPart[] = [];
  const CHUNK = 1152 * 64;
  for (let i = 0; i < l.length; i += CHUNK) {
    const bytes = encoder.encodeBuffer(toInt16(l.subarray(i, i + CHUNK)), toInt16(r.subarray(i, i + CHUNK)));
    if (bytes.length) parts.push(new Uint8Array(bytes));
    // Let the page breathe between chunks.
    if ((i / CHUNK) % 8 === 7) await new Promise((res) => setTimeout(res, 0));
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  return new Blob(parts, { type: 'audio/mpeg' });
}

async function finishTake(t: Take): Promise<void> {
  const { format, trimSilence, normalize } = useRecorder.getState().settings;
  const f = FORMATS[format];
  const rate = session?.ctx.sampleRate ?? 48000;
  let blob: Blob;
  let seconds: number;

  if (t.media) {
    const media = t.media;
    await new Promise<void>((resolve) => {
      media.onstop = () => resolve();
      if (media.state !== 'inactive') media.stop();
      else resolve();
    });
    blob = new Blob(t.chunks, { type: f.mime.split(';')[0] });
    seconds = (performance.now() - t.startedAt) / 1000;
  } else {
    let l = concat(t.left, t.frames);
    let r = concat(t.right, t.frames);
    if (trimSilence && l.length > 0) {
      const [a, b] = soundBounds(l, r, rate);
      l = l.subarray(a, b);
      r = r.subarray(a, b);
    }
    if (normalize && l.length > 0) {
      let peak = 0;
      for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!));
      if (peak > 1e-4) {
        const g = db2lin(-1) / peak;
        l = l.map((x) => x * g);
        r = r.map((x) => x * g);
      }
    }
    seconds = l.length / rate;
    if (seconds < 0.5) return;
    blob = format === 'wav24' ? encodeWav(l, r, rate, 24) : format === 'wav16' ? encodeWav(l, r, rate, 16) : await encodeMp3(l, r, rate, f.kbps ?? 320);
  }
  if (blob.size === 0) return;
  const recording: Recording = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: safeName(t.title),
    url: URL.createObjectURL(blob),
    size: blob.size,
    seconds,
    format,
    mime: blob.type,
    ext: f.ext,
  };
  useRecorder.setState((s) => ({ recordings: [recording, ...s.recordings] }));
}

/** Files still being encoded. */
let encoding = 0;
/** Whether the recorder is paused with the music. */
let pausedWithMusic = false;

/** The status from the facts: encoding, recording (or paused), or idle. */
function refreshStatus() {
  const status: RecStatus = session ? (pausedWithMusic ? 'paused' : 'recording') : encoding > 0 ? 'encoding' : 'idle';
  if (useRecorder.getState().status !== status) useRecorder.setState({ status });
}

/** Closes the current file (encoding it in the background) and, if [next], opens another. */
function cutTake(next: boolean) {
  const done = take;
  take = null;
  if (done) {
    session?.tap?.port.postMessage('flush');
    encoding++;
    // Give the flushed block a moment to arrive before encoding.
    setTimeout(() => {
      void finishTake(done)
        .catch((e: unknown) => useRecorder.setState({ error: String(e instanceof Error ? e.message : e) }))
        .finally(() => {
          encoding--;
          refreshStatus();
        });
    }, 120);
  }
  if (next) take = newTake();
}

function teardown() {
  if (!session) return;
  clearInterval(session.timer);
  session.unsubs.forEach((u) => u());
  try {
    getMasteringChain()?.output.disconnect(session.input);
  } catch {
    // Already gone.
  }
  session.tap?.disconnect();
  session.input.disconnect();
  session = null;
}

export const useRecorder = create<RecState>()((set, get) => ({
  settings: load(),
  status: 'idle',
  elapsed: 0,
  bytes: 0,
  peakL: -120,
  peakR: -120,
  clipped: false,
  error: null,
  recordings: [],

  set: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // The settings last for this tab.
    }
    applyGain();
  },

  start: async () => {
    if (session) return;
    set({ status: 'arming', error: null, clipped: false });
    await ensureAudioGraph();
    const chain = getMasteringChain();
    if (!chain) {
      set({ status: 'idle', error: 'play' });
      return;
    }
    const { settings } = get();
    const f = FORMATS[settings.format];
    if (!formatSupported(settings.format)) {
      set({ status: 'idle', error: 'format' });
      return;
    }
    const ctx = chain.ctx;
    const input = new GainNode(ctx, { gain: 1, channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -1, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
    chain.output.connect(input);
    input.connect(limiter);
    const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    limiter.connect(split);
    const meterL = new AnalyserNode(ctx, { fftSize: 2048 });
    const meterR = new AnalyserNode(ctx, { fftSize: 2048 });
    split.connect(meterL, 0);
    split.connect(meterR, 1);

    let tap: AudioWorkletNode | null = null;
    let streamDest: MediaStreamAudioDestinationNode | null = null;
    if (f.pcm) {
      workletLoaded ??= ctx.audioWorklet.addModule(new URL('./dsp/recorder-worklet.js', import.meta.url));
      await workletLoaded;
      tap = new AudioWorkletNode(ctx, 'etify-recorder-tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
      tap.port.onmessage = (e: MessageEvent<{ l: Float32Array; r: Float32Array }>) => {
        if (!take) return;
        take.left.push(e.data.l);
        take.right.push(e.data.r);
        take.frames += e.data.l.length;
      };
      limiter.connect(tap);
    } else {
      streamDest = new MediaStreamAudioDestinationNode(ctx, { channelCount: 2 });
      limiter.connect(streamDest);
    }

    pausedWithMusic = false;
    const s: Session = { ctx, input, limiter, meterL, meterR, tap, streamDest, timer: setInterval(() => (readMeters(), applyGain()), 100), unsubs: [] };
    session = s;
    applyGain();

    // Song modes start the song over, then record it.
    const player = usePlayer.getState();
    if (settings.mode !== 'manual' && settings.fromStart && player.nowPlaying) player.seek(0);
    take = newTake();
    set({ status: 'recording', elapsed: 0, bytes: 0 });

    // The song ran out: one song stops here; split closes this file and opens the next on the next song.
    s.unsubs.push(
      onTrackEnded(() => {
        const mode = get().settings.mode;
        if (mode === 'song') get().stop();
        else if (mode === 'split') cutTake(false);
      }),
    );
    // A different song (skipped, or the next one starting).
    s.unsubs.push(
      usePlayer.subscribe((state, previous) => {
        const id = state.nowPlaying?.videoId ?? null;
        if (id !== (previous.nowPlaying?.videoId ?? null)) {
          const mode = get().settings.mode;
          if (mode === 'song' && take && take.videoId !== id) get().stop();
          else if (mode === 'split') {
            if (take && take.videoId !== id) cutTake(true);
            else if (!take) take = newTake();
          } else if (take && mode === 'manual' && !take.videoId) take.title = trackTitle().title;
        }
        // Pause with the music.
        if (get().settings.autoPause && state.status !== previous.status) {
          const playing = state.status === 'playing' || state.status === 'buffering';
          s.tap?.port.postMessage(playing ? 'resume' : 'pause');
          if (take?.media) {
            if (!playing && take.media.state === 'recording') take.media.pause();
            if (playing && take.media.state === 'paused') take.media.resume();
          }
          pausedWithMusic = !playing;
          refreshStatus();
        }
      }),
    );
    const playing = player.status === 'playing' || player.status === 'buffering';
    if (settings.autoPause && !playing && settings.mode === 'manual') {
      tap?.port.postMessage('pause');
      if (take?.media?.state === 'recording') take.media.pause();
      pausedWithMusic = true;
      refreshStatus();
    }
  },

  stop: () => {
    if (!session) return;
    cutTake(false);
    // Disconnect after the last block has been flushed.
    const s = session;
    setTimeout(() => {
      if (session === s) teardown();
      refreshStatus();
    }, 200);
    set({ status: 'encoding' });
  },

  resetClip: () => set({ clipped: false }),

  remove: (id) => {
    const rec = get().recordings.find((r) => r.id === id);
    if (rec) URL.revokeObjectURL(rec.url);
    set({ recordings: get().recordings.filter((r) => r.id !== id) });
  },
}));

/** 3:07 or 1:02:45. */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 4.2 MB. */
export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(0, n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
