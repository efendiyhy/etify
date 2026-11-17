import { Check, ChevronDown, Search, Star, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage, useT } from '@/lib/i18n';
import { PRESET_GROUPS, PRESETS, presetGroup, type PresetGroup } from '@/playback/dsp/presets';
import { useMastering } from '@/playback/equalizer';

type GroupId = PresetGroup | 'mine';

interface Row {
  id: string;
  name: string;
  desc?: string;
  group: GroupId;
  custom?: boolean;
}

/**
 * The preset browser: a button that opens a panel with the groups down the
 * left (Basics, Audiophile, Genres, DJ & Sound Horeg, Nusantara, Space, and
 * the listener's own) and their presets on the right, each with a line on
 * how it sounds; a search across all of them on top.
 */
export function PresetPicker() {
  const t = useT();
  const lang = useLanguage((s) => s.lang);
  const preset = useMastering((s) => s.settings.preset);
  const custom = useMastering((s) => s.custom);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const rows = useMemo<Row[]>(
    () => [
      ...PRESETS.map((p) => ({ id: p.id, name: p.name[lang], desc: p.desc?.[lang], group: presetGroup(p) as GroupId })),
      ...custom.map((p) => ({ id: p.name, name: p.name, group: 'mine' as GroupId, custom: true })),
    ],
    [custom, lang],
  );
  const current = rows.find((r) => r.id === preset);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="inline-flex h-7 flex-none items-center gap-1.5 rounded-[5px] border border-black/50 bg-[linear-gradient(180deg,#3a3842,#24222b)] ps-2.5 pe-2 text-[11px]/[1] font-bold tracking-wide text-white/85 uppercase shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.5)] active:translate-y-px"
      >
        {t('presets.browse')}
        <ChevronDown size={14} strokeWidth={2.4} />
      </button>
      {anchor && <PresetPanel anchor={anchor} rows={rows} current={current} onClose={() => setAnchor(null)} />}
    </>
  );
}

function PresetPanel({ anchor, rows, current, onClose }: { anchor: HTMLElement; rows: Row[]; current: Row | undefined; onClose: () => void }) {
  const t = useT();
  const lang = useLanguage((s) => s.lang);
  const { setPreset, deletePreset } = useMastering.getState();
  const [group, setGroup] = useState<GroupId>(current?.group ?? 'basic');
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const groups = [
    ...PRESET_GROUPS.map((g) => ({ id: g.id as GroupId, icon: g.icon, name: g.name[lang], detail: g.detail[lang] })),
    { id: 'mine' as GroupId, icon: '⭐', name: t('presets.mine'), detail: t('presets.mineDetail') },
  ];
  const count = (id: GroupId) => rows.filter((r) => r.group === id).length;
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.desc?.toLowerCase().includes(q)) : rows.filter((r) => r.group === group);
  const active = groups.find((g) => g.id === group)!;

  // Under the button, kept inside the window.
  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(720, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = window.innerHeight - rect.bottom - 16;
    const top = below > 360 ? rect.bottom + 6 : Math.max(8, rect.top - Math.min(560, window.innerHeight - 24) - 6);
    setPosition({ left, top, width, maxHeight: Math.min(560, window.innerHeight - top - 12) });
  }, [anchor]);

  useEffect(() => {
    search.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  const pick = (row: Row) => {
    setPreset(row.id);
    onClose();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[calc(var(--z-contextual-menus)-1)]" onPointerDown={onClose} aria-hidden="true" />
      <div
        ref={panel}
        data-rack
        role="dialog"
        aria-label={t('eq.preset')}
        className="fixed z-(--z-contextual-menus) flex animate-menu-in flex-col overflow-hidden rounded-[12px] border border-white/10 bg-[linear-gradient(180deg,#241a3a,#140d24)] shadow-[0_20px_60px_rgb(0_0_0/0.6),inset_0_1px_0_rgb(255_255_255/0.08)]"
        style={position}
      >
        {/* Search and the current preset. */}
        <div className="flex items-center gap-2 border-b border-black/40 px-3 py-2.5 shadow-[0_1px_0_rgb(255_255_255/0.05)]">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] bg-black/35 px-2.5 py-1.5 shadow-[inset_0_1px_3px_rgb(0_0_0/0.6)]">
            <Search size={15} className="flex-none text-white/50" />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder={t('presets.search')}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px]/[18px] text-white outline-none placeholder:text-white/35"
            />
          </label>
          {current && (
            <span className="hidden max-w-[220px] truncate rounded-[6px] bg-key/20 px-2 py-1 text-[11px]/[14px] font-semibold text-key sm:block">
              ▶ {current.name}
            </span>
          )}
          <button className="grid size-7 flex-none place-items-center rounded-full text-white/60 hover:bg-white/10" aria-label={t('presets.close')} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 max-sm:flex-col">
          {/* The groups: a column on the left, a row of chips on a phone. */}
          {!q && (
            <nav className="flex flex-none gap-1 overflow-auto border-black/40 p-2 sm:w-[220px] sm:flex-col sm:border-e max-sm:border-b" aria-label={t('presets.groups')}>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGroup(g.id)}
                  aria-pressed={group === g.id}
                  className="flex flex-none items-center gap-2 rounded-[8px] px-2.5 py-2 text-start transition-colors hover:bg-white/8 aria-pressed:bg-[linear-gradient(90deg,rgb(139_108_240/0.45),rgb(139_108_240/0.15))] aria-pressed:shadow-[inset_0_0_0_1px_rgb(185_163_255/0.45)]"
                >
                  <span className="text-[17px]/[1]" aria-hidden="true">
                    {g.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]/[17px] font-semibold text-white/90">{g.name}</span>
                  <span className="rounded-full bg-black/35 px-1.5 text-[10px]/[16px] font-bold text-white/55 tabular-nums max-sm:hidden">{count(g.id)}</span>
                </button>
              ))}
            </nav>
          )}

          {/* The presets of the group (or the search's hits). */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!q && (
              <div className="px-3 pt-3 pb-1.5">
                <p className="text-[15px]/[20px] font-bold text-white">
                  {active.icon} {active.name}
                </p>
                <p className="text-[11.5px]/[15px] text-white/55">{active.detail}</p>
              </div>
            )}
            <ul className="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {shown.length === 0 && <li className="px-2 py-6 text-center text-[12px]/[16px] text-white/45">{q ? t('autoeq.none') : t('presets.mineEmpty')}</li>}
              {shown.map((row) => {
                const on = row.id === current?.id;
                const g = groups.find((x) => x.id === row.group);
                return (
                  <li key={`${row.group}:${row.id}`} className="group/row flex items-center gap-1">
                    <button
                      onClick={() => pick(row)}
                      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-start transition-colors hover:bg-white/8 ${on ? 'bg-key/15 shadow-[inset_0_0_0_1px_rgb(185_163_255/0.4)]' : ''}`}
                    >
                      <span className="grid size-5 flex-none place-items-center">
                        {on ? <Check size={15} className="text-key" strokeWidth={3} /> : row.custom ? <Star size={13} className="text-[#ffcf4a]" /> : null}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13px]/[18px] font-semibold text-white/92">{row.name}</span>
                        {row.desc && <span className="truncate text-[11px]/[15px] text-white/50">{row.desc}</span>}
                      </span>
                      {q && g && <span className="flex-none rounded-full bg-black/35 px-2 text-[10px]/[18px] text-white/55">{g.icon} {g.name}</span>}
                    </button>
                    {row.custom && (
                      <button
                        className="grid size-7 flex-none place-items-center rounded-full text-[#ff6b6b] opacity-60 hover:bg-white/8 hover:opacity-100"
                        aria-label={`${t('eq.delete')}: ${row.name}`}
                        title={t('eq.delete')}
                        onClick={() => deletePreset(row.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
