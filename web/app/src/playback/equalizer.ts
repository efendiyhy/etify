import { create } from 'zustand';

/**
 * The web player's equaliser: ten peaking bands an octave apart (a low shelf
 * at the bottom, a high shelf at the top) and a preamp, applied after the
 * player's volume in the Web Audio graph (state/player.ts routes the decks
 * through it). Settings live in localStorage.
 */

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_MAX_DB = 12;
export const PREAMP_MIN_DB = -12;
export const PREAMP_MAX_DB = 6;
/** About an octave wide, so neighbouring bands blend without gaps or a hump. */
const BAND_Q = 1.41;

export interface EqPreset {
  id: string;
  name: { en: string; id: string };
  gains: number[];
}

const flat = EQ_BANDS.map(() => 0);

export const EQ_PRESETS: EqPreset[] = [
  { id: 'flat', name: { en: 'Flat', id: 'Datar' }, gains: flat },
  { id: 'bass-boost', name: { en: 'Bass Boost', id: 'Bass Kuat' }, gains: [6, 5, 4, 2.5, 1, 0, 0, 0, 0, 0] },
  { id: 'bass-reducer', name: { en: 'Bass Reducer', id: 'Bass Dikurangi' }, gains: [-6, -5, -4, -2.5, -1, 0, 0, 0, 0, 0] },
  { id: 'treble-boost', name: { en: 'Treble Boost', id: 'Treble Kuat' }, gains: [0, 0, 0, 0, 0, 1, 2.5, 4, 5, 6] },
  { id: 'treble-reducer', name: { en: 'Treble Reducer', id: 'Treble Dikurangi' }, gains: [0, 0, 0, 0, 0, -1, -2.5, -4, -5, -6] },
  { id: 'vocal', name: { en: 'Vocal Booster', id: 'Vokal Jelas' }, gains: [-2, -3, -3, 1, 3.5, 3.5, 3, 1.5, 0, -1.5] },
  { id: 'rock', name: { en: 'Rock', id: 'Rock' }, gains: [5, 4, 3, 1.5, -0.5, -1, 0.5, 2.5, 3.5, 4.5] },
  { id: 'pop', name: { en: 'Pop', id: 'Pop' }, gains: [-1.5, -1, 0, 2, 4, 4, 2, 0, -1, -1.5] },
  { id: 'jazz', name: { en: 'Jazz', id: 'Jazz' }, gains: [4, 3, 1.5, 2, -1.5, -1.5, 0, 1.5, 3, 3.5] },
  { id: 'classical', name: { en: 'Classical', id: 'Klasik' }, gains: [4.5, 3.5, 3, 2.5, -1.5, -1.5, 0, 2, 3, 3.5] },
  { id: 'electronic', name: { en: 'Electronic', id: 'Elektronik' }, gains: [4.5, 4, 1.5, 0, -2, 2, 1, 1.5, 4, 5] },
  { id: 'hip-hop', name: { en: 'Hip-Hop', id: 'Hip-Hop' }, gains: [5, 4, 1.5, 3, -1, -1, 1.5, -0.5, 2, 3] },
  { id: 'dance', name: { en: 'Dance', id: 'Dansa' }, gains: [3.5, 6.5, 5, 0, 2, 3.5, 5, 4, 3.5, 0] },
  { id: 'rnb', name: { en: 'R&B', id: 'R&B' }, gains: [2.5, 7, 5.5, 1.5, -2.5, -1.5, 2.5, 3, 3, 3.5] },
  { id: 'acoustic', name: { en: 'Acoustic', id: 'Akustik' }, gains: [4.5, 4.5, 3.5, 1, 2, 1.5, 3, 3.5, 3, 2] },
  { id: 'dangdut', name: { en: 'Dangdut', id: 'Dangdut' }, gains: [5, 4.5, 3, 0.5, -1, 1, 2.5, 3, 2, 1] },
  { id: 'loudness', name: { en: 'Loudness', id: 'Keras' }, gains: [6, 4, 0, 0, -2, 0, -1, -5, 5, 1] },
  { id: 'small-speakers', name: { en: 'Small Speakers', id: 'Speaker Kecil' }, gains: [5.5, 4.5, 4, 3, 2, 0, -2, -3, -4, -5] },
  { id: 'spoken-word', name: { en: 'Spoken Word', id: 'Suara Bicara' }, gains: [-3.5, -0.5, 0, 0.5, 3.5, 4.5, 4.5, 4, 2, 0] },
  { id: 'late-night', name: { en: 'Late Night', id: 'Larut Malam' }, gains: [4.5, 3, 2, -1, -2, -1.5, 0, 1, 3.5, 4] },
];

interface EqSettings {
  enabled: boolean;
  /** A preset's id, or 'custom' once a band is moved by hand. */
  preset: string;
  gains: number[];
  preampDb: number;
}

interface EqState extends EqSettings {
  setEnabled: (enabled: boolean) => void;
  setPreset: (id: string) => void;
  setGain: (band: number, db: number) => void;
  setPreamp: (db: number) => void;
  reset: () => void;
}

const EQ_KEY = 'etify:equalizer';
const DEFAULTS: EqSettings = { enabled: false, preset: 'flat', gains: flat, preampDb: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function load(): EqSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(EQ_KEY) ?? 'null') as Partial<EqSettings> | null;
    if (!raw) return DEFAULTS;
    const gains = Array.isArray(raw.gains) && raw.gains.length === EQ_BANDS.length ? raw.gains.map((g) => clamp(Number(g) || 0, -EQ_MAX_DB, EQ_MAX_DB)) : flat;
    return {
      enabled: raw.enabled === true,
      preset: typeof raw.preset === 'string' ? raw.preset : 'custom',
      gains,
      preampDb: clamp(Number(raw.preampDb) || 0, PREAMP_MIN_DB, PREAMP_MAX_DB),
    };
  } catch {
    return DEFAULTS;
  }
}

function save({ enabled, preset, gains, preampDb }: EqSettings) {
  try {
    localStorage.setItem(EQ_KEY, JSON.stringify({ enabled, preset, gains, preampDb }));
  } catch {
    // Private windows can refuse storage; the settings then last for this tab.
  }
}

export const useEqualizer = create<EqState>()((set, get) => {
  const update = (change: Partial<EqSettings>) => {
    set(change);
    save(get());
  };
  return {
    ...load(),
    setEnabled: (enabled) => update({ enabled }),
    setPreset: (id) => {
      const preset = EQ_PRESETS.find((p) => p.id === id);
      if (preset) update({ preset: id, gains: [...preset.gains], enabled: true });
    },
    setGain: (band, db) => {
      const gains = [...get().gains];
      gains[band] = clamp(Math.round(db * 2) / 2, -EQ_MAX_DB, EQ_MAX_DB);
      update({ gains, preset: 'custom', enabled: true });
    },
    setPreamp: (db) => update({ preampDb: clamp(Math.round(db * 2) / 2, PREAMP_MIN_DB, PREAMP_MAX_DB) }),
    reset: () => update({ preset: 'flat', gains: [...flat], preampDb: 0 }),
  };
});

/** The filters for one context: a low shelf, eight peaks and a high shelf. */
export function buildFilters(ctx: BaseAudioContext): BiquadFilterNode[] {
  return EQ_BANDS.map((frequency, i) => {
    const type: BiquadFilterType = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
    return new BiquadFilterNode(ctx, { type, frequency, Q: BAND_Q, gain: 0 });
  });
}

const dbToGain = (db: number) => 10 ** (db / 20);

/**
 * Puts the equaliser between `input` and `output` in a live graph and keeps it
 * in step with the settings. Off, every band is at 0 dB and the preamp at
 * unity, which passes the sound through unchanged.
 */
export function attachEqualizer(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
  const preamp = new GainNode(ctx, { gain: 1 });
  const filters = buildFilters(ctx);
  input.connect(preamp);
  filters.reduce<AudioNode>((previous, filter) => previous.connect(filter), preamp).connect(output);

  const applySettings = ({ enabled, gains, preampDb }: EqSettings) => {
    const now = ctx.currentTime;
    preamp.gain.setTargetAtTime(enabled ? dbToGain(preampDb) : 1, now, 0.02);
    filters.forEach((filter, i) => filter.gain.setTargetAtTime(enabled ? (gains[i] ?? 0) : 0, now, 0.02));
  };
  applySettings(useEqualizer.getState());
  useEqualizer.subscribe(applySettings);
}

/** "32", "1k", "16k": a band's label. */
export function bandLabel(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);
}
