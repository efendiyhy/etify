/**
 * The mastering chain's settings: a 12-band parametric EQ and the
 * enhancement modules, all plain data so they can be saved, compared (A/B),
 * exported and imported. The engine (MasteringChain.ts) turns them into Web
 * Audio nodes; nothing here touches audio.
 */

export type FilterType = 'peaking' | 'lowshelf' | 'highshelf' | 'highpass' | 'lowpass' | 'notch' | 'tilt';
export type Slope = 12 | 24 | 48;

export interface EqBand {
  on: boolean;
  type: FilterType;
  /** Hz, 20–20 000. */
  freq: number;
  /** dB, ±24 (peaking, shelves, tilt). */
  gain: number;
  /** 0.1–18 (peaking, notch, 12 dB/oct pass filters). Web Audio's shelves have no Q. */
  q: number;
  /** dB/octave, for high-pass and low-pass. */
  slope: Slope;
}

export interface CompressorBand {
  threshold: number; // dB
  ratio: number;
  attack: number; // s
  release: number; // s
  makeup: number; // dB
}

export interface MasteringSettings {
  /** The whole chain on; off, the sound passes through untouched (and time-aligned). */
  enabled: boolean;
  preampDb: number;
  /** Lowers the input by the EQ curve's highest peak, so boosts can't clip. */
  autoPreamp: boolean;
  bands: EqBand[];
  /** A built-in preset's id, a custom preset's name, or 'custom'. */
  preset: string;
  comp: { on: boolean; lowCross: number; highCross: number; bands: [CompressorBand, CompressorBand, CompressorBand] };
  exciter: { on: boolean; mode: 'tube' | 'tape'; drive: number; freq: number; mix: number };
  bass: { on: boolean; freq: number; amount: number };
  stereo: { on: boolean; width: number; monoBelow: number };
  crossfeed: { on: boolean; amount: number };
  /** Virtual surround: a matrix rear channel (the side, delayed) and a decorrelated room, both 0–1. */
  surround: { on: boolean; amount: number; size: number; depth: number };
  /** 8D audio: the sound circles the listener (HRTF); [speed] is seconds per turn, [depth] 0–1 the mix. */
  eightD: { on: boolean; speed: number; depth: number };
  /**
   * Slowed + Reverb, Nightcore and friends: [speed] is the playback rate
   * (0.5–1.5, with the pitch following it unless [lockPitch]), [pitch] a
   * further shift in semitones (also the karaoke key), [reverb] 0–1.
   */
  vibe: { speed: number; pitch: number; reverb: number; lockPitch: boolean };
  /** Karaoke: the centred voice taken out ([vocal] 0–1), the bass kept. */
  karaoke: { on: boolean; vocal: number };
  /**
   * Headphone correction (AutoEQ), a layer of its own before the EQ: it
   * stays when presets change, and can be switched off or removed.
   */
  headphone: HeadphoneCorrection | null;
  limiter: { on: boolean; ceiling: number };
  /** Left/right balance, −1 (left) to +1 (right). */
  balance: number;
  /** Matches the processed loudness to the input's, so louder doesn't pass for better. */
  autoGain: boolean;
}

export interface HeadphoneCorrection {
  on: boolean;
  name: string;
  preampDb: number;
  bands: EqBand[];
}

export const BAND_COUNT = 12;
export const MIN_HZ = 20;
export const MAX_HZ = 20000;
export const MAX_GAIN = 24;
export const MIN_Q = 0.1;
export const MAX_Q = 18;
export const PREAMP_MIN = -24;
export const PREAMP_MAX = 12;

/** Ten bands an octave apart (as the earlier equaliser had), then a low-cut and a high-cut, off. */
export const DEFAULT_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export function defaultBands(): EqBand[] {
  const tens: EqBand[] = DEFAULT_FREQS.map((freq, i) => ({
    on: true,
    type: i === 0 ? 'lowshelf' : i === DEFAULT_FREQS.length - 1 ? 'highshelf' : 'peaking',
    freq,
    gain: 0,
    q: 1.41,
    slope: 12,
  }));
  return [
    ...tens,
    { on: false, type: 'highpass', freq: 25, gain: 0, q: 0.71, slope: 24 },
    { on: false, type: 'lowpass', freq: 19000, gain: 0, q: 0.71, slope: 24 },
  ];
}

export function defaultSettings(): MasteringSettings {
  return {
    enabled: false,
    preampDb: 0,
    autoPreamp: true,
    bands: defaultBands(),
    preset: 'flat',
    comp: {
      on: false,
      lowCross: 200,
      highCross: 4000,
      bands: [
        { threshold: -24, ratio: 3, attack: 0.02, release: 0.25, makeup: 2 },
        { threshold: -20, ratio: 2, attack: 0.01, release: 0.2, makeup: 1.5 },
        { threshold: -22, ratio: 2.5, attack: 0.005, release: 0.15, makeup: 1 },
      ],
    },
    exciter: { on: false, mode: 'tube', drive: 3, freq: 3000, mix: 0.2 },
    bass: { on: false, freq: 110, amount: 0.35 },
    stereo: { on: false, width: 1.2, monoBelow: 120 },
    crossfeed: { on: false, amount: 0.3 },
    surround: { on: false, amount: 0.3, size: 0.5, depth: 0.5 },
    eightD: { on: false, speed: 8, depth: 0.85 },
    vibe: { speed: 1, pitch: 0, reverb: 0, lockPitch: false },
    karaoke: { on: false, vocal: 0.9 },
    headphone: null,
    limiter: { on: true, ceiling: -0.3 },
    autoGain: false,
    balance: 0,
  };
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A band with every value inside its range, whatever a file or old version held. */
export function sanitizeBand(band: Partial<EqBand> | undefined, fallback: EqBand): EqBand {
  const types: FilterType[] = ['peaking', 'lowshelf', 'highshelf', 'highpass', 'lowpass', 'notch', 'tilt'];
  const slopes: Slope[] = [12, 24, 48];
  return {
    on: typeof band?.on === 'boolean' ? band.on : fallback.on,
    type: band?.type && types.includes(band.type) ? band.type : fallback.type,
    freq: clamp(Number(band?.freq) || fallback.freq, MIN_HZ, MAX_HZ),
    gain: clamp(Number.isFinite(Number(band?.gain)) ? Number(band?.gain) : fallback.gain, -MAX_GAIN, MAX_GAIN),
    q: clamp(Number(band?.q) || fallback.q, MIN_Q, MAX_Q),
    slope: band?.slope && slopes.includes(band.slope) ? band.slope : fallback.slope,
  };
}

/** Settings from anywhere (storage, a file), merged over the defaults and clamped. */
export function sanitizeSettings(raw: Partial<MasteringSettings> | null | undefined): MasteringSettings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const bands = base.bands.map((fallback, i) => sanitizeBand(raw.bands?.[i], fallback));
  const num = (v: unknown, f: number, min: number, max: number) => clamp(Number.isFinite(Number(v)) ? Number(v) : f, min, max);
  const cb = (b: Partial<CompressorBand> | undefined, f: CompressorBand): CompressorBand => ({
    threshold: num(b?.threshold, f.threshold, -60, 0),
    ratio: num(b?.ratio, f.ratio, 1, 20),
    attack: num(b?.attack, f.attack, 0.001, 0.5),
    release: num(b?.release, f.release, 0.01, 1),
    makeup: num(b?.makeup, f.makeup, -12, 12),
  });
  return {
    enabled: raw.enabled === true,
    preampDb: num(raw.preampDb, 0, PREAMP_MIN, PREAMP_MAX),
    autoPreamp: raw.autoPreamp !== false,
    bands,
    preset: typeof raw.preset === 'string' ? raw.preset : 'custom',
    comp: {
      on: raw.comp?.on === true,
      lowCross: num(raw.comp?.lowCross, base.comp.lowCross, 60, 600),
      highCross: num(raw.comp?.highCross, base.comp.highCross, 1500, 10000),
      bands: [
        cb(raw.comp?.bands?.[0], base.comp.bands[0]),
        cb(raw.comp?.bands?.[1], base.comp.bands[1]),
        cb(raw.comp?.bands?.[2], base.comp.bands[2]),
      ],
    },
    exciter: {
      on: raw.exciter?.on === true,
      mode: raw.exciter?.mode === 'tape' ? 'tape' : 'tube',
      drive: num(raw.exciter?.drive, base.exciter.drive, 1, 10),
      freq: num(raw.exciter?.freq, base.exciter.freq, 800, 12000),
      mix: num(raw.exciter?.mix, base.exciter.mix, 0, 1),
    },
    bass: { on: raw.bass?.on === true, freq: num(raw.bass?.freq, base.bass.freq, 40, 200), amount: num(raw.bass?.amount, base.bass.amount, 0, 1) },
    stereo: {
      on: raw.stereo?.on === true,
      width: num(raw.stereo?.width, base.stereo.width, 0, 2),
      monoBelow: num(raw.stereo?.monoBelow, base.stereo.monoBelow, 20, 300),
    },
    crossfeed: { on: raw.crossfeed?.on === true, amount: num(raw.crossfeed?.amount, base.crossfeed.amount, 0, 1) },
    surround: {
      on: raw.surround?.on === true,
      amount: num(raw.surround?.amount, base.surround.amount, 0, 1),
      size: num(raw.surround?.size, base.surround.size, 0, 1),
      depth: num(raw.surround?.depth, base.surround.depth, 0, 1),
    },
    eightD: {
      on: raw.eightD?.on === true,
      speed: num(raw.eightD?.speed, base.eightD.speed, 2, 30),
      depth: num(raw.eightD?.depth, base.eightD.depth, 0, 1),
    },
    vibe: {
      speed: num(raw.vibe?.speed, 1, 0.5, 1.5),
      pitch: num(raw.vibe?.pitch, 0, -12, 12),
      reverb: num(raw.vibe?.reverb, 0, 0, 1),
      lockPitch: raw.vibe?.lockPitch === true,
    },
    karaoke: { on: raw.karaoke?.on === true, vocal: num(raw.karaoke?.vocal, 0.9, 0, 1) },
    headphone:
      raw.headphone && typeof raw.headphone === 'object' && Array.isArray(raw.headphone.bands)
        ? {
            on: raw.headphone.on !== false,
            name: String(raw.headphone.name ?? '').slice(0, 80),
            preampDb: num(raw.headphone.preampDb, 0, PREAMP_MIN, PREAMP_MAX),
            bands: raw.headphone.bands
              .slice(0, BAND_COUNT)
              .map((b) => sanitizeBand(b, { on: true, type: 'peaking', freq: 1000, gain: 0, q: 1, slope: 12 })),
          }
        : null,
    limiter: { on: raw.limiter?.on !== false, ceiling: num(raw.limiter?.ceiling, base.limiter.ceiling, -6, 0) },
    autoGain: raw.autoGain === true,
    balance: num(raw.balance, 0, -1, 1),
  };
}
