import { PictureInPicture2, SlidersHorizontal } from 'lucide-react';
import { miniPlayerSupported, openMiniPlayer } from './MiniPlayerWindow';
import { Visualizer } from './Visualizer';
import { useState } from 'react';
import { PrefetchLink } from '@/components/PrefetchLink';
import { useT } from '@/lib/i18n';
import { useEqualizer } from '@/playback/equalizer';
import {
  BackwardIcon,
  ForwardIcon,
  LyricsActiveIcon,
  LyricsIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  UpNextIcon,
} from '@/components/icons/Transport';
import { FavoriteButton } from '@/components/music/FavoriteButton';
import { TrackMenu } from '@/components/music/TrackMenu';
import { usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { NowPlayingTrack, SeekBar } from './NowPlayingBar';
import { fadeForVolume, VolumeControl } from './VolumeControl';

const control = 'grid place-items-center rounded-full transition-[color,transform] disabled:opacity-40';
// Shuffle and repeat: secondary, and the key colour (with a dot under) when on.
const toggle = `${control} relative size-8 text-secondary hover:text-primary aria-pressed:text-key aria-pressed:after:absolute aria-pressed:after:bottom-0 aria-pressed:after:size-1 aria-pressed:after:rounded-full aria-pressed:after:bg-key`;
const transport = `${control} size-8 text-secondary hover:text-primary enabled:hover:scale-[1.06]`;
const action = 'grid size-8 place-items-center rounded-full text-secondary hover:text-primary aria-pressed:text-key';
// The actions the volume level slides in over: they fade out while it's open.
const fading = `${action} ${fadeForVolume}`;

/** The player along the bottom: what's playing, the transport over the seek line, and the actions. */
export function PlayerBar() {
  const sidePanel = useUi((s) => s.sidePanel);
  const toggleSidePanel = useUi((s) => s.toggleSidePanel);
  const hasTrack = usePlayer((s) => s.nowPlaying !== null);
  const videoId = usePlayer((s) => s.nowPlaying?.videoId ?? null);
  // The queue's entry for what's playing: the track menu needs the full track.
  const track = usePlayer((s) => {
    const entry = s.queue[s.index]?.track;
    return entry && entry.videoId === s.nowPlaying?.videoId ? entry : null;
  });
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const hasNext = usePlayer((s) => s.index + 1 < s.queue.length || s.repeat !== 'off' || (s.autoplay && s.index >= 0));
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat } = usePlayer.getState();
  const [volumeOpen, setVolumeOpen] = useState(false);
  const eqOn = useEqualizer((s) => s.enabled);
  const t = useT();

  return (
    <div
      className="relative z-[calc(var(--z-web-chrome)-1)] grid h-(--playerBarHeight) grid-cols-[minmax(180px,1fr)_minmax(320px,2fr)_minmax(180px,1fr)] items-center gap-4 bg-canvas px-4 max-sm:hidden"
      role="region"
      aria-label="Player"
    >
      {/* The spectrum, faint, behind the whole bar. */}
      <Visualizer bars={96} opacity={0.18} className="absolute inset-x-0 bottom-0 h-full" />
      <div className="relative flex min-w-0 items-center gap-2">
        <NowPlayingTrack />
        <FavoriteButton videoId={videoId} className={`${action} flex-none`} />
      </div>

      <div className="relative flex min-w-0 flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <button className={toggle} aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle}>
            <ShuffleIcon size={24} />
          </button>
          <button className={transport} disabled={!hasTrack} aria-label="Previous" onClick={previous}>
            <BackwardIcon size={24} />
          </button>
          {/* The one filled control: a round button in the label colour, as the bar's centre. */}
          <button
            className={`${control} size-9 bg-primary text-page enabled:hover:scale-[1.06]`}
            disabled={!hasTrack}
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={togglePlay}
          >
            {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <button className={transport} disabled={!hasTrack || !hasNext} aria-label="Next" onClick={next}>
            <ForwardIcon size={24} />
          </button>
          <button
            className={toggle}
            aria-label={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat'}
            aria-pressed={repeat !== 'off'}
            onClick={cycleRepeat}
          >
            {repeat === 'one' ? <RepeatOneIcon size={24} /> : <RepeatIcon size={24} />}
          </button>
        </div>
        <div className="w-full max-w-[640px]">
          <SeekBar />
        </div>
      </div>

      <div
        className="group/actions relative flex items-center justify-end gap-1"
        data-volume-open={volumeOpen || undefined}
        onPointerLeave={() => setVolumeOpen(false)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setVolumeOpen(false);
        }}
      >
        {track && <TrackMenu track={track} className={fading} placement="above-end" />}
        {/* Always here: the panel itself says whether this track has lyrics, and from where. */}
        <button className={fading} aria-label="Lyrics" aria-pressed={sidePanel === 'lyrics'} onClick={() => toggleSidePanel('lyrics')}>
          {sidePanel === 'lyrics' ? <LyricsActiveIcon size={18} /> : <LyricsIcon size={18} />}
        </button>
        {/* The equaliser's page; lit while it is shaping the sound. */}
        <PrefetchLink to="/settings/equalizer" className={fading} aria-label={t('eq.title')} title={t('eq.title')} aria-pressed={eqOn}>
          <SlidersHorizontal size={17} strokeWidth={2} />
        </PrefetchLink>
        {miniPlayerSupported() && (
          <button className={fading} aria-label={t('mini.open')} title={t('mini.open')} onClick={() => void openMiniPlayer()}>
            <PictureInPicture2 size={17} strokeWidth={2} />
          </button>
        )}
        <button className={fading} aria-label="Up Next" aria-pressed={sidePanel === 'up-next'} onClick={() => toggleSidePanel('up-next')}>
          <UpNextIcon size={18} />
        </button>
        <VolumeControl open={volumeOpen} onOpen={() => setVolumeOpen(true)} className={action} />
      </div>
    </div>
  );
}
