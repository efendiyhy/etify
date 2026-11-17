import {
  BAND_COUNT,
  clamp,
  defaultBands,
  defaultSettings,
  MAX_GAIN,
  MAX_HZ,
  MAX_Q,
  MIN_HZ,
  MIN_Q,
  PREAMP_MAX,
  PREAMP_MIN,
  sanitizeSettings,
  type EqBand,
  type MasteringSettings,
} from './types';

/**
 * Built-in presets, and the files presets travel in: Etify's own JSON (the
 * whole chain) and Equalizer APO's text format (the EQ part, which is all APO
 * describes).
 */

export interface Preset {
  id: string;
  name: { en: string; id: string };
  /** The changes from the default chain; the EQ bands are given in full. */
  apply: (base: MasteringSettings) => MasteringSettings;
}

/** The ten octave bands with these gains, the cuts off: the earlier equaliser's presets. */
function tenBand(gains: number[]): (base: MasteringSettings) => MasteringSettings {
  return (base) => ({ ...base, bands: defaultBands().map((b, i) => (i < gains.length ? { ...b, gain: gains[i]! } : b)) });
}

function withBands(bands: Partial<EqBand>[], extra: Partial<MasteringSettings> = {}) {
  return (base: MasteringSettings): MasteringSettings => {
    const defaults = defaultBands();
    return {
      ...base,
      ...extra,
      bands: defaults.map((b, i) => (bands[i] ? { ...b, ...bands[i] } : { ...b, on: false })),
    };
  };
}

const LEGACY: [string, string, string, number[]][] = [
  ['bass-boost', 'Bass Boost', 'Bass Kuat', [6, 5, 4, 2.5, 1, 0, 0, 0, 0, 0]],
  ['bass-reducer', 'Bass Reducer', 'Bass Dikurangi', [-6, -5, -4, -2.5, -1, 0, 0, 0, 0, 0]],
  ['treble-boost', 'Treble Boost', 'Treble Kuat', [0, 0, 0, 0, 0, 1, 2.5, 4, 5, 6]],
  ['treble-reducer', 'Treble Reducer', 'Treble Dikurangi', [0, 0, 0, 0, 0, -1, -2.5, -4, -5, -6]],
  ['vocal', 'Vocal Booster', 'Vokal Jelas', [-2, -3, -3, 1, 3.5, 3.5, 3, 1.5, 0, -1.5]],
  ['rock', 'Rock', 'Rock', [5, 4, 3, 1.5, -0.5, -1, 0.5, 2.5, 3.5, 4.5]],
  ['pop', 'Pop', 'Pop', [-1.5, -1, 0, 2, 4, 4, 2, 0, -1, -1.5]],
  ['jazz', 'Jazz', 'Jazz', [4, 3, 1.5, 2, -1.5, -1.5, 0, 1.5, 3, 3.5]],
  ['classical', 'Classical', 'Klasik', [4.5, 3.5, 3, 2.5, -1.5, -1.5, 0, 2, 3, 3.5]],
  ['electronic', 'Electronic', 'Elektronik', [4.5, 4, 1.5, 0, -2, 2, 1, 1.5, 4, 5]],
  ['hip-hop', 'Hip-Hop', 'Hip-Hop', [5, 4, 1.5, 3, -1, -1, 1.5, -0.5, 2, 3]],
  ['dance', 'Dance', 'Dansa', [3.5, 6.5, 5, 0, 2, 3.5, 5, 4, 3.5, 0]],
  ['rnb', 'R&B', 'R&B', [2.5, 7, 5.5, 1.5, -2.5, -1.5, 2.5, 3, 3, 3.5]],
  ['acoustic-classic', 'Acoustic (10-band)', 'Akustik (10 band)', [4.5, 4.5, 3.5, 1, 2, 1.5, 3, 3.5, 3, 2]],
  ['dangdut', 'Dangdut', 'Dangdut', [5, 4.5, 3, 0.5, -1, 1, 2.5, 3, 2, 1]],
  ['loudness', 'Loudness', 'Keras', [6, 4, 0, 0, -2, 0, -1, -5, 5, 1]],
  ['small-speakers', 'Small Speakers', 'Speaker Kecil', [5.5, 4.5, 4, 3, 2, 0, -2, -3, -4, -5]],
  ['spoken-word', 'Spoken Word', 'Suara Bicara', [-3.5, -0.5, 0, 0.5, 3.5, 4.5, 4.5, 4, 2, 0]],
  ['late-night', 'Late Night', 'Larut Malam', [4.5, 3, 2, -1, -2, -1.5, 0, 1, 3.5, 4]],
];

export const PRESETS: Preset[] = [
  { id: 'flat', name: { en: 'Flat', id: 'Datar' }, apply: tenBand([]) },
  {
    id: 'cinema-surround',
    name: { en: 'Cinema Surround', id: 'Surround Bioskop' },
    apply: (base) => {
      const next = withBands([
        { type: 'lowshelf', freq: 80, gain: 4 },
        { type: 'peaking', freq: 2500, gain: 1.5, q: 1 },
        { type: 'highshelf', freq: 10000, gain: 2 },
      ])(base);
      return {
        ...next,
        surround: { on: true, amount: 0.45, size: 0.7, depth: 0.6 },
        stereo: { ...base.stereo, on: true, width: 1.3, monoBelow: 120 },
        bass: { ...base.bass, on: true, freq: 90, amount: 0.3 },
      };
    },
  },
  {
    id: 'live-concert',
    name: { en: 'Live Concert', id: 'Konser Live' },
    apply: (base) => {
      const next = withBands([
        { type: 'lowshelf', freq: 100, gain: 3 },
        { type: 'peaking', freq: 400, gain: -1.5, q: 1 },
        { type: 'highshelf', freq: 8000, gain: 2.5 },
      ])(base);
      return { ...next, surround: { on: true, amount: 0.6, size: 0.95, depth: 0.4 } };
    },
  },
  {
    id: 'audiophile-warm',
    name: { en: 'Audiophile Warm', id: 'Audiophile Hangat' },
    apply: (base) => {
      const next = withBands([
        { type: 'lowshelf', freq: 105, gain: 2.5 },
        { type: 'peaking', freq: 250, gain: 1, q: 0.8 },
        { type: 'peaking', freq: 3200, gain: -1.2, q: 1.2 },
        { type: 'highshelf', freq: 9000, gain: -1 },
        { type: 'highpass', freq: 22, slope: 24, on: true },
      ])(base);
      return { ...next, exciter: { ...base.exciter, on: true, mode: 'tube', drive: 2.5, freq: 2500, mix: 0.12 } };
    },
  },
  {
    id: 'vocal-clarity',
    name: { en: 'Vocal Clarity', id: 'Vokal Jernih' },
    apply: (base) => {
      const next = withBands([
        { type: 'highpass', freq: 80, slope: 24, on: true },
        { type: 'peaking', freq: 250, gain: -2, q: 1 },
        { type: 'peaking', freq: 1800, gain: 2, q: 1 },
        { type: 'peaking', freq: 3500, gain: 3, q: 1.2 },
        { type: 'peaking', freq: 6500, gain: -1.5, q: 3 },
        { type: 'highshelf', freq: 11000, gain: 1.5 },
      ])(base);
      return { ...next, comp: { ...base.comp, on: true } };
    },
  },
  {
    id: 'deep-bass',
    name: { en: 'Deep Bass', id: 'Bass Dalam' },
    apply: (base) => {
      const next = withBands([
        { type: 'highpass', freq: 25, slope: 24, on: true },
        { type: 'peaking', freq: 45, gain: 6, q: 0.9 },
        { type: 'lowshelf', freq: 90, gain: 3 },
        { type: 'peaking', freq: 300, gain: -2, q: 1 },
      ])(base);
      return { ...next, bass: { ...base.bass, on: true, freq: 90, amount: 0.45 }, stereo: { ...base.stereo, on: true, width: 1, monoBelow: 120 } };
    },
  },
  {
    id: 'acoustic',
    name: { en: 'Acoustic', id: 'Akustik' },
    apply: withBands([
      { type: 'highpass', freq: 40, slope: 12, q: 0.71, on: true },
      { type: 'peaking', freq: 180, gain: 1.5, q: 0.9 },
      { type: 'peaking', freq: 450, gain: -1.5, q: 1.2 },
      { type: 'peaking', freq: 2800, gain: 2, q: 1 },
      { type: 'highshelf', freq: 10000, gain: 2 },
    ]),
  },
  {
    id: 'studio-master',
    name: { en: 'Studio Master', id: 'Studio Master' },
    apply: (base) => {
      const next = withBands([
        { type: 'highpass', freq: 28, slope: 24, on: true },
        { type: 'lowshelf', freq: 80, gain: 1.5 },
        { type: 'peaking', freq: 350, gain: -1, q: 1 },
        { type: 'peaking', freq: 2500, gain: 0.8, q: 0.9 },
        { type: 'highshelf', freq: 12000, gain: 1.5 },
      ])(base);
      return {
        ...next,
        comp: { ...base.comp, on: true },
        exciter: { ...base.exciter, on: true, mode: 'tape', drive: 2, freq: 4000, mix: 0.1 },
        stereo: { ...base.stereo, on: true, width: 1.15, monoBelow: 120 },
        limiter: { on: true, ceiling: -0.3 },
      };
    },
  },
  ...LEGACY.map(([id, en, idName, gains]): Preset => ({ id, name: { en, id: idName }, apply: tenBand(gains) })),
];

/** A built-in preset over the current settings: it keeps the chain on and the preset's name. */
export function applyPreset(current: MasteringSettings, id: string): MasteringSettings | null {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return null;
  const base = { ...defaultSettings(), enabled: true, autoPreamp: current.autoPreamp, autoGain: current.autoGain };
  return { ...preset.apply(base), preset: id, enabled: true };
}

// ---- Files ---------------------------------------------------------------------------

export function toJson(settings: MasteringSettings, name: string): string {
  return JSON.stringify({ app: 'Etify', kind: 'mastering-preset', version: 1, name, settings }, null, 2);
}

export function fromJson(text: string): { name: string; settings: MasteringSettings } {
  const data = JSON.parse(text) as { name?: unknown; settings?: Partial<MasteringSettings> };
  if (!data || typeof data !== 'object' || !data.settings) throw new Error('Not an Etify preset file');
  return { name: typeof data.name === 'string' ? data.name : 'Imported', settings: sanitizeSettings(data.settings) };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Equalizer APO's config text for the EQ: Preamp, then one Filter line per biquad stage. */
export function toApo(settings: MasteringSettings, preampDb: number): string {
  const lines = [`# Etify equalizer, exported for Equalizer APO`, `Preamp: ${fmt(preampDb)} dB`];
  let n = 1;
  const line = (body: string) => lines.push(`Filter ${n++}: ON ${body}`);
  for (const b of settings.bands) {
    if (!b.on) continue;
    switch (b.type) {
      case 'peaking':
        line(`PK Fc ${fmt(b.freq)} Hz Gain ${fmt(b.gain)} dB Q ${fmt(b.q)}`);
        break;
      case 'lowshelf':
        line(`LS Fc ${fmt(b.freq)} Hz Gain ${fmt(b.gain)} dB`);
        break;
      case 'highshelf':
        line(`HS Fc ${fmt(b.freq)} Hz Gain ${fmt(b.gain)} dB`);
        break;
      case 'tilt':
        line(`LS Fc ${fmt(b.freq)} Hz Gain ${fmt(-b.gain / 2)} dB`);
        line(`HS Fc ${fmt(b.freq)} Hz Gain ${fmt(b.gain / 2)} dB`);
        break;
      case 'notch':
        line(`NO Fc ${fmt(b.freq)} Hz Q ${fmt(b.q)}`);
        break;
      case 'highpass':
      case 'lowpass': {
        const kind = b.type === 'highpass' ? 'HPQ' : 'LPQ';
        const qs = b.slope === 12 ? [b.q] : b.slope === 24 ? [0.5412, 1.3066] : [0.5098, 0.6013, 0.9, 2.5629];
        for (const q of qs) line(`${kind} Fc ${fmt(b.freq)} Hz Q ${fmt(q)}`);
        break;
      }
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Reads an Equalizer APO config (Preamp and Filter lines; PK, LS/LSC, HS/HSC,
 * HP/HPQ, LP/LPQ, NO). Up to twelve filters become the twelve bands; the
 * other modules keep their current settings.
 */
export function fromApo(text: string, current: MasteringSettings): MasteringSettings {
  let preamp = 0;
  const bands: EqBand[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const pre = /^Preamp:\s*(-?[\d.]+)\s*dB/i.exec(line);
    if (pre) {
      preamp = Number(pre[1]);
      continue;
    }
    const m = /^Filter\s*\d*\s*:\s*ON\s+(\w+)\s+Fc\s+([\d.]+)\s*Hz(?:\s+Gain\s+(-?[\d.]+)\s*dB)?(?:\s+Q\s+([\d.]+))?/i.exec(line);
    if (!m || bands.length >= BAND_COUNT) continue;
    const kind = m[1]!.toUpperCase();
    const freq = clamp(Number(m[2]), MIN_HZ, MAX_HZ);
    const gain = clamp(Number(m[3] ?? 0), -MAX_GAIN, MAX_GAIN);
    const q = clamp(Number(m[4] ?? 0.71), MIN_Q, MAX_Q);
    const type =
      kind === 'PK' || kind === 'PEQ'
        ? 'peaking'
        : kind.startsWith('LS')
          ? 'lowshelf'
          : kind.startsWith('HS')
            ? 'highshelf'
            : kind.startsWith('HP')
              ? 'highpass'
              : kind.startsWith('LP')
                ? 'lowpass'
                : kind === 'NO'
                  ? 'notch'
                  : null;
    if (!type) continue;
    bands.push({ on: true, type, freq, gain, q: type === 'peaking' || type === 'notch' || kind.endsWith('Q') ? q : 0.71, slope: 12 });
  }
  if (bands.length === 0) throw new Error('No filters found');
  const defaults = defaultBands();
  return {
    ...current,
    enabled: true,
    preset: 'custom',
    autoPreamp: false,
    preampDb: clamp(preamp, PREAMP_MIN, PREAMP_MAX),
    bands: defaults.map((b, i) => bands[i] ?? { ...b, on: false }),
  };
}
