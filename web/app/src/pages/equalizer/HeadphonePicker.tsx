import { Headphones, Loader2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n';
import { headphoneIndex, headphoneProfile, searchHeadphones, type HeadphoneEntry } from '@/playback/dsp/autoeq';
import { useMastering } from '@/playback/equalizer';
import { Strip } from './hardware';

/**
 * Headphone correction: search the AutoEQ list, pick a model, and its
 * correction EQ fills the bands (and is kept as a preset, "🎧 name").
 */
export function HeadphonePicker({ onApplied }: { onApplied: (name: string) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<HeadphoneEntry[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const preset = useMastering((s) => s.settings.preset);

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
      const store = useMastering.getState();
      store.importApo(text);
      store.savePreset(`🎧 ${entry.name}`);
      onApplied(entry.name);
      setQuery('');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setState('error');
    } finally {
      setBusy(null);
    }
  };

  const current = preset.startsWith('🎧 ') ? preset.slice(3) : null;

  return (
    <Strip title={t('autoeq.title')} detail={t('autoeq.detail')} wide={false} free>
      <div className="flex flex-col gap-1.5">
        {current && (
          <span className="inline-flex items-center gap-1.5 truncate rounded-[6px] bg-key/15 px-2 py-1 type-[600_12px/16px] text-key">
            <Headphones size={13} /> {current}
          </span>
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
    </Strip>
  );
}
