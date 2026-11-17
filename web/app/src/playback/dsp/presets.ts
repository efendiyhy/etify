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

export type PresetGroup = 'basic' | 'audiophile' | 'genre' | 'dj' | 'nusantara' | 'space';

/** The groups in the preset picker, in order, each with its badge. */
export const PRESET_GROUPS: { id: PresetGroup; icon: string; name: { en: string; id: string }; detail: { en: string; id: string } }[] = [
  { id: 'basic', icon: '🎚️', name: { en: 'Basics', id: 'Dasar' }, detail: { en: 'Flat, bass and treble, small speakers, late night', id: 'Datar, bass dan treble, speaker kecil, larut malam' } },
  { id: 'audiophile', icon: '🎧', name: { en: 'Audiophile & studio', id: 'Audiophile & studio' }, detail: { en: 'Clean, detailed, mastered', id: 'Bersih, detail, rapi seperti hasil mastering' } },
  { id: 'genre', icon: '🎸', name: { en: 'Genres', id: 'Genre' }, detail: { en: 'Rock, pop, jazz, electronic and more', id: 'Rock, pop, jazz, elektronik, dan lainnya' } },
  { id: 'dj', icon: '🔊', name: { en: 'DJ & Sound Horeg', id: 'DJ & Sound Horeg' }, detail: { en: 'Thumping bass, loud mids, battle-ready', id: 'Bass nendang, middle cetar, siap adu sound' } },
  { id: 'nusantara', icon: '🪘', name: { en: 'Nusantara', id: 'Kearifan Nusantara' }, detail: { en: 'Dangdut, gamelan, keroncong and the sounds of Indonesia', id: 'Dangdut, gamelan, keroncong, dan suara Indonesia' } },
  { id: 'space', icon: '🌌', name: { en: 'Space & effects', id: 'Ruang & efek' }, detail: { en: 'Cinema, concert, 8D', id: 'Bioskop, konser, 8D' } },
];

export interface Preset {
  id: string;
  name: { en: string; id: string };
  group?: PresetGroup;
  /** One line on what it sounds like. */
  desc?: { en: string; id: string };
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


type P = Partial<EqBand>;
const ls = (freq: number, gain: number): P => ({ type: 'lowshelf', freq, gain });
const hs = (freq: number, gain: number): P => ({ type: 'highshelf', freq, gain });
const pk = (freq: number, gain: number, q = 1): P => ({ type: 'peaking', freq, gain, q });
const hpf = (freq: number, slope: 12 | 24 | 48 = 24): P => ({ type: 'highpass', freq, slope, q: 0.71, on: true });

/** A preset from bands and module changes over the base chain. */
function make(
  id: string,
  group: PresetGroup,
  en: string,
  idName: string,
  desc: [string, string],
  bands: P[],
  modules: (base: MasteringSettings) => Partial<MasteringSettings> = () => ({}),
): Preset {
  return {
    id,
    group,
    name: { en, id: idName },
    desc: { en: desc[0], id: desc[1] },
    apply: (base) => ({ ...withBands(bands)(base), ...modules(base) }),
  };
}

const punchy = (base: MasteringSettings, amount = 0.5, freq = 95): Partial<MasteringSettings> => ({
  bass: { ...base.bass, on: true, freq, amount },
  comp: { ...base.comp, on: true },
  limiter: { on: true, ceiling: -0.3 },
});
const room = (base: MasteringSettings, amount: number, size: number): Partial<MasteringSettings> => ({
  surround: { ...base.surround, on: true, amount, size, depth: 0.25 },
});

/** DJ sets and the East Javanese "sound horeg" style: a wall of sub, horn-loud mids, sharp highs. */
const DJ: Preset[] = [
  make('horeg-full', 'dj', 'Sound Horeg Full Bass', 'Sound Horeg Full Bass', ['Huge sub and kick, as from a truck of subwoofers', 'Sub dan kick besar, seperti truk penuh subwoofer'],
    [hpf(25), ls(55, 9), pk(85, 5, 1.1), pk(280, -3, 1), pk(2200, 2, 1), hs(9000, 3)],
    (b) => ({ ...punchy(b, 0.6), stereo: { ...b.stereo, on: true, width: 1.1, monoBelow: 140 } })),
  make('horeg-middle', 'dj', 'DJ Middle Horeg', 'DJ Middle Horeg', ['Loud, cutting mids like horn speakers, with a solid kick', 'Middle keras dan cetar seperti speaker horn, kick tetap padat'],
    [hpf(30), ls(60, 6), pk(120, 3, 1), pk(400, -2, 1.2), pk(1200, 5, 0.9), pk(2500, 4, 1.2), hs(8000, 2)],
    (b) => ({ ...punchy(b, 0.4), exciter: { ...b.exciter, on: true, mode: 'tape', drive: 3, freq: 2000, mix: 0.25 } })),
  make('horeg-battle', 'dj', 'Battle Sound (Cek Sound)', 'Adu Sound (Cek Sound)', ['Everything up for a sound battle: sub, punch, horn and sizzle', 'Semua digeber untuk adu sound: sub, pukulan, horn, dan desis'],
    [hpf(25), ls(45, 10), pk(90, 6, 1), pk(350, -3, 1), pk(3000, 4, 1), hs(10000, 5)],
    (b) => ({ ...punchy(b, 0.7, 90), exciter: { ...b.exciter, on: true, mode: 'tube', drive: 4, freq: 3000, mix: 0.2 } })),
  make('jedag-jedug', 'dj', 'DJ Jedag Jedug', 'DJ Jedag Jedug', ['Tight, bouncy kick and crisp claps for TikTok remixes', 'Kick memantul rapat dan clap renyah untuk remix TikTok'],
    [hpf(30), pk(60, 7, 1.2), pk(150, 2, 1), pk(500, -3, 1), pk(4000, 3, 1), hs(12000, 3)],
    (b) => ({ ...punchy(b, 0.45, 80), stereo: { ...b.stereo, on: true, width: 1.3, monoBelow: 120 } })),
  make('dj-slow-bass', 'dj', 'DJ Slow Bass Remix', 'DJ Remix Slow Bass', ['Round, rolling bass for slow remixes, soft highs', 'Bass bulat bergulung untuk remix pelan, treble lembut'],
    [hpf(25), ls(70, 7), pk(250, -2, 1), pk(3000, 1, 1), hs(8000, -1)],
    (b) => ({ ...punchy(b, 0.5, 100), ...room(b, 0.25, 0.5) })),
  make('funkot', 'dj', 'Funkot', 'Funkot', ['Fast, bright funky kota: driving kick and sharp hats', 'Funky kota cepat dan terang: kick menghentak, hi-hat tajam'],
    [hpf(30), ls(55, 6), pk(100, 2, 1), pk(800, -2, 1), pk(3500, 4, 1), hs(11000, 4)],
    (b) => ({ ...punchy(b, 0.4) })),
  make('breakbeat', 'dj', 'Breakbeat Nusantara', 'Breakbeat Nusantara', ['Punchy breaks with clear vocals', 'Break yang nendang dengan vokal tetap jelas'],
    [hpf(30), ls(70, 5), pk(200, 1, 1), pk(2000, 3, 1), hs(10000, 3)],
    (b) => ({ ...punchy(b, 0.35), stereo: { ...b.stereo, on: true, width: 1.2, monoBelow: 120 } })),
  make('dugem', 'dj', 'Dugem Club', 'Dugem Club', ['Club system: deep sub, wide, a little room', 'Sound club: sub dalam, lebar, sedikit gema ruangan'],
    [hpf(25), ls(50, 6), pk(350, -2, 1), pk(6000, 2, 1), hs(12000, 3)],
    (b) => ({ ...punchy(b, 0.45), stereo: { ...b.stereo, on: true, width: 1.25, monoBelow: 120 }, ...room(b, 0.3, 0.4) })),
];

/** Indonesia's own music: each shaped round its instruments. */
const NUSANTARA: Preset[] = [
  make('dangdut-koplo', 'nusantara', 'Dangdut Koplo', 'Dangdut Koplo', ['The kendang’s "dhut" up front, the suling bright', 'Suara "dhut" kendang di depan, suling terang'],
    [hpf(30), pk(90, 5, 1.1), pk(200, 2, 1), pk(500, -1.5, 1), pk(2500, 3, 1), hs(9000, 2)],
    (b) => ({ ...punchy(b, 0.35, 90) })),
  make('dangdut-pantura', 'nusantara', 'Dangdut Pantura', 'Dangdut Pantura', ['Loud and lively, for the north-coast stage', 'Keras dan meriah, ala panggung pantura'],
    [hpf(30), ls(70, 6), pk(400, -1.5, 1), pk(2000, 3, 1), hs(9000, 3)],
    (b) => ({ ...punchy(b, 0.4) })),
  make('campursari', 'nusantara', 'Campursari', 'Campursari', ['Gamelan and keyboard together, the voice warm', 'Gamelan dan keyboard berpadu, vokal hangat'],
    [hpf(35), ls(100, 3), pk(400, 1, 1), pk(1500, 2, 1), pk(4000, 2, 1), hs(10000, 1)],
    (b) => ({ ...room(b, 0.25, 0.5) })),
  make('keroncong', 'nusantara', 'Keroncong', 'Keroncong', ['The cak-cuk ukulele and the cello’s pluck, gentle and clear', 'Petikan cak-cuk dan cello, lembut dan jernih'],
    [hpf(40, 12), pk(250, 1.5, 1), pk(1000, 1, 1), pk(3000, 2, 1), hs(8000, 1.5)],
    (b) => ({ exciter: { ...b.exciter, on: true, mode: 'tube', drive: 2, freq: 3000, mix: 0.12 } })),
  make('gamelan-jawa', 'nusantara', 'Gamelan Jawa', 'Gamelan Jawa', ['The gong’s bloom and the saron’s shimmer, in a pendopo', 'Dengung gong dan kilau saron, seperti di pendopo'],
    [hpf(30), ls(80, 2), pk(300, 1, 1), pk(900, 2, 1), pk(2200, 3, 1.2), hs(7000, 2)],
    (b) => ({ ...room(b, 0.4, 0.8) })),
  make('gamelan-bali', 'nusantara', 'Gamelan Bali', 'Gamelan Bali', ['Bright, fast metallophones, wide', 'Gangsa yang terang dan cepat, lebar'],
    [hpf(40), pk(120, 2, 1), pk(1800, 3, 1), pk(4000, 4, 1.2), hs(9000, 3)],
    (b) => ({ stereo: { ...b.stereo, on: true, width: 1.3, monoBelow: 120 }, ...room(b, 0.25, 0.5) })),
  make('jaipong', 'nusantara', 'Jaipong & Degung Sunda', 'Jaipong & Degung Sunda', ['Kendang Sunda with bite, the rebab and suling sweet', 'Kendang Sunda menggigit, rebab dan suling manis'],
    [hpf(35), pk(70, 4, 1), pk(180, 3, 1.1), pk(2500, 3, 1), hs(8000, 2)],
    (b) => ({ ...room(b, 0.2, 0.4) })),
  make('tarling', 'nusantara', 'Tarling Cirebonan', 'Tarling Cirebonan', ['Guitar and suling to the front', 'Gitar dan suling dibawa ke depan'],
    [hpf(40), pk(150, 2, 1), pk(700, 1, 1), pk(2000, 3, 1), pk(5000, 2, 1)]),
  make('pop-melayu', 'nusantara', 'Pop Melayu', 'Pop Melayu', ['A soft low end and a sweet, present voice', 'Bass empuk dan vokal manis yang menonjol'],
    [hpf(30), ls(90, 3), pk(250, -1, 1), pk(2000, 2.5, 1), hs(9000, 2)]),
  make('qasidah', 'nusantara', 'Qasidah & Sholawat', 'Qasidah & Sholawat', ['Rebana warm, voices clear, a little hall', 'Rebana hangat, vokal jernih, sedikit gema'],
    [hpf(50), pk(200, 1, 1), pk(1500, 2, 1), pk(3500, 2, 1), hs(10000, 1)],
    (b) => ({ ...room(b, 0.3, 0.6) })),
  make('angklung', 'nusantara', 'Angklung', 'Angklung', ['Bamboo rattle, airy and bright', 'Getar bambu yang lapang dan terang'],
    [hpf(80), pk(800, 2, 1), pk(2000, 3, 1), pk(5000, 3, 1), hs(10000, 2)],
    (b) => ({ ...room(b, 0.3, 0.6) })),
  make('sasando', 'nusantara', 'Sasando NTT', 'Sasando NTT', ['Harp-like strings from Rote, sparkling', 'Petikan dawai khas Rote yang berkilau'],
    [hpf(50), pk(300, 1, 1), pk(1200, 2, 1), pk(3000, 3, 1), hs(9000, 3)],
    (b) => ({ ...room(b, 0.35, 0.6) })),
  make('batak', 'nusantara', 'Lagu Batak', 'Lagu Batak', ['Big harmonies and a full voice', 'Harmoni vokal yang megah dan penuh'],
    [hpf(35), ls(100, 2), pk(400, 1, 1), pk(2500, 3, 1), hs(9000, 2)],
    (b) => ({ stereo: { ...b.stereo, on: true, width: 1.2, monoBelow: 120 } })),
  make('minang', 'nusantara', 'Saluang Minang', 'Saluang Minang', ['The bamboo flute breathy and near', 'Tiupan saluang yang dekat dan bernapas'],
    [hpf(100), pk(600, 1, 1), pk(1800, 3, 1), hs(7000, 2)],
    (b) => ({ ...room(b, 0.3, 0.5) })),
  make('reog', 'nusantara', 'Reog Ponorogo', 'Reog Ponorogo', ['Kendang and the slompret trumpet loud and proud', 'Kendang dan slompret yang lantang'],
    [hpf(35), pk(80, 4, 1), pk(1000, 2, 1), pk(3000, 4, 1), hs(9000, 2)],
    (b) => ({ ...punchy(b, 0.3) })),
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
    id: '8d-audio',
    name: { en: '8D Audio', id: 'Audio 8D' },
    apply: (base) => {
      const next = withBands([
        { type: 'lowshelf', freq: 90, gain: 3 },
        { type: 'highshelf', freq: 9000, gain: 1.5 },
      ])(base);
      return {
        ...next,
        eightD: { on: true, speed: 8, depth: 0.9 },
        surround: { on: true, amount: 0.35, size: 0.6, depth: 0.2 },
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
  ...DJ,
  ...NUSANTARA,
];

/** The group of the earlier presets, which don't name their own. */
const GROUP_OF: Record<string, PresetGroup> = {
  flat: 'basic',
  'bass-boost': 'basic',
  'bass-reducer': 'basic',
  'treble-boost': 'basic',
  'treble-reducer': 'basic',
  'vocal': 'basic',
  loudness: 'basic',
  'small-speakers': 'basic',
  'spoken-word': 'basic',
  'late-night': 'basic',
  'audiophile-warm': 'audiophile',
  'vocal-clarity': 'audiophile',
  'deep-bass': 'audiophile',
  acoustic: 'audiophile',
  'studio-master': 'audiophile',
  dangdut: 'nusantara',
  'cinema-surround': 'space',
  'live-concert': 'space',
  '8d-audio': 'space',
};

/** Lines for the presets that came before descriptions. */
const DESC: Record<string, [string, string]> = {
  flat: ['No change: the sound as recorded', 'Tanpa perubahan: suara apa adanya'],
  'bass-boost': ['More low end', 'Bass lebih tebal'],
  'bass-reducer': ['Less low end, for boomy speakers', 'Bass dikurangi, untuk speaker yang terlalu dengung'],
  'treble-boost': ['More sparkle on top', 'Treble lebih berkilau'],
  'treble-reducer': ['Softer highs, less harsh', 'Treble lebih lembut, tidak menusuk'],
  vocal: ['Voices forward', 'Vokal lebih maju'],
  loudness: ['Bass and treble lifted, for low volume', 'Bass dan treble dinaikkan, untuk volume kecil'],
  'small-speakers': ['Fuller sound from laptops and phones', 'Suara lebih penuh dari laptop dan HP'],
  'spoken-word': ['Podcasts and talk, clear', 'Podcast dan obrolan, jernih'],
  'late-night': ['Gentle and even, for quiet hours', 'Lembut dan rata, untuk malam hari'],
  'audiophile-warm': ['Warm and smooth, a touch of tube', 'Hangat dan halus, sentuhan tabung'],
  'vocal-clarity': ['Clean, intelligible vocals', 'Vokal bersih dan jelas'],
  'deep-bass': ['Sub-bass you can feel, mud cut', 'Sub-bass terasa, dengung dibuang'],
  acoustic: ['Natural guitars and voices', 'Gitar dan vokal alami'],
  'studio-master': ['Polished like a finished master', 'Rapi seperti hasil mastering'],
  rock: ['Guitars and drums with punch', 'Gitar dan drum yang bertenaga'],
  pop: ['Bright, present mids', 'Middle terang dan menonjol'],
  jazz: ['Warm low end, airy top', 'Bawah hangat, atas lapang'],
  classical: ['Wide and natural, for orchestras', 'Lebar dan alami, untuk orkestra'],
  electronic: ['Deep kick and crisp synths', 'Kick dalam dan synth renyah'],
  'hip-hop': ['Heavy 808s and clear vocals', '808 berat dan vokal jelas'],
  dance: ['Club bass and energy', 'Bass dan energi klub'],
  rnb: ['Smooth, round bass', 'Bass bulat dan halus'],
  'acoustic-classic': ['The earlier 10-band acoustic', 'Akustik 10 band versi lama'],
  dangdut: ['The classic: kendang and suling', 'Klasik: kendang dan suling'],
  'cinema-surround': ['Big, wide, film-like', 'Besar, lebar, seperti bioskop'],
  'live-concert': ['A hall around the stage', 'Gema aula di sekitar panggung'],
  '8d-audio': ['The music circles your head', 'Musik berputar mengelilingi kepala'],
};

for (const preset of PRESETS) {
  const line = DESC[preset.id];
  if (!preset.desc && line) preset.desc = { en: line[0], id: line[1] };
}

/** A preset's group: its own, else the table above, else Genres. */
export function presetGroup(preset: Preset): PresetGroup {
  return preset.group ?? GROUP_OF[preset.id] ?? 'genre';
}

/** A built-in preset over the current settings: it keeps the chain on and the preset's name. */
export function applyPreset(current: MasteringSettings, id: string): MasteringSettings | null {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return null;
  const base = { ...defaultSettings(), enabled: true, autoPreamp: current.autoPreamp, autoGain: current.autoGain, balance: current.balance };
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
