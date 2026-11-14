import { Maximize2 } from 'lucide-react';
import { ExplicitBadge } from '@/components/music/ExplicitBadge';
import { VideoSurface } from '@/components/music/VideoSurface';
import { albumHref } from '@/components/music/links';
import { sizedArtwork } from '@/lib/artwork';
import { usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { useHasVideo } from '@/state/video';
import { Credits, PageLink, pageLink } from './Lcd';
import { MixWindowHighlight } from './NerdStats';
import { albumPageFor } from './nowPlayingLinks';
import { useScrubber } from './useScrubber';

/** The player bar's left end: artwork, title and artists of what's playing. */
export function NowPlayingTrack() {
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const status = usePlayer((s) => s.status);
  const error = usePlayer((s) => s.error);
  const openFullScreen = useUi((s) => s.setFullScreen);
  const track = usePlayer((s) => {
    const entry = s.queue[s.index]?.track;
    return entry && entry.videoId === s.nowPlaying?.videoId ? entry : null;
  });
  const video = useHasVideo(nowPlaying?.videoId);

  if (!nowPlaying) return <div className="min-w-0" />;

  const { videoId, title, artist } = nowPlaying;
  const album = track?.album ?? null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* The artwork opens the full-screen player, with an expand glyph on hover. */}
      <button
        className={`group/art relative h-14 flex-none overflow-hidden rounded-[6px] bg-joe shadow-[0_4px_12px_rgb(0_0_0/0.3)] ${video ? 'w-[100px] bg-black' : 'w-14'}`}
        aria-label="Open full screen player"
        onClick={() => openFullScreen(true)}
      >
        {nowPlaying.artworkUrl && (
          <img
            key={nowPlaying.artworkUrl}
            src={sizedArtwork(nowPlaying.artworkUrl, 56)}
            alt=""
            referrerPolicy="no-referrer"
            decoding="async"
            className="size-full object-cover opacity-0 transition-opacity duration-200 ease-in data-loaded:opacity-100"
            onLoad={(e) => e.currentTarget.setAttribute('data-loaded', '')}
          />
        )}
        <VideoSurface className={`absolute inset-0 transition-opacity duration-300 ${video ? 'opacity-100' : 'opacity-0'}`} />
        <span
          className="absolute inset-0 grid place-items-center bg-[rgb(0_0_0/0.5)] text-white opacity-0 transition-opacity duration-200 group-hover/art:opacity-100 group-focus-visible/art:opacity-100"
          aria-hidden="true"
        >
          <Maximize2 size={16} strokeWidth={2.25} />
        </span>
      </button>
      <div className="flex min-w-0 flex-col">
        {title ? (
          <div className="flex min-w-0 items-center">
            <PageLink
              className={`min-w-0 max-w-full truncate type-body-emphasized ${pageLink}`}
              href={albumHref(album?.id ?? null)}
              resolve={() => albumPageFor(videoId, album, [title, artist].filter(Boolean).join(' '))}
            >
              {title}
            </PageLink>
            {track?.explicit && <ExplicitBadge size={11} />}
          </div>
        ) : (
          <span className="truncate type-body-emphasized">{status === 'loading' ? 'Loading…' : ''}</span>
        )}
        {status === 'error' ? (
          <span className="truncate type-callout-medium text-key">{error}</span>
        ) : (
          <span className="truncate type-callout-medium text-secondary">
            {artist ? (
              <Credits videoId={videoId} line={artist} artists={track?.artists ?? []} className={`${pageLink} hover:text-primary`} />
            ) : status === 'loading' ? (
              'Loading…'
            ) : (
              ''
            )}
          </span>
        )}
      </div>
    </div>
  );
}

const time = 'w-10 flex-none type-[500_12px/16px] tabular-nums text-secondary';

/**
 * Elapsed time, the seek line and the time left, under the transport. The
 * line thickens and takes the key colour on hover; pressing or dragging seeks.
 */
export function SeekBar() {
  const { bar, elapsed, remaining, dragging, handlers } = useScrubber();
  const hasTrack = usePlayer((s) => s.nowPlaying !== null);
  return (
    <div className="flex w-full items-center gap-2" data-disabled={!hasTrack || undefined}>
      <span ref={elapsed} className={`${time} text-end`}>
        0:00
      </span>
      <div
        className="group/scrub relative h-3 flex-1 cursor-pointer touch-none"
        data-scrubber
        data-dragging={dragging || undefined}
        {...handlers}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-pill bg-quaternary" aria-hidden="true">
          <MixWindowHighlight />
          <div
            ref={bar}
            className="relative size-full origin-left scale-x-(--progress) rounded-pill bg-primary transition-colors [--progress:0] group-hover/scrub:bg-key group-data-dragging/scrub:bg-key"
          />
        </div>
      </div>
      <span ref={remaining} className={time}>
        0:00
      </span>
    </div>
  );
}
