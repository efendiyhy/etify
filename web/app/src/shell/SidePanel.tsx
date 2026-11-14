import { lazy, Suspense } from 'react';
import { useUi } from '@/state/ui';
import { UpNext } from './UpNext';

// am-lyrics is large; it loads the first time the panel opens (prompt §3).
const LyricsPanel = lazy(() => import('./LyricsPanel').then((m) => ({ default: m.LyricsPanel })));

/** Up Next / Lyrics, a panel beside the page. */
export function SidePanel() {
  const panel = useUi((s) => s.sidePanel);
  // Hidden under the full-screen player, which has its own lyrics: one am-lyrics at a time.
  const fullScreen = useUi((s) => s.fullScreen);
  if (!panel || fullScreen) return null;

  return (
    <aside
      className="relative z-(--z-web-chrome) flex min-h-0 w-(--side-panel-width) animate-fade flex-col overflow-hidden rounded-panel bg-panel max-sm:absolute max-sm:inset-0 max-sm:w-full max-sm:rounded-none"
      aria-label={panel === 'up-next' ? 'Up Next' : 'Lyrics'}
    >
      {panel === 'up-next' ? (
        <UpNext />
      ) : (
        <Suspense fallback={null}>
          <LyricsPanel />
        </Suspense>
      )}
    </aside>
  );
}
