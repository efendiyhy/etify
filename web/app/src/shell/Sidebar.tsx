import { ArrowUpRight, Library, ListMusic, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MdOutlineExtension } from 'react-icons/md';
import { PrefetchLink, PrefetchNavLink } from '@/components/PrefetchLink';
import { LogoMark } from '@/components/icons/LogoMark';
import { HomeIcon, NewIcon, SearchIcon, AllPlaylistsIcon, type NavIconProps } from '@/components/icons/NavIcons';
import { Artwork } from '@/components/music/Artwork';
import { hrefFor } from '@/components/music/links';
import { playList } from '@/components/music/play';
import { LIBRARY_SECTIONS } from '@/data/music/library';
import { useLibrary, useLibraryPlaylists, useSignedIn } from '@/data/music/queries';
import type { Track } from '@/data/music/types';
import { useSpotifyPlaylists } from '@/data/spotify/queries';
import { useExtensionUpdate } from '@/extension/useExtensionUpdate';
import { useSpotifySignedIn } from '@/extension/useSpotifyAuth';
import { useYtAuth } from '@/extension/useYtAuth';
import { useUi } from '@/state/ui';
import { AccountButton } from './AccountButton';

interface NavItem {
  to: string;
  label: string;
  Icon: (props: NavIconProps) => React.ReactNode;
}

/** Only in the phone's drawer: on a wider screen the top bar carries Home and Search. */
const PHONE_NAV: NavItem[] = [
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/new', label: 'New', Icon: NewIcon },
];

const RECENT_LIMIT = 6;
const RECENT_SOURCE = { title: 'Recently Played', type: 'library' as const, id: 'recent' };

// A library row; NavLink sets aria-current on the page's own row.
const item =
  'group flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 type-body-emphasized text-secondary transition-colors hover:bg-panel-elevated hover:text-primary aria-[current=page]:bg-panel-elevated aria-[current=page]:text-primary';
// The same row folded to its tile alone, in the narrow rail.
const railItem =
  'grid place-items-center rounded-md p-1.5 transition-colors hover:bg-panel-elevated aria-[current=page]:bg-panel-elevated';
const icon = 'inline-grid size-6 flex-none place-items-center group-aria-[current=page]:text-key';
// A playlist's square tile, in place of its artwork.
const tile =
  'inline-grid size-12 flex-none place-items-center rounded-[6px] bg-[linear-gradient(135deg,var(--keyColorBG),rgba(var(--keyColor-rgb),0.35))] text-white';
const navLabel = 'min-w-0 truncate';
const sectionHeader = 'mt-4 mb-1 flex items-center justify-between px-2 type-callout-emphasized text-secondary';

/** True below the phone breakpoint, where the sidebar is a drawer and never folds. */
function usePhone(): boolean {
  const query = '(max-width: 483.98px)';
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setPhone(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return phone;
}

/** The account's newest plays, one row per song. */
function useRecentTracks(): Track[] {
  const history = useLibrary('recent');
  const first = history.data?.pages[0]?.data.tracks ?? [];
  const seen = new Set<string>();
  return first.filter((t) => !seen.has(t.videoId) && seen.add(t.videoId));
}

function RecentlyPlayed({ narrow, onNavigate }: { narrow: boolean; onNavigate: () => void }) {
  const tracks = useRecentTracks();
  if (tracks.length === 0) return null;
  const shown = tracks.slice(0, RECENT_LIMIT);
  return (
    <section aria-label="Recently Played">
      {narrow ? (
        <div className="mx-auto my-2 h-px w-8 bg-quaternary" aria-hidden="true" />
      ) : (
        <h2 className={sectionHeader}>
          <span>Recently Played</span>
          <PrefetchLink to="/library/recent" className="type-callout-emphasized text-secondary hover:text-primary hover:underline" onClick={onNavigate}>
            Show all
          </PrefetchLink>
        </h2>
      )}
      <ul className="flex flex-col gap-0.5">
        {shown.map((track, i) => {
          const artist = track.artists.map((a) => a.name).join(', ');
          return (
            <li key={track.videoId}>
              <button
                className={narrow ? `${railItem} w-full` : `${item} w-full text-start`}
                title={narrow ? `${track.title} · ${artist}` : undefined}
                aria-label={`Play ${track.title}`}
                onClick={() => playList(tracks, i, { source: RECENT_SOURCE })}
              >
                <span className="w-12 flex-none overflow-hidden rounded-[6px]">
                  <Artwork src={track.thumbnail} displayWidth={48} radius="6px" />
                </span>
                {!narrow && (
                  <span className="flex min-w-0 flex-col">
                    <span className={`${navLabel} text-primary`}>{track.title}</span>
                    <span className="truncate type-callout text-secondary">{artist}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One playlist row: a tile and, when wide, its name and kind. */
function PlaylistRow({
  to,
  name,
  kind,
  all,
  narrow,
  end,
  onNavigate,
}: {
  to: string;
  name: string;
  kind: string;
  all?: boolean;
  narrow: boolean;
  end?: boolean;
  onNavigate: () => void;
}) {
  return (
    <li>
      <PrefetchNavLink to={to} end={end} className={narrow ? railItem : item} title={narrow ? name : undefined} aria-label={narrow ? name : undefined} onClick={onNavigate}>
        <span className={tile}>{all ? <AllPlaylistsIcon size={24} /> : <ListMusic size={20} strokeWidth={1.8} />}</span>
        {!narrow && (
          <span className="flex min-w-0 flex-col">
            <span className={navLabel}>{name}</span>
            <span className="truncate type-callout text-secondary">{kind}</span>
          </span>
        )}
      </PrefetchNavLink>
    </li>
  );
}

function Playlists({ narrow, onNavigate }: { narrow: boolean; onNavigate: () => void }) {
  const signedIn = useSignedIn();
  const spotifySignedIn = useSpotifySignedIn();
  const playlists = useLibraryPlaylists();
  const spotify = useSpotifyPlaylists();
  if (!signedIn && !spotifySignedIn) return null;
  return (
    <section aria-label="Playlists">
      {narrow ? <div className="mx-auto my-2 h-px w-8 bg-quaternary" aria-hidden="true" /> : <h2 className={sectionHeader}>Playlists</h2>}
      <ul className="flex flex-col gap-0.5">
        {signedIn && (
          <>
            <PlaylistRow to="/library/playlists" name={LIBRARY_SECTIONS.playlists.title} kind="YouTube Music" all narrow={narrow} onNavigate={onNavigate} />
            {playlists.data?.map((playlist) => (
              <PlaylistRow key={playlist.id} to={hrefFor(playlist) ?? '/library/playlists'} name={playlist.title} kind="Playlist" narrow={narrow} onNavigate={onNavigate} />
            ))}
          </>
        )}
        {spotifySignedIn && (
          <>
            <PlaylistRow to="/spotify" end name="All Spotify Playlists" kind="Spotify" all narrow={narrow} onNavigate={onNavigate} />
            {spotify.data?.map((playlist) => (
              <PlaylistRow
                key={playlist.id}
                to={`/spotify/playlist/${encodeURIComponent(playlist.id)}`}
                name={playlist.name}
                kind="Spotify playlist"
                narrow={narrow}
                onNavigate={onNavigate}
              />
            ))}
          </>
        )}
      </ul>
    </section>
  );
}

/** Before there is an account to read: what the panel will hold, and where to start. */
function EmptyLibrary({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="mx-2 mt-3 rounded-lg bg-panel-elevated p-4">
      <p className="type-body-emphasized">Your playlists and recent plays</p>
      <p className="mt-1 type-callout text-secondary">Install the Etify extension and sign in to YouTube Music to see them here.</p>
      <PrefetchLink
        to="/extension"
        className="mt-3 inline-block rounded-pill bg-primary px-4 py-1.5 type-callout-emphasized text-page hover:scale-[1.03]"
        onClick={onNavigate}
      >
        Get the Extension
      </PrefetchLink>
    </div>
  );
}

/** The library panel on the left (it folds to a rail of artwork); a drawer on a phone. */
export function Sidebar() {
  const drawerOpen = useUi((s) => s.drawerOpen);
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const phone = usePhone();
  const narrow = collapsed && !phone;
  const update = useExtensionUpdate();
  const signedIn = useSignedIn();
  const spotifySignedIn = useSpotifySignedIn();
  const close = () => setDrawerOpen(false);
  // The account row only when there is an account control to show; on a phone it also holds Settings.
  const hasAccount = useYtAuth().state === 'ready';

  return (
    <>
      <nav
        className="relative flex min-h-0 flex-col gap-2 max-sm:absolute max-sm:inset-y-0 max-sm:left-0 max-sm:z-(--z-web-chrome) max-sm:w-[min(300px,82vw)] max-sm:-translate-x-full max-sm:bg-canvas max-sm:p-2 max-sm:shadow-glass max-sm:transition-transform max-sm:duration-(--duration-panel) max-sm:ease-panel max-sm:data-[open=true]:translate-none"
        data-open={drawerOpen}
        data-narrow={narrow || undefined}
        aria-label="Library"
      >
        {/* The library: its own panel, scrolling inside. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel bg-panel">
          {/* On a phone the drawer carries the mark the top bar carries on a wider screen. */}
          <div className="hidden h-16 items-center px-5 max-sm:flex">
            <PrefetchLink to="/home" className="inline-flex items-center gap-2 rounded-[6px]" aria-label="Etify, Home" onClick={close}>
              <LogoMark size={26} className="text-key" />
              <span className="type-[800_19px/24px] tracking-[-0.02em]">Etify</span>
            </PrefetchLink>
          </div>

          {/* The header folds and unfolds the panel. */}
          {narrow ? (
            <button
              className="mx-auto mt-3 mb-1 grid size-12 place-items-center rounded-md text-secondary transition-colors hover:bg-panel-elevated hover:text-primary"
              aria-label="Expand Your Library"
              title="Expand Your Library"
              onClick={toggleSidebar}
            >
              <PanelLeftOpen size={22} strokeWidth={2} />
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
              <div className="flex items-center gap-2 text-secondary">
                <Library size={24} strokeWidth={2} />
                <h2 className="type-body-emphasized">Your Library</h2>
              </div>
              <button
                className="grid size-8 place-items-center rounded-full text-secondary transition-colors hover:bg-panel-elevated hover:text-primary max-sm:hidden"
                aria-label="Collapse Your Library"
                title="Collapse Your Library"
                onClick={toggleSidebar}
              >
                <PanelLeftClose size={20} strokeWidth={2} />
              </button>
            </div>
          )}

          <div className={`scrollbar-soft min-h-0 flex-1 overflow-y-auto pb-2 ${narrow ? 'px-1.5' : 'pr-0.5 pl-2'}`}>
            {/* Home, Search and New: in the top bar on a wider screen. */}
            <ul className="mt-2 hidden flex-col gap-0.5 max-sm:flex">
              {PHONE_NAV.map(({ to, label, Icon }) => (
                <li key={to}>
                  <PrefetchNavLink to={to} className={item} onClick={close}>
                    <Icon size={24} className={icon} />
                    <span className={navLabel}>{label}</span>
                  </PrefetchNavLink>
                </li>
              ))}
            </ul>
            {signedIn && <RecentlyPlayed narrow={narrow} onNavigate={close} />}
            <Playlists narrow={narrow} onNavigate={close} />
            {!signedIn && !spotifySignedIn && !narrow && <EmptyLibrary onNavigate={close} />}
          </div>

          {!narrow && (
            <div className={`flex flex-col gap-2 border-t border-quinary px-4 py-3 ${hasAccount ? '' : 'sm:hidden'}`}>
              {/* In the top bar on a wider screen. */}
              <PrefetchNavLink to="/extension" className={`${item} sm:hidden`} onClick={close}>
                <span className={icon}>
                  <MdOutlineExtension size={18} />
                </span>
                <span className={navLabel}>Etify Extension</span>
                {update.state === 'available' && (
                  <span className="ml-auto rounded-[10px] bg-key px-[7px] py-0.5 type-subhead-emphasized text-white" title={`Version ${update.latest.version} is available`}>
                    Update
                  </span>
                )}
              </PrefetchNavLink>
              <div className="flex min-h-7 items-center justify-between gap-2">
                <AccountButton />
                <PrefetchNavLink
                  to="/settings"
                  className="ml-auto grid size-7 flex-none place-items-center rounded-nav text-secondary hover:bg-quinary hover:text-primary aria-[current=page]:bg-quinary aria-[current=page]:text-primary sm:hidden"
                  aria-label="Settings"
                  title="Settings"
                  onClick={close}
                >
                  <Settings size={17} strokeWidth={1.9} />
                </PrefetchNavLink>
              </div>
            </div>
          )}
        </div>

        {/* The credit: a small panel of its own under the library. */}
        <a
          className={`group/credit flex flex-none items-center rounded-panel bg-panel transition-colors hover:bg-panel-elevated ${narrow ? 'justify-center p-3' : 'gap-3 px-4 py-3'}`}
          href="https://ek-instrumentation.com"
          target="_blank"
          rel="noreferrer"
          title={narrow ? 'Developed by EK-Instrumentation' : undefined}
          aria-label={narrow ? 'Developed by EK-Instrumentation' : undefined}
        >
          {!narrow && (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-[500_11px/14px] tracking-[0.04em] text-tertiary uppercase">Developed by</span>
              <span className="truncate type-body-emphasized text-primary">EK-Instrumentation</span>
            </span>
          )}
          <span className="grid size-8 flex-none place-items-center rounded-full bg-panel-elevated text-secondary transition-colors group-hover/credit:bg-key-bg group-hover/credit:text-white">
            <ArrowUpRight size={16} strokeWidth={2.2} />
          </span>
        </a>
      </nav>
      {drawerOpen && <div className="absolute inset-0 z-[calc(var(--z-web-chrome)-1)] hidden bg-scrim max-sm:block" onClick={close} aria-hidden="true" />}
    </>
  );
}
