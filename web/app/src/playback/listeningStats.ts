import { usePlayer } from '@/state/player';

/**
 * What you listen to on this browser, for the Stats page: seconds per song per
 * day, and a play once a song has sounded for 30 seconds. Kept in
 * localStorage, a little over a year of it.
 */

export interface SongMeta {
  title: string;
  artists: string[];
  artwork: string | null;
}

interface StatsData {
  /** 'YYYY-MM-DD' → videoId → seconds heard. */
  seconds: Record<string, Record<string, number>>;
  /** 'YYYY-MM-DD' → videoId → plays. */
  plays: Record<string, Record<string, number>>;
  meta: Record<string, SongMeta>;
}

const STATS_KEY = 'etify:stats';
const KEEP_DAYS = 400;
const PLAY_AFTER_SEC = 30;

function load(): StatsData {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null') as Partial<StatsData> | null;
    return { seconds: raw?.seconds ?? {}, plays: raw?.plays ?? {}, meta: raw?.meta ?? {} };
  } catch {
    return { seconds: {}, plays: {}, meta: {} };
  }
}

let data = load();
let dirty = false;

export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function save() {
  if (!dirty) return;
  dirty = false;
  const cutoff = dayKey(new Date(Date.now() - KEEP_DAYS * 86_400_000));
  for (const day of Object.keys(data.seconds)) if (day < cutoff) delete data.seconds[day];
  for (const day of Object.keys(data.plays)) if (day < cutoff) delete data.plays[day];
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(data));
  } catch {
    // Full or refused storage: the counts last for this tab.
  }
}

/** The song in front and how long it has sounded since it started. */
let current: { videoId: string; heard: number; counted: boolean } | null = null;

function tick() {
  const { status, nowPlaying, queue, index } = usePlayer.getState();
  if (status !== 'playing' || !nowPlaying) return;
  const { videoId } = nowPlaying;
  if (current?.videoId !== videoId) current = { videoId, heard: 0, counted: false };
  current.heard += 1;

  const day = dayKey();
  const seconds = (data.seconds[day] ??= {});
  seconds[videoId] = (seconds[videoId] ?? 0) + 1;
  if (!current.counted && current.heard >= PLAY_AFTER_SEC) {
    current.counted = true;
    const plays = (data.plays[day] ??= {});
    plays[videoId] = (plays[videoId] ?? 0) + 1;
  }
  const entry = queue[index]?.track;
  const artists = entry && entry.videoId === videoId ? entry.artists.map((a) => a.name) : nowPlaying.artist ? [nowPlaying.artist] : [];
  data.meta[videoId] = { title: nowPlaying.title, artists, artwork: nowPlaying.artworkUrl };
  dirty = true;
}

let started = false;

/** Starts counting, once for the page. */
export function startListeningStats(): void {
  if (started) return;
  started = true;
  setInterval(tick, 1000);
  setInterval(save, 15_000);
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
}

export type StatsPeriod = 'week' | 'month' | 'year' | 'all';

export interface TopSong extends SongMeta {
  videoId: string;
  seconds: number;
  plays: number;
}

export interface TopArtist {
  name: string;
  seconds: number;
  artwork: string | null;
}

export interface StatsSummary {
  totalSeconds: number;
  songs: TopSong[];
  artists: TopArtist[];
  /** Minutes per day, oldest first, for the period's chart (the last 7 or 30 days). */
  days: { day: string; minutes: number }[];
}

function periodStart(period: StatsPeriod): string {
  const now = new Date();
  if (period === 'week') return dayKey(new Date(Date.now() - 6 * 86_400_000));
  if (period === 'month') return dayKey(new Date(Date.now() - 29 * 86_400_000));
  if (period === 'year') return `${now.getFullYear()}-01-01`;
  return '0000-00-00';
}

/** The period's totals, read from what has been saved plus what hasn't yet. */
export function summarize(period: StatsPeriod): StatsSummary {
  const from = periodStart(period);
  const bySong = new Map<string, { seconds: number; plays: number }>();
  let totalSeconds = 0;
  for (const [day, songs] of Object.entries(data.seconds)) {
    if (day < from) continue;
    for (const [videoId, sec] of Object.entries(songs)) {
      totalSeconds += sec;
      const row = bySong.get(videoId) ?? { seconds: 0, plays: 0 };
      row.seconds += sec;
      bySong.set(videoId, row);
    }
  }
  for (const [day, songs] of Object.entries(data.plays)) {
    if (day < from) continue;
    for (const [videoId, n] of Object.entries(songs)) {
      const row = bySong.get(videoId) ?? { seconds: 0, plays: 0 };
      row.plays += n;
      bySong.set(videoId, row);
    }
  }

  const songs: TopSong[] = [...bySong.entries()]
    .map(([videoId, row]) => ({ videoId, ...row, ...(data.meta[videoId] ?? { title: videoId, artists: [], artwork: null }) }))
    .sort((a, b) => b.seconds - a.seconds);

  const byArtist = new Map<string, TopArtist>();
  for (const song of songs) {
    const name = song.artists[0];
    if (!name) continue;
    const row = byArtist.get(name) ?? { name, seconds: 0, artwork: song.artwork };
    row.seconds += song.seconds;
    byArtist.set(name, row);
  }
  const artists = [...byArtist.values()].sort((a, b) => b.seconds - a.seconds);

  const span = period === 'week' ? 7 : 30;
  const days = Array.from({ length: span }, (_, i) => {
    const day = dayKey(new Date(Date.now() - (span - 1 - i) * 86_400_000));
    const sec = Object.values(data.seconds[day] ?? {}).reduce((a, b) => a + b, 0);
    return { day, minutes: Math.round(sec / 60) };
  });

  return { totalSeconds, songs, artists, days };
}
