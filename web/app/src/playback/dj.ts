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

interface DjState {
  enabled: boolean;
  /** Talk before every song, every second, or every third. */
  every: DjEvery;
  speaking: boolean;
  setEnabled: (on: boolean) => void;
  setEvery: (every: DjEvery) => void;
  /** Says something now about the song playing (the preview button). */
  speakNow: () => void;
}

const KEY = 'etify:dj';
const DUCK = 0.28;

function load(): { enabled: boolean; every: DjEvery } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { enabled?: boolean; every?: number } | null;
    return { enabled: raw?.enabled === true, every: raw?.every === 2 || raw?.every === 3 ? raw.every : 1 };
  } catch {
    return { enabled: false, every: 1 };
  }
}

function save(state: { enabled: boolean; every: DjEvery }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage refused: the choice lasts for this tab.
  }
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

function speak(title: string, artist: string) {
  if (!djSupported()) return;
  const lang = useLanguage.getState().lang;
  const now = new Date();
  const vars: Vars = {
    // Brackets and "feat." read badly aloud.
    title: title.replace(/\s*[([].*?[)\]]/g, '').trim() || title,
    artist: artist.split(/,|&| x /)[0]!.trim() || artist,
    greeting: t(greetingKey(now)),
    name: nickname(),
    time: now.toLocaleTimeString(lang === 'id' ? 'id-ID' : 'en-US', { hour: 'numeric', minute: '2-digit' }),
  };
  const lines = LINES[lang];
  let pick = Math.floor(Math.random() * lines.length);
  if (pick === lastLine) pick = (pick + 1) % lines.length;
  lastLine = pick;

  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(lines[pick]!(vars));
  const code = lang === 'id' ? 'id' : 'en';
  utterance.lang = lang === 'id' ? 'id-ID' : 'en-US';
  utterance.voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(code)) ?? null;
  utterance.rate = 1.03;
  utterance.pitch = 1;
  const done = () => {
    useDj.setState({ speaking: false });
    setOutputScale('dj', 1);
  };
  utterance.onstart = () => {
    useDj.setState({ speaking: true });
    setOutputScale('dj', DUCK);
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
    save({ enabled, every: get().every });
    if (!enabled && djSupported()) {
      window.speechSynthesis.cancel();
      setOutputScale('dj', 1);
    }
  },
  setEvery: (every) => {
    set({ every });
    save({ enabled: get().enabled, every });
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
