import { create } from 'zustand';
import { greetingKey } from '@/lib/greeting';
import { t, useLanguage } from '@/lib/i18n';
import { nickname } from '@/state/profile';
import { setOutputScale, usePlayer } from '@/state/player';

/**
 * The AI DJ: between songs a radio voice introduces the next one, with the
 * music turned down under it. The browser's own speech (Web Speech API), so
 * it costs nothing and needs no server; the voice is whatever the system has
 * for the app's language.
 */

export type DjEvery = 1 | 2 | 3;

/** What the listener sets: saved in this browser. */
export interface DjSettings {
  enabled: boolean;
  /** Talk before every song, every second, or every third. */
  every: DjEvery;
  /** The system voice's voiceURI, or null for the first one in the app's language. */
  voice: string | null;
  rate: number;
  pitch: number;
  /** The music's level while the DJ talks, 0–1. */
  duck: number;
  /** The listener's own lines; {title} {artist} {name} {greeting} {time} are filled in. */
  lines: string[];
  /** Only the listener's lines (when there are some), or theirs mixed with the built-in ones. */
  onlyMine: boolean;
}

interface DjState extends DjSettings {
  speaking: boolean;
  setEnabled: (on: boolean) => void;
  setEvery: (every: DjEvery) => void;
  set: (patch: Partial<DjSettings>) => void;
  /** Says something now about the song playing (the preview button). */
  speakNow: () => void;
  /** Says [text] now, placeholders filled in. */
  say: (text: string) => void;
}

const KEY = 'etify:dj';
const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

const DEFAULTS: DjSettings = { enabled: false, every: 1, voice: null, rate: 1.03, pitch: 1, duck: 0.28, lines: [], onlyMine: false };

function load(): DjSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<DjSettings> | null;
    if (!raw) return DEFAULTS;
    return {
      enabled: raw.enabled === true,
      every: raw.every === 2 || raw.every === 3 ? raw.every : 1,
      voice: typeof raw.voice === 'string' ? raw.voice : null,
      rate: clamp(raw.rate, 0.5, 1.8, DEFAULTS.rate),
      pitch: clamp(raw.pitch, 0, 2, DEFAULTS.pitch),
      duck: clamp(raw.duck, 0, 1, DEFAULTS.duck),
      lines: Array.isArray(raw.lines) ? raw.lines.filter((l) => typeof l === 'string' && l.trim()).slice(0, 50).map((l) => l.slice(0, 300)) : [],
      onlyMine: raw.onlyMine === true,
    };
  } catch {
    return DEFAULTS;
  }
}

function save(state: DjSettings) {
  try {
    const { enabled, every, voice, rate, pitch, duck, lines, onlyMine } = state;
    localStorage.setItem(KEY, JSON.stringify({ enabled, every, voice, rate, pitch, duck, lines, onlyMine }));
  } catch {
    // Storage refused: the choice lasts for this tab.
  }
}

/** The system's voices, the app's language first; they load late in some browsers. */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!djSupported()) return [];
  const code = useLanguage.getState().lang;
  return [...window.speechSynthesis.getVoices()].sort(
    (a, b) => Number(!a.lang.toLowerCase().startsWith(code)) - Number(!b.lang.toLowerCase().startsWith(code)) || a.name.localeCompare(b.name),
  );
}

export const djSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

const LINES: Record<'en' | 'id', ((v: Vars) => string)[]> = {
  en: [
    (v) => `Up next, ${v.title}, by ${v.artist}.`,
    (v) => `${v.greeting}${v.name ? `, ${v.name}` : ''}. Here's ${v.title} from ${v.artist}.`,
    (v) => `You're listening to Etify. This one is ${v.title}, ${v.artist}.`,
    (v) => `Let's keep it going with ${v.artist}, and ${v.title}.`,
    (v) => `${v.name ? `${v.name}, this` : 'This'} one's a good one. ${v.title}, by ${v.artist}.`,
    (v) => `It's ${v.time}. Time for ${v.title}, from ${v.artist}.`,
  ],
  id: [
    (v) => `Selanjutnya, ${v.title}, dari ${v.artist}.`,
    (v) => `${v.greeting}${v.name ? `, ${v.name}` : ''}. Ini dia ${v.title}, dibawakan oleh ${v.artist}.`,
    (v) => `Kamu sedang mendengarkan Etify. Lagu berikutnya, ${v.title}, dari ${v.artist}.`,
    (v) => `Kita lanjut dengan ${v.artist}, ${v.title}.`,
    (v) => `${v.name ? `${v.name}, lagu` : 'Lagu'} ini pas banget buat kamu. ${v.title}, dari ${v.artist}.`,
    (v) => `Sekarang jam ${v.time}. Saatnya ${v.title}, dari ${v.artist}.`,
  ],
};

interface Vars {
  title: string;
  artist: string;
  greeting: string;
  name: string;
  time: string;
}

let lastLine = -1;

function fill(template: string, v: Vars): string {
  return template.replace(/\{(title|artist|name|greeting|time)\}/g, (_, key: keyof Vars) => v[key]);
}

function varsFor(title: string, artist: string): Vars {
  const lang = useLanguage.getState().lang;
  const now = new Date();
  return {
    // Brackets and "feat." read badly aloud.
    title: title.replace(/\s*[([].*?[)\]]/g, '').trim() || title,
    artist: artist.split(/,|&| x /)[0]!.trim() || artist,
    greeting: t(greetingKey(now)),
    name: nickname(),
    time: now.toLocaleTimeString(lang === 'id' ? 'id-ID' : 'en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

/** A line for this song: the listener's own and the built-in ones, as set. */
function pickLine(vars: Vars): string {
  const { lines: mine, onlyMine } = useDj.getState();
  const builtIn = LINES[useLanguage.getState().lang].map((f) => f(vars));
  const own = mine.map((l) => fill(l, vars));
  const pool = own.length > 0 && onlyMine ? own : [...builtIn, ...own];
  let pick = Math.floor(Math.random() * pool.length);
  if (pick === lastLine && pool.length > 1) pick = (pick + 1) % pool.length;
  lastLine = pick;
  return pool[pick]!;
}

function speak(title: string, artist: string) {
  utter(pickLine(varsFor(title, artist)));
}

/** Speaks [text] in the chosen voice, the music ducked under it. */
function utter(text: string) {
  if (!djSupported() || !text.trim()) return;
  const lang = useLanguage.getState().lang;
  const { voice, rate, pitch } = useDj.getState();
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const code = lang === 'id' ? 'id' : 'en';
  const voices = synth.getVoices();
  const chosen = (voice && voices.find((v) => v.voiceURI === voice)) || voices.find((v) => v.lang.toLowerCase().startsWith(code)) || null;
  utterance.voice = chosen;
  utterance.lang = chosen?.lang ?? (lang === 'id' ? 'id-ID' : 'en-US');
  utterance.rate = rate;
  utterance.pitch = pitch;
  const done = () => {
    useDj.setState({ speaking: false });
    setOutputScale('dj', 1);
  };
  utterance.onstart = () => {
    useDj.setState({ speaking: true });
    setOutputScale('dj', useDj.getState().duck);
  };
  utterance.onend = done;
  utterance.onerror = done;
  synth.speak(utterance);
}

export const useDj = create<DjState>()((set, get) => ({
  ...load(),
  speaking: false,
  setEnabled: (enabled) => {
    set({ enabled });
    save(get());
    if (!enabled && djSupported()) {
      window.speechSynthesis.cancel();
      setOutputScale('dj', 1);
    }
  },
  setEvery: (every) => {
    set({ every });
    save(get());
  },
  set: (patch) => {
    set(patch);
    save(get());
  },
  say: (text) => {
    const now = usePlayer.getState().nowPlaying;
    utter(fill(text, varsFor(now?.title ?? '', now?.artist ?? '')));
  },
  speakNow: () => {
    const now = usePlayer.getState().nowPlaying;
    if (now) speak(now.title, now.artist);
  },
}));

// Each new song, once it's playing: talk over its first seconds.
let count = 0;
let pending: ReturnType<typeof setTimeout> | null = null;
usePlayer.subscribe((state, previous) => {
  const id = state.nowPlaying?.videoId;
  if (!id || id === previous.nowPlaying?.videoId) return;
  const { enabled, every } = useDj.getState();
  if (!enabled) return;
  count++;
  if ((count - 1) % every !== 0) return;
  if (pending) clearTimeout(pending);
  // Wait for the song to start, so a restored queue that loads paused stays quiet.
  pending = setTimeout(() => {
    const now = usePlayer.getState();
    if (now.nowPlaying?.videoId === id && now.status === 'playing') speak(now.nowPlaying.title, now.nowPlaying.artist);
  }, 900);
});
