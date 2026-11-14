import { ArrowUpRight, Library, ListMusic, Settings } from 'lucide-react';
import { MdOutlineExtension } from 'react-icons/md';
import { PrefetchLink, PrefetchNavLink } from '@/components/PrefetchLink';
import { LogoMark } from '@/components/icons/LogoMark';
import {
  AlbumsIcon,
  AllPlaylistsIcon,
  ArtistsIcon,
  HomeIcon,
  MadeForYouIcon,
  NewIcon,
  RecentlyAddedIcon,
  SearchIcon,
  SongsIcon,
  type NavIconProps,
} from '@/components/icons/NavIcons';
import { hrefFor } from '@/components/music/links';
import { LIBRARY_SECTIONS, type LibrarySection } from '@/data/music/library';
import { useLibraryPlaylists, useSignedIn } from '@/data/music/queries';
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

const PRIMARY: NavItem[] = [
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/new', label: 'New', Icon: NewIcon },
];

const LIBRARY_ICONS: Record<Exclude<LibrarySection, 'playlists'>, NavItem['Icon']> = {
  recent: RecentlyAddedIcon,
  artists: ArtistsIcon,
  albums: AlbumsIcon,
  songs: SongsIcon,
  'made-for-you': MadeForYouIcon,
};

const LIBRARY: NavItem[] = (Object.keys(LIBRARY_ICONS) as (keyof typeof LIBRARY_ICONS)[]).map((section) => ({
  to: `/library/${section}`,
  label: LIBRARY_SECTIONS[section].title,
  Icon: LIBRARY_ICONS[section],
}));

// A library row; NavLink sets aria-current on the page's own row.
const item =
  'group flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 type-body-emphasized text-secondary transition-colors hover:bg-panel-elevated hover:text-primary aria-[current=page]:bg-panel-elevated aria-[current=page]:text-primary';
const icon = 'inline-grid size-6 flex-none place-items-center group-aria-[current=page]:text-key';
// A playlist's square tile, in place of its artwork.
const tile =
  'inline-grid size-12 flex-none place-items-center rounded-[6px] bg-[linear-gradient(135deg,var(--keyColorBG),rgba(var(--keyColor-rgb),0.35))] text-white';
const navLabel = 'min-w-0 truncate';
const sectionHeader = 'mt-5 mb-1 px-2 type-callout-emphasized text-secondary';
const list = 'flex flex-col gap-0.5';
const chip =
  'flex-none rounded-pill bg-panel-elevated px-3 py-1.5 type-callout-emphasized text-primary transition-colors hover:brightness-110 aria-[current=page]:bg-primary aria-[current=page]:text-page';

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return (
    <ul className={list}>
      {items.map(({ to, label, Icon }) => (
        <li key={to}>
          <PrefetchNavLink to={to} className={item} onClick={onNavigate}>
            <Icon size={24} className={icon} />
            <span className={navLabel}>{label}</span>
          </PrefetchNavLink>
        </li>
      ))}
    </ul>
  );
}

/** The library's sections as chips, then the playlists, once YouTube requests are made as the user. */
function LibraryNav({ onNavigate }: { onNavigate: () => void }) {
  const playlists = useLibraryPlaylists();
  return (
    <>
      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {LIBRARY.map(({ to, label }) => (
          <PrefetchNavLink key={to} to={to} className={chip} onClick={onNavigate}>
            {label}
          </PrefetchNavLink>
        ))}
      </div>
      <h2 className={sectionHeader}>Playlists</h2>
      <ul className={list}>
        <li>
          <PrefetchNavLink to="/library/playlists" className={item} onClick={onNavigate}>
            <span className={tile}>
              <AllPlaylistsIcon size={24} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={navLabel}>{LIBRARY_SECTIONS.playlists.title}</span>
              <span className="truncate type-callout text-secondary">Library</span>
            </span>
          </PrefetchNavLink>
        </li>
        {playlists.data?.map((playlist) => (
          <li key={playlist.id}>
            <PrefetchNavLink to={hrefFor(playlist) ?? '/library/playlists'} className={item} onClick={onNavigate}>
              <span className={tile}>
                <ListMusic size={20} strokeWidth={1.8} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={navLabel}>{playlist.title}</span>
                <span className="truncate type-callout text-secondary">Playlist</span>
              </span>
            </PrefetchNavLink>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Spotify's playlists, once the extension can read them as the user (prompt §7.1). */
function SpotifyNav({ onNavigate }: { onNavigate: () => void }) {
  const playlists = useSpotifyPlaylists();
  return (
    <>
      <h2 className={sectionHeader}>Spotify</h2>
      <ul className={list}>
        <li>
          <PrefetchNavLink to="/spotify" end className={item} onClick={onNavigate}>
            <span className={tile}>
              <AllPlaylistsIcon size={24} />
            </span>
            <span className={navLabel}>All Spotify Playlists</span>
          </PrefetchNavLink>
        </li>
        {playlists.data?.map((playlist) => (
          <li key={playlist.id}>
            <PrefetchNavLink to={`/spotify/playlist/${encodeURIComponent(playlist.id)}`} className={item} onClick={onNavigate}>
              <span className={tile}>
                <ListMusic size={20} strokeWidth={1.8} />
              </span>
              <span className={navLabel}>{playlist.name}</span>
            </PrefetchNavLink>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The library panel on the left; a drawer on a phone. */
export function Sidebar() {
  const drawerOpen = useUi((s) => s.drawerOpen);
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
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
        aria-label="Main"
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
          <div className="flex items-center gap-2 px-4 pt-4 pb-1 text-secondary">
            <Library size={24} strokeWidth={2} />
            <h2 className="type-body-emphasized">Your Library</h2>
          </div>
          <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto pr-0.5 pb-2 pl-2">
            <div className="mt-2">
              <NavList items={PRIMARY} onNavigate={close} />
            </div>
            {signedIn && <LibraryNav onNavigate={close} />}
            {spotifySignedIn && <SpotifyNav onNavigate={close} />}
          </div>
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
              <PrefetchNavLink to="/settings" className="ml-auto grid size-7 flex-none place-items-center rounded-nav text-secondary hover:bg-quinary hover:text-primary aria-[current=page]:bg-quinary aria-[current=page]:text-primary sm:hidden" aria-label="Settings" title="Settings" onClick={close}>
                <Settings size={17} strokeWidth={1.9} />
              </PrefetchNavLink>
            </div>
          </div>
        </div>

        {/* The credit: a small panel of its own under the library. */}
        <a
          className="group/credit flex flex-none items-center gap-3 rounded-panel bg-panel px-4 py-3 transition-colors hover:bg-panel-elevated"
          href="https://ek-instrumentation.com"
          target="_blank"
          rel="noreferrer"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="type-[500_11px/14px] tracking-[0.04em] text-tertiary uppercase">Developed by</span>
            <span className="truncate type-body-emphasized text-primary">EK-Instrumentation</span>
          </span>
          <span className="grid size-8 flex-none place-items-center rounded-full bg-panel-elevated text-secondary transition-colors group-hover/credit:bg-key-bg group-hover/credit:text-white">
            <ArrowUpRight size={16} strokeWidth={2.2} />
          </span>
        </a>
      </nav>
      {drawerOpen && <div className="absolute inset-0 z-[calc(var(--z-web-chrome)-1)] hidden bg-scrim max-sm:block" onClick={close} aria-hidden="true" />}
    </>
  );
}
