import { Home, LayoutGrid, Settings } from 'lucide-react';
import { MdOutlineExtension } from 'react-icons/md';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { PrefetchLink, PrefetchNavLink } from '@/components/PrefetchLink';
import { LogoMark } from '@/components/icons/LogoMark';
import { SearchField } from '@/components/music/SearchField';
import { useT } from '@/lib/i18n';
import { useExtensionUpdate } from '@/extension/useExtensionUpdate';

const roundButton =
  'grid size-12 flex-none place-items-center rounded-full bg-panel-elevated text-secondary transition-[color,transform] hover:scale-[1.04] hover:text-primary aria-[current=page]:text-primary';
const iconButton =
  'relative grid size-9 place-items-center rounded-full text-secondary transition-colors hover:bg-panel-elevated hover:text-primary aria-[current=page]:text-primary';

/**
 * The search pill, with the search field's suggestions: a search from any
 * page goes to /search with the query in the URL, where the results follow it.
 */
function SearchPill() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onSearch = location.pathname === '/search';
  const query = onSearch ? (params.get('q') ?? '') : '';
  return (
    <SearchField
      variant="pill"
      initial={query}
      onSearch={(q) => navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search', { replace: onSearch })}
    />
  );
}

/** The bar across the top: the mark, Home and the search pill, then the extension and settings. */
export function TopBar() {
  const t = useT();
  const update = useExtensionUpdate();
  return (
    <header className="grid h-(--topBarHeight) grid-cols-[minmax(0,1fr)_minmax(0,560px)_minmax(0,1fr)] items-center gap-2 px-2 max-sm:hidden">
      <PrefetchLink to="/home" className="inline-flex items-center gap-2 justify-self-start rounded-[6px] px-3" aria-label="Etify, Home">
        <LogoMark size={30} className="text-key" />
        <span className="type-[800_20px/24px] tracking-[-0.02em] max-md:hidden">Etify</span>
      </PrefetchLink>
      <div className="flex items-center gap-2">
        <PrefetchNavLink to="/home" className={roundButton} aria-label={t('nav.home')} title={t('nav.home')}>
          <Home size={24} strokeWidth={2} />
        </PrefetchNavLink>
        <SearchPill />
        <PrefetchNavLink to="/new" className={roundButton} aria-label={t('nav.new')} title={t('nav.new')}>
          <LayoutGrid size={22} strokeWidth={2} />
        </PrefetchNavLink>
      </div>
      <div className="flex items-center gap-1 justify-self-end pr-2">
        <PrefetchNavLink to="/extension" className={iconButton} aria-label={t('nav.extension')} title={t('nav.extension')}>
          <MdOutlineExtension size={20} />
          {update.state === 'available' && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-key" aria-label="Update available" />}
        </PrefetchNavLink>
        <PrefetchNavLink to="/settings" className={iconButton} aria-label={t('nav.settings')} title={t('nav.settings')}>
          <Settings size={19} strokeWidth={1.9} />
        </PrefetchNavLink>
      </div>
    </header>
  );
}
