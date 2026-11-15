import { createRoot, type Root } from 'react-dom/client';
import { BackwardIcon, ForwardIcon, PauseIcon, PlayIcon } from '@/components/icons/Transport';
import { LogoMark } from '@/components/icons/LogoMark';
import { sizedArtwork } from '@/lib/artwork';
import { t } from '@/lib/i18n';
import { usePlayer } from '@/state/player';
import { SeekBar } from './NowPlayingBar';
import { Visualizer } from './Visualizer';

/**
 * The floating mini player: an always-on-top window (Document Picture-in-
 * Picture, Chrome and Edge 116+) with the artwork, the song, the transport and
 * the seek line, live from the same player as the page.
 */

interface DocumentPictureInPicture {
  window: Window | null;
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

export const miniPlayerSupported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

function MiniPlayer() {
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const hasNext = usePlayer((s) => s.index + 1 < s.queue.length || s.repeat !== 'off' || (s.autoplay && s.index >= 0));
  const { togglePlay, next, previous } = usePlayer.getState();
  const control = 'grid place-items-center rounded-full text-primary transition-transform enabled:hover:scale-[1.06] disabled:opacity-40';

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-panel p-4 text-primary select-none">
      {/* The artwork fills the window behind a scrim, as the full-screen player does. */}
      {nowPlaying?.artworkUrl && (
        <img
          src={sizedArtwork(nowPlaying.artworkUrl, 400)}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl"
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,var(--panelBG)_85%)]" />
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {nowPlaying?.artworkUrl ? (
          <img
            src={sizedArtwork(nowPlaying.artworkUrl, 300)}
            alt=""
            referrerPolicy="no-referrer"
            className="aspect-square h-full max-h-[240px] rounded-lg object-cover shadow-[0_12px_32px_rgb(0_0_0/0.45)]"
          />
        ) : (
          <LogoMark size={96} className="text-key" />
        )}
      </div>
      <div className="relative mt-3 min-w-0 text-center">
        <p className="truncate type-body-emphasized">{nowPlaying?.title ?? 'Etify'}</p>
        <p className="truncate type-callout text-secondary">{nowPlaying?.artist ?? ''}</p>
      </div>
      <div className="relative mt-2">
        <SeekBar />
      </div>
      <div className="relative mt-1 flex items-center justify-center gap-6">
        <button className={`${control} size-9`} disabled={!nowPlaying} aria-label="Previous" onClick={previous}>
          <BackwardIcon size={26} />
        </button>
        <button className={`${control} size-12 bg-primary text-page`} disabled={!nowPlaying} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
          {playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
        </button>
        <button className={`${control} size-9`} disabled={!nowPlaying || !hasNext} aria-label="Next" onClick={next}>
          <ForwardIcon size={26} />
        </button>
      </div>
      <Visualizer bars={40} opacity={0.35} className="absolute inset-x-0 bottom-0 h-16" />
    </div>
  );
}

let root: Root | null = null;

/** Opens the mini player, or brings it back to the front if it's open. */
export async function openMiniPlayer(): Promise<void> {
  const api = window.documentPictureInPicture;
  if (!api) {
    alert(t('mini.unsupported'));
    return;
  }
  if (api.window) {
    api.window.focus();
    return;
  }
  const pip = await api.requestWindow({ width: 340, height: 460 });
  // The page's styles, theme and language, so the window looks like the app.
  for (const sheet of [...document.styleSheets]) {
    try {
      const style = pip.document.createElement('style');
      style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
      pip.document.head.append(style);
    } catch {
      if (sheet.href) {
        const link = pip.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        pip.document.head.append(link);
      }
    }
  }
  const html = pip.document.documentElement;
  html.dataset.theme = document.documentElement.dataset.theme ?? 'dark';
  html.style.colorScheme = document.documentElement.style.colorScheme;
  html.lang = document.documentElement.lang;
  pip.document.title = 'Etify';
  pip.document.body.style.margin = '0';
  const mount = pip.document.createElement('div');
  pip.document.body.append(mount);
  root = createRoot(mount);
  root.render(<MiniPlayer />);
  pip.addEventListener('pagehide', () => {
    root?.unmount();
    root = null;
  });
}
