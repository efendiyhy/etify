import { linkContextMenu, trackContextMenu } from '@/components/ContextMenu';
import { PrefetchLink } from '@/components/PrefetchLink';
import { PlayIcon } from '@/components/icons/Transport';
import type { MusicItem } from '@/data/music/types';
import { Artwork } from './Artwork';
import { ExplicitBadge } from './ExplicitBadge';
import { artistHref, hrefFor } from './links';
import { playTrack, toTrack } from './play';
import { TrackMenu } from './TrackMenu';

const isPlayable = (item: MusicItem) => item.kind === 'song' || item.kind === 'video';

/** The right-click menu for an item: a song's menu, or Open/Copy link for the rest. */
function onItemContextMenu(item: MusicItem) {
  if (isPlayable(item)) return trackContextMenu(toTrack(item));
  const href = hrefFor(item);
  return href ? linkContextMenu(item.title, href) : undefined;
}

/* Lockups (report §2). */
// A card: on hover its own panel shows behind it and the play button rises into the artwork's corner.
const lockup = 'group/card -m-3 flex min-w-0 flex-col rounded-lg p-3 transition-colors duration-200 hover:bg-card-hover focus-within:bg-card-hover';
const caption = 'mt-2.5 flex min-w-0 flex-col gap-0.5';
const title = 'flex min-w-0 items-center type-body-emphasized [&>:first-child]:truncate';
const subtitle = 'truncate type-callout text-secondary';
const overlayLink = 'absolute inset-0 z-1 rounded-[inherit]';

/** Artist names as links where YouTube links them, else the given subtitle. */
function Byline({ item }: { item: MusicItem }) {
  const linked = item.artists.some((a) => a.id);
  if (!linked || item.kind === 'album' || item.kind === 'playlist') return <>{item.subtitle}</>;
  return (
    <>
      {item.artists.map((artist, i) => {
        const href = artistHref(artist.id);
        return (
          <span key={`${artist.name}-${i}`}>
            {i > 0 && ', '}
            {href ? (
              <PrefetchLink to={href} className="hover:underline">
                {artist.name}
              </PrefetchLink>
            ) : (
              artist.name
            )}
          </span>
        );
      })}
    </>
  );
}

function PlayPlatter({ item }: { item: MusicItem }) {
  return (
    <button
      className="absolute right-2 bottom-2 z-3 grid size-12 translate-y-2 place-items-center rounded-full bg-key-bg text-white opacity-0 shadow-[0_8px_16px_rgb(0_0_0/0.35)] transition-[opacity,translate,scale] duration-200 group-hover/card:translate-y-0 group-hover/card:opacity-100 hover:scale-[1.05] focus-visible:translate-y-0 focus-visible:opacity-100"
      aria-label={`Play ${item.title}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        playTrack(item);
      }}
    >
      <PlayIcon size={22} />
    </button>
  );
}

/** The artwork, linking to the item or playing it, with the card's play button and track menu. */
function LockupArtwork({ item, width, aspect }: { item: MusicItem; width: number; aspect: number }) {
  const href = hrefFor(item);
  return (
    <div className="relative rounded-artwork-md shadow-[0_8px_24px_rgb(0_0_0/0.25)]">
      <Artwork src={item.thumbnail} displayWidth={width} aspect={aspect} radius="var(--radius-artwork-medium)" />
      {href ? (
        <PrefetchLink to={href} className={overlayLink} aria-label={item.title} />
      ) : (
        <button className={overlayLink} aria-label={`Play ${item.title}`} onClick={() => playTrack(item)} />
      )}
      {isPlayable(item) && <PlayPlatter item={item} />}
      {/* The track menu for playable items, top-right, shown with the play button and held while open. */}
      {isPlayable(item) && (
        <TrackMenu
          track={toTrack(item)}
          className="absolute top-2 right-2 z-3 grid size-8 place-items-center rounded-full bg-[rgb(0_0_0/0.55)] text-white opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 focus-visible:opacity-100 hover:bg-[rgb(0_0_0/0.75)] data-open:opacity-100"
        />
      )}
    </div>
  );
}

/** Square lockup (report §2): artwork, hover scrim with play platter, title and subtitle. */
export function SquareLockup({ item, width = 220 }: { item: MusicItem; width?: number }) {
  const href = hrefFor(item);
  return (
    <div className={lockup} onContextMenu={onItemContextMenu(item)}>
      <LockupArtwork item={item} width={width} aspect={1} />
      <div className={caption}>
        <div className={title}>
          {href ? (
            <PrefetchLink to={href} className="hover:underline">
              {item.title}
            </PrefetchLink>
          ) : (
            <span>{item.title}</span>
          )}
          {item.explicit && <ExplicitBadge />}
        </div>
        <div className={subtitle}>
          <Byline item={item} />
        </div>
      </div>
    </div>
  );
}

/** 16:9 video lockup (report §2, type C). */
export function VideoLockup({ item, width = 300 }: { item: MusicItem; width?: number }) {
  return (
    <div className={lockup} onContextMenu={onItemContextMenu(item)}>
      <LockupArtwork item={item} width={width} aspect={16 / 9} />
      <div className={caption}>
        <div className={title}>
          <span>{item.title}</span>
          {item.explicit && <ExplicitBadge />}
        </div>
        <div className={subtitle}>{item.subtitle}</div>
      </div>
    </div>
  );
}

/** Circular artist lockup (report §2, type H). */
export function CircleLockup({ item, width = 160 }: { item: MusicItem; width?: number }) {
  return (
    <PrefetchLink to={hrefFor(item) ?? '#'} className="group/circle flex min-w-0 flex-col items-center gap-2.5" onContextMenu={onItemContextMenu(item)}>
      <Artwork src={item.thumbnail} displayWidth={width} radius="50%" />
      <span className="max-w-full truncate text-center type-body group-hover/circle:underline">{item.title}</span>
    </PrefetchLink>
  );
}

/** A song row inside a shelf (report §2, track lockup): 40px art, title, byline. */
export function TrackLockup({ item, onPlay }: { item: MusicItem; onPlay?: () => void }) {
  const play = onPlay ?? (() => playTrack(item));
  return (
    // 52px art column (40 + 12 gap), content, menu; 55px tall.
    <div onContextMenu={onItemContextMenu(item)} className="group/track grid h-[55px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 py-[7.5px] pr-3.5 pl-0">
      <button className="group/art relative w-10 rounded-artwork-sm" aria-label={`Play ${item.title}`} onClick={play}>
        <Artwork src={item.thumbnail} displayWidth={40} radius="var(--radius-artwork-small)" />
        <span
          className="absolute inset-0 grid place-items-center rounded-[inherit] bg-lockup-hover text-white opacity-0 transition-opacity duration-100 ease-in group-hover/track:opacity-100 group-focus-visible/art:opacity-100"
          aria-hidden="true"
        >
          <PlayIcon size={16} />
        </span>
      </button>
      <div className="flex min-w-0 flex-col gap-px px-1">
        <div className="flex min-w-0 items-center type-body">
          <button className="min-w-0 truncate text-left" onClick={play}>
            {item.title}
          </button>
          {item.explicit && <ExplicitBadge />}
        </div>
        <div className="truncate type-callout text-secondary">
          <Byline item={item} />
        </div>
      </div>
      {/* The track row's ⋯ (report §14), at the card's end: revealed on hover
          or focus, and held visible while its menu is open. The space is
          always reserved so the title doesn't jump when it appears. */}
      {isPlayable(item) && (
        <TrackMenu
          track={toTrack(item)}
          className="grid size-7 place-items-center rounded-full text-key opacity-0 transition-opacity duration-100 ease-in group-hover/track:opacity-100 focus-visible:opacity-100 hover:bg-quinary data-open:opacity-100"
        />
      )}
    </div>
  );
}
