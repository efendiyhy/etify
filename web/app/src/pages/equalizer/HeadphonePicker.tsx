import { Headphones, Loader2, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { headphoneIndex, headphoneProfile, searchHeadphones, type HeadphoneEntry } from '@/playback/dsp/autoeq';
import { useMastering } from '@/playback/equalizer';
import { Strip } from './hardware';

/**
 * Headphone correction: search the AutoEQ list, pick a model, and its
 * correction EQ fills the bands (and is kept as a preset, "🎧 name").
 */
export function HeadphonePicker({ onApplied }: { onApplied: (name: string) => void }) {
  return <HeadphonePickerBody onApplied={onApplied} frame={(props) => <Strip {...props} free />} />;
}

type Frame = (props: { title: string; detail: string; on: boolean; onToggle?: (on: boolean) => void; children: ReactNode }) => ReactNode;

/** The picker itself, inside whatever [frame] the page gives it (a strip, a rack section). */
export function HeadphonePickerBody({ onApplied, frame }: { onApplied: (name: string) => void; frame: Frame }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<HeadphoneEntry[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const headphone = useMastering((s) => s.settings.headphone);

  // The list loads the first time the field is used.
  useEffect(() => {
    if (!query || all || state === 'loading') return;
    setState('loading');
    headphoneIndex()
      .then((list) => {
        setAll(list);
        setState('idle');
      })
      .catch((e: unknown) => {
        setError(String(e instanceof Error ? e.message : e));
        setState('error');
      });
  }, [query, all, state]);

  const results = useMemo(() => (all ? searchHeadphones(all, query, 30) : []), [all, query]);

  const apply = async (entry: HeadphoneEntry) => {
    setBusy(entry.path);
    try {
      const text = await headphoneProfile(entry);
      useMastering.getState().setHeadphone(entry.name, text);
      onApplied(entry.name);
      setQuery('');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setState('error');
    } finally {
      setBusy(null);
    }
  };

  const store = useMastering.getState();

  return (
    frame({
      title: t('autoeq.title'),
      detail: t('autoeq.detail'),
      on: headphone?.on ?? true,
      onToggle: headphone ? store.toggleHeadphone : undefined,
      children: (
      <div className="flex flex-col gap-1.5">
        {headphone && (
          <div
            className={`flex items-center gap-1.5 rounded-[6px] px-2 py-1 type-[600_12px/16px] ${headphone.on ? 'bg-key/15 text-key' : 'bg-quaternary text-secondary'}`}
          >
            <Headphones size={13} className="flex-none" />
            <span className="min-w-0 flex-1 truncate">{headphone.name}</span>
            <span className="flex-none type-[500_10px/12px] opacity-80">{headphone.on ? t('autoeq.active') : t('autoeq.off')}</span>
            <button
              className="grid size-5 flex-none place-items-center rounded-full hover:bg-black/10"
              aria-label={t('autoeq.remove')}
              title={t('autoeq.remove')}
              onClick={store.removeHeadphone}
            >
              <X size={13} />
            </button>
          </div>
        )}
        <label className="flex items-center gap-1.5 rounded-[8px] bg-quaternary px-2 py-1.5">
          <Search size={14} className="flex-none text-secondary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={t('autoeq.search')}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 type-body text-primary outline-none placeholder:text-tertiary"
          />
          {state === 'loading' && <Loader2 size={14} className="animate-spin text-secondary" />}
        </label>
        {state === 'error' && <span className="type-[500_11px/14px] text-[#ff5a6a]">{t('autoeq.failed', { error })}</span>}
        {query && all && (
          <ul className="max-h-[132px] overflow-y-auto rounded-[8px] bg-quaternary/60 scrollbar-soft">
            {results.length === 0 && <li className="px-2 py-1.5 type-[500_12px/16px] text-secondary">{t('autoeq.none')}</li>}
            {results.map((entry) => (
              <li key={entry.path}>
                <button
                  className="flex w-full items-baseline justify-between gap-2 px-2 py-1 text-start hover:bg-quaternary disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => void apply(entry)}
                >
                  <span className="min-w-0 truncate type-[500_12px/16px] text-primary">{entry.name}</span>
                  <span className="flex-none truncate type-[500_10px/12px] text-tertiary">{busy === entry.path ? '…' : entry.source.split(' · ')[0]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      ),
    })
  );
}
