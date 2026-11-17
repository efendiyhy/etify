import { create } from 'zustand';

/**
 * Which build this page is, and whether a newer one has been deployed since
 * it loaded: /version.json is fetched (never from cache) on focus and every
 * few minutes, and a different id offers a reload.
 */

export const BUILD_ID = __BUILD_ID__;
export const BUILD_TIME = __BUILD_TIME__;

interface UpdateState {
  available: string | null;
  dismissed: boolean;
  dismiss: () => void;
}

export const useAppUpdate = create<UpdateState>()((set) => ({
  available: null,
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
}));

async function check() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const { id } = (await response.json()) as { id?: string };
    if (id && id !== BUILD_ID) useAppUpdate.setState({ available: id });
  } catch {
    // Offline: try again later.
  }
}

let started = false;
export function startUpdateCheck(): void {
  if (started || !import.meta.env.PROD) return;
  started = true;
  void check();
  setInterval(() => void check(), 5 * 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}

/** Reloads past every cache: the service worker's shell and the browser's. */
export async function reloadToLatest(): Promise<void> {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    const registrations = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((registrations ?? []).map((r) => r.update()));
  } catch {
    // Nothing cached to clear.
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now()));
  window.location.replace(url.toString());
}
