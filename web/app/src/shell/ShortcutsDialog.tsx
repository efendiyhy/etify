import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useT, type I18nKey } from '@/lib/i18n';
import { useUi } from '@/state/ui';

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

const GROUPS: { keys: string[]; label: I18nKey }[][] = [
  [
    { keys: ['Space'], label: 'shortcuts.playPause' },
    { keys: [mod, '→'], label: 'shortcuts.next' },
    { keys: [mod, '←'], label: 'shortcuts.previous' },
    { keys: ['→'], label: 'shortcuts.seekForward' },
    { keys: ['←'], label: 'shortcuts.seekBack' },
    { keys: [mod, '↑'], label: 'shortcuts.volumeUp' },
    { keys: [mod, '↓'], label: 'shortcuts.volumeDown' },
    { keys: ['M'], label: 'shortcuts.mute' },
    { keys: ['S'], label: 'shortcuts.shuffle' },
    { keys: ['R'], label: 'shortcuts.repeat' },
  ],
  [
    { keys: ['L'], label: 'shortcuts.lyrics' },
    { keys: ['Q'], label: 'shortcuts.queue' },
    { keys: ['F'], label: 'shortcuts.fullScreen' },
    { keys: ['I'], label: 'shortcuts.miniPlayer' },
    { keys: ['/'], label: 'shortcuts.search' },
    { keys: ['Esc'], label: 'shortcuts.close' },
    { keys: ['?'], label: 'shortcuts.help' },
  ],
];

/** Every keyboard shortcut, in a dialog opened with "?". */
export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen);
  const setOpen = useUi((s) => s.setShortcutsOpen);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-(--z-modal) grid animate-fade place-items-center bg-scrim p-4" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.title')}
        className="w-[min(720px,100%)] animate-zoom rounded-xl bg-panel p-6 shadow-[0_24px_64px_rgb(0_0_0/0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="type-title-1-emphasized">{t('shortcuts.title')}</h2>
          <button className="grid size-8 place-items-center rounded-full text-secondary hover:bg-quinary hover:text-primary" aria-label="Close" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-8 max-md:grid-cols-1">
          {GROUPS.map((group, i) => (
            <dl key={i} className="flex flex-col">
              {group.map(({ keys, label }) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-quinary py-2.5">
                  <dt className="type-body text-primary">{t(label)}</dt>
                  <dd className="flex flex-none gap-1">
                    {keys.map((key) => (
                      <kbd key={key} className="min-w-7 rounded-[6px] bg-quaternary px-2 py-0.5 text-center type-[600_13px/20px] text-primary">
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
      </div>
    </div>
  );
}
