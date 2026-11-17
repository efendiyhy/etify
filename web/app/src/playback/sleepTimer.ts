import { create } from 'zustand';
import { getAudio, setOutputScale, usePlayer } from '@/state/player';

/**
 * The sleep timer: after N minutes, or at the end of the song playing, the
 * music fades out and pauses. The fade is a temporary scale on the output;
 * the volume setting isn't touched.
 */

/** How long the fade out lasts, at the end of a timed sleep. */
const FADE_SEC = 30;
/** The end-of-song fade: the song's last seconds. */
const TRACK_FADE_SEC = 8;

interface SleepState {
  /** When the music stops (ms since epoch), or null. */
  endsAt: number | null;
  /** Stop at the end of the song playing instead. */
  endOfTrack: boolean;
  /** Seconds left, for the countdown; null when off or waiting on the song's end. */
  remaining: number | null;
  start: (minutes: number) => void;
  startEndOfTrack: () => void;
  cancel: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  setOutputScale('sleep', 1);
}

function finish() {
  const { status, togglePlay } = usePlayer.getState();
  if (status === 'playing' || status === 'buffering') togglePlay();
  useSleepTimer.setState({ endsAt: null, endOfTrack: false, remaining: null });
  stop();
}

function tick() {
  const { endsAt, endOfTrack } = useSleepTimer.getState();
  if (endsAt !== null) {
    const left = (endsAt - Date.now()) / 1000;
    useSleepTimer.setState({ remaining: Math.max(0, Math.ceil(left)) });
    setOutputScale('sleep', left < FADE_SEC ? Math.max(0, left / FADE_SEC) : 1);
    if (left <= 0) finish();
    return;
  }
  if (endOfTrack) {
    const audio = getAudio();
    if (!audio || !Number.isFinite(audio.duration)) return;
    const left = (audio.duration - audio.currentTime) / (audio.playbackRate || 1);
    setOutputScale('sleep', left < TRACK_FADE_SEC ? Math.max(0, left / TRACK_FADE_SEC) : 1);
    if (left <= 0.6) finish();
  }
}

function run() {
  stop();
  timer = setInterval(tick, 250);
  tick();
}

export const useSleepTimer = create<SleepState>()((set) => ({
  endsAt: null,
  endOfTrack: false,
  remaining: null,
  start: (minutes) => {
    set({ endsAt: Date.now() + minutes * 60_000, endOfTrack: false });
    run();
  },
  startEndOfTrack: () => {
    set({ endsAt: null, endOfTrack: true, remaining: null });
    run();
  },
  cancel: () => {
    set({ endsAt: null, endOfTrack: false, remaining: null });
    stop();
  },
}));

/** 12:05 or 5:09 for the countdown. */
export function formatRemaining(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
