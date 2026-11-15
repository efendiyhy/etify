import { create } from 'zustand';
import type { Track } from '@/data/music/types';
import type { QueueSource } from '@/playback/queue/timeline';
import { usePlayer } from '@/state/player';

/**
 * The queues you have played, newest first, so one can be played again from
 * Up Next's History. A queue is recorded when one is started from a list
 * (an album, a playlist, a shelf, a search): what it was started from and its
 * first hundred songs. Kept in localStorage.
 */

export interface PastQueue {
  id: string;
  source: QueueSource;
  tracks: Track[];
  playedAt: number;
}

const HISTORY_KEY = 'etify:queue-history';
const KEEP = 20;
const MAX_TRACKS = 100;

function load(): PastQueue[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as PastQueue[];
    return Array.isArray(raw) ? raw.filter((q) => q && Array.isArray(q.tracks) && q.source) : [];
  } catch {
    return [];
  }
}

interface HistoryState {
  queues: PastQueue[];
  record: (source: QueueSource, tracks: Track[]) => void;
  clear: () => void;
}

export const useQueueHistory = create<HistoryState>()((set, get) => {
  const persist = (queues: PastQueue[]) => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(queues));
    } catch {
      // Full or refused storage: the history lasts for this tab.
    }
    set({ queues });
  };
  return {
    queues: load(),
    record: (source, tracks) => {
      if (tracks.length === 0) return;
      const key = `${source.type}:${source.id ?? source.title}`;
      // The same list played again moves to the top rather than repeating.
      const rest = get().queues.filter((q) => `${q.source.type}:${q.source.id ?? q.source.title}` !== key);
      const entry: PastQueue = { id: `${Date.now()}`, source, tracks: tracks.slice(0, MAX_TRACKS), playedAt: Date.now() };
      persist([entry, ...rest].slice(0, KEEP));
    },
    clear: () => persist([]),
  };
});

let started = false;

/** Records each queue started from a list, once for the page. */
export function startQueueHistory(): void {
  if (started) return;
  started = true;
  const original = usePlayer.getState().playTracks;
  usePlayer.setState({
    playTracks: (tracks, startIndex, source) => {
      original(tracks, startIndex, source);
      // Radio and the queue itself aren't lists you'd go back to.
      if (source.type !== 'radio' && source.type !== 'queue') useQueueHistory.getState().record(source, tracks);
    },
  });
}
