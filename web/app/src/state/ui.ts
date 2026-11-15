import { create } from 'zustand';

export type SidePanel = 'up-next' | 'lyrics' | null;

interface UiState {
  /** The right-hand glass panel (report §7); one of Up Next or Lyrics at a time. */
  sidePanel: SidePanel;
  toggleSidePanel: (panel: Exclude<SidePanel, null>) => void;
  closeSidePanel: () => void;
  /** The full-screen player: artwork, controls and lyrics over the artwork's mesh (report §7). */
  fullScreen: boolean;
  setFullScreen: (open: boolean) => void;
  /** The sidebar as a drawer, below 484px where it's otherwise hidden. */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** The library panel folded to a rail of artwork, remembered on this browser. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** The keyboard shortcuts list ("?"). */
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  /** The extension install banner, dismissed for this tab only. */
  installBannerDismissed: boolean;
  dismissInstallBanner: () => void;
}

const BANNER_KEY = 'etify:install-banner-dismissed';
const SIDEBAR_KEY = 'etify:sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

export const useUi = create<UiState>()((set) => ({
  sidePanel: null,
  toggleSidePanel: (panel) => set((s) => ({ sidePanel: s.sidePanel === panel ? null : panel })),
  closeSidePanel: () => set({ sidePanel: null }),
  fullScreen: false,
  setFullScreen: (fullScreen) => set({ fullScreen }),
  drawerOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  sidebarCollapsed: readCollapsed(),
  toggleSidebar: () =>
    set((s) => {
      const sidebarCollapsed = !s.sidebarCollapsed;
      try {
        localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
      } catch {
        // Private windows can refuse storage; the choice then lasts for this tab.
      }
      return { sidebarCollapsed };
    }),
  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  installBannerDismissed: sessionStorage.getItem(BANNER_KEY) === '1',
  dismissInstallBanner: () => {
    sessionStorage.setItem(BANNER_KEY, '1');
    set({ installBannerDismissed: true });
  },
}));

// For browser-driven tests, next to __bcPlayer.
if (import.meta.env.DEV) Object.assign(window, { __bcUi: useUi });
