import { useEffect, useRef } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { PlayIcon } from '@/components/icons/Transport';
import { Artwork } from '@/components/music/Artwork';
import { playList } from '@/components/music/play';
import { Shelves, TrackShelf } from '@/components/music/ShelfView';
import { LoadError, LoadMoreError, NeedsExtension } from '@/components/music/States';
import { useHome, useLibrary, useYouTubeReady } from '@/data/music/queries';
import type { Track } from '@/data/music/types';
import { HomeSkeleton } from '@/skeletons/PageSkeletons';
import { greetingKey } from '@/lib/greeting';
import { useT } from '@/lib/i18n';
import { useNickname } from '@/state/profile';
import { ShelfSkeleton } from '@/skeletons/ShelfSkeleton';

const RECENT_TITLE = 'Recently Played';
const RECENT_LIMIT = 20;
const RECENT_SOURCE = { title: RECENT_TITLE, type: 'home' as const };

/**
 * The account's listening history, newest first, one row per song
 * (YtMusicRepository.recentlyPlayed): the first 20, signed in only. The same
 * query as Library's Recently Played, so either page warms the other.
 */
function useRecentlyPlayed(): Track[] {
  const history = useLibrary('recent');
  const first = history.data?.pages[0]?.data.tracks ?? [];
  const seen = new Set<string>();
  return first.filter((t) => !seen.has(t.videoId) && seen.add(t.videoId)).slice(0, RECENT_LIMIT);
}

const QUICK_LIMIT = 8;

/**
 * The first few recently played songs as wide tiles under the greeting: one
 * click plays it, with the rest of the history queued after.
 */
function QuickPicks({ tracks }: { tracks: Track[] }) {
  const picks = tracks.slice(0, QUICK_LIMIT);
  if (picks.length < 2) return null;
  return (
    <ul className="mx-(--body-gutter) mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {picks.map((track, i) => (
        <li key={track.videoId}>
          <button
            className="group/quick flex h-16 w-full items-center gap-3 overflow-hidden rounded-md bg-quinary pr-2 text-start transition-colors hover:bg-quaternary"
            onClick={() => playList(tracks, i, { source: RECENT_SOURCE })}
          >
            <span className="w-16 flex-none shadow-[4px_0_12px_rgb(0_0_0/0.25)]">
              <Artwork src={track.thumbnail} displayWidth={64} radius="0" />
            </span>
            <span className="min-w-0 flex-1 truncate type-body-emphasized">{track.title}</span>
            <span
              className="grid size-9 flex-none place-items-center rounded-full bg-key-bg text-white opacity-0 shadow-[0_6px_12px_rgb(0_0_0/0.3)] transition-opacity group-hover/quick:opacity-100 group-focus-visible/quick:opacity-100"
              aria-hidden="true"
            >
              <PlayIcon size={18} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** YouTube Music's home feed: a greeting and quick picks, then shelf after shelf, more as you scroll. */
export default function HomePage() {
  const { missing } = useYouTubeReady();
  const home = useHome();
  const recent = useRecentlyPlayed();
  const nick = useNickname();
  const t = useT();
  const greeting = t(greetingKey());
  const heading = nick ? `${greeting}, ${nick}` : greeting;
  const sentinel = useRef<HTMLDivElement>(null);

  // Loads the next shelves before the bottom comes into view; after a failed
  // page it waits for Try Again rather than retrying on every scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !home.hasNextPage || home.isFetchNextPageError) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !home.isFetchingNextPage) void home.fetchNextPage();
      },
      { root: document.getElementById('scrollable-page'), rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [home.hasNextPage, home.isFetchingNextPage, home.isFetchNextPageError, home.fetchNextPage]);

  if (missing) {
    return (
      <>
        <PageHeader title={heading} />
        <NeedsExtension />
      </>
    );
  }
  // Only a failed first page replaces the feed; a later one is shown under it.
  if (home.isError && !home.data) {
    return (
      <>
        <PageHeader title={heading} />
        <LoadError error={home.error} onRetry={() => void home.refetch()} />
      </>
    );
  }
  if (!home.data) return <HomeSkeleton />;

  // YouTube's feed can carry its own, older Recently Played; the history wins, as on the phone.
  const shelves = home.data.pages
    .flatMap((page) => page.data)
    .filter((shelf) => !(recent.length > 0 && shelf.title.trim().toLowerCase() === RECENT_TITLE.toLowerCase()));
  return (
    <>
      <PageHeader title={heading} />
      <QuickPicks tracks={recent} />
      {recent.length > 0 && <TrackShelf title={RECENT_TITLE} to="/library/recent" tracks={recent} source={RECENT_SOURCE} />}
      <Shelves shelves={shelves} />
      <div ref={sentinel} />
      {home.isFetchingNextPage && <ShelfSkeleton kind="square" />}
      {home.isFetchNextPageError && <LoadMoreError onRetry={() => void home.fetchNextPage()} />}
    </>
  );
}
