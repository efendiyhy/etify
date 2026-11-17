import { lazy, Suspense, useEffect } from 'react';
import { resumeSession } from '@/party/listenTogether';
import { startPartySync } from '@/party/partySync';
import { useDiscordPresence } from '@/playback/discordPresence';
import { startHistoryReporting } from '@/playback/historyReporting';
import { startLivePresence } from '@/playback/livePresence';
import { Outlet } from 'react-router';
import { ContextMenuHost } from '@/components/ContextMenu';
import { PrefetchLink } from '@/components/PrefetchLink';
import { config } from '@/config';
import { useExtension } from '@/extension/useExtension';
import { isMobileBrowser } from '@/lib/platform';
import { useT } from '@/lib/i18n';
import { reloadToLatest, startUpdateCheck, useAppUpdate } from '@/lib/version';
import { useUi } from '@/state/ui';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { Banner, bannerButtonClass } from './Banner';
import { MobileTopBar } from './MobileTopBar';
import { PlayerBar } from './PlayerBar';
import { SidePanel } from './SidePanel';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const mobile = isMobileBrowser();

// It carries am-lyrics; loaded the first time it opens, as the side panel's lyrics are.
const FullScreenPlayer = lazy(() => import('./FullScreenPlayer').then((m) => ({ default: m.FullScreenPlayer })));

/**
 * The app frame: the top bar, the library, the scrolling page and the side
 * panel as panels, the player bar along the bottom, and the band under it
 * when there is one.
 */
export function AppShell() {
  useKeyboardShortcuts();
  useDiscordPresence();
  // Listen Together: pick a party back up after a reload, and keep the player in step with it.
  useEffect(() => {
    resumeSession();
    return startPartySync();
  }, []);
  // Plays into the account's YouTube Music history (Settings › Share Listening Activity).
  useEffect(() => startHistoryReporting(), []);
  // Counts this tab in the "listening now" figure beside the phone and PC apps.
  useEffect(() => startLivePresence(), []);
  const extension = useExtension();
  const bannerDismissed = useUi((s) => s.installBannerDismissed);
  const dismissBanner = useUi((s) => s.dismissInstallBanner);
  const fullScreen = useUi((s) => s.fullScreen);
  const sidebarCollapsed = useUi((s) => s.sidebarCollapsed);
  const t = useT();
  useEffect(() => startUpdateCheck(), []);
  const update = useAppUpdate();

  let banner = null;
  if (update.available && !update.dismissed) {
    // A newer deploy than this page: one click past every cache.
    banner = (
      <Banner
        title={t('update.title')}
        detail={t('update.detail')}
        action={
          <button className={bannerButtonClass} onClick={() => void reloadToLatest()}>
            {t('update.reload')}
          </button>
        }
        onDismiss={update.dismiss}
      />
    );
  } else if (mobile) {
    banner = (
      <Banner
        title={t('banner.appTitle')}
        detail={t('banner.appDetail')}
        action={
          <a className={bannerButtonClass} href={config.androidAppUrl} target="_blank" rel="noreferrer">
            {t('banner.getApp')}
          </a>
        }
      />
    );
  } else if (extension.state === 'missing' && !bannerDismissed) {
    banner = (
      <Banner
        title={t('banner.extTitle')}
        detail={t('banner.extDetail')}
        action={
          <PrefetchLink className={bannerButtonClass} to="/extension">
            {t('common.getExtension')}
          </PrefetchLink>
        }
        onDismiss={dismissBanner}
      />
    );
  }

  return (
    <div className="grid h-full grid-rows-[minmax(0,1fr)_auto_auto] bg-canvas">
      {/*
        The panelled frame: a bar across the top, then the library, the page and
        (when open) the side panel as rounded panels on the canvas, 8px apart.
        On a phone the sidebar is a drawer and the page fills the screen.
      */}
      <div className="relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:px-2 max-sm:block">
        <TopBar />
        <MobileTopBar />
        <div
          className="relative grid min-h-0 gap-2 transition-[grid-template-columns] duration-200 ease-out sm:grid-cols-[var(--library-width)_minmax(0,1fr)_auto] max-sm:block max-sm:h-full"
          style={{ '--library-width': sidebarCollapsed ? '80px' : 'var(--web-navigation-width)' } as React.CSSProperties}
        >
          <Sidebar />
          <main
            id="scrollable-page"
            className="relative overflow-x-hidden overflow-y-auto bg-panel scrollbar-soft data-tint:bg-(--page-tint) data-tint:transition-[background-color] data-tint:duration-300 data-tint:ease-in sm:rounded-panel max-sm:absolute max-sm:inset-0 max-sm:pt-(--mobile-top-bar-height)"
          >
            {/* The panel's top glow, in the key colour, as the page's own backdrop. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[linear-gradient(180deg,rgba(var(--keyColor-rgb),0.30),transparent)]" aria-hidden="true" />
            <div className="relative min-h-full pb-10">
              <Outlet />
            </div>
          </main>
          <SidePanel />
        </div>
      </div>
      <PlayerBar />
      {banner}
      <ShortcutsDialog />
      <ContextMenuHost />
      {fullScreen && (
        <Suspense fallback={null}>
          <FullScreenPlayer />
        </Suspense>
      )}
    </div>
  );
}
