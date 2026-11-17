import { Check, Mic2, Moon, Radio } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { Menu, MenuHeader, MenuItem, MenuSeparator, type MenuPlacement } from '@/components/Menu';
import { useT } from '@/lib/i18n';
import { djSupported, useDj, type DjEvery } from '@/playback/dj';
import { useMastering } from '@/playback/equalizer';
import { formatRemaining, useSleepTimer } from '@/playback/sleepTimer';
import { useUi } from '@/state/ui';

const MINUTES = [5, 15, 30, 45, 60, 90];

/** The moon in the player: the sleep timer and the AI DJ. Lit while either is on. */
export function NightMenu({ className, placement = 'above-end' }: { className: string; placement?: MenuPlacement }) {
  const t = useT();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const { endsAt, endOfTrack, remaining, start, startEndOfTrack, cancel } = useSleepTimer();
  const dj = useDj();
  const sleeping = endsAt !== null || endOfTrack;
  const label = t('night.button');

  return (
    <>
      <button
        className={`${className} relative`}
        aria-label={label}
        title={sleeping && remaining !== null ? `${label} · ${t('sleep.left', { time: formatRemaining(remaining) })}` : label}
        aria-pressed={sleeping || dj.enabled}
        aria-haspopup="menu"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        {dj.enabled && !sleeping ? <Radio size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
        {dj.speaking && <span className="absolute top-1 right-1 size-1.5 animate-pulse rounded-full bg-key" />}
      </button>
      {anchor && (
        <Menu anchor={anchor} placement={placement} onClose={close} label={label}>
          <MenuHeader>
            {t('sleep.title')}
            {endsAt !== null && remaining !== null && ` · ${t('sleep.left', { time: formatRemaining(remaining) })}`}
            {endOfTrack && ` · ${t('sleep.waiting')}`}
          </MenuHeader>
          {MINUTES.map((n) => (
            <MenuItem key={n} onSelect={() => (start(n), close())}>
              {t('sleep.minutes', { n })}
            </MenuItem>
          ))}
          <MenuItem checked={endOfTrack} onSelect={() => (startEndOfTrack(), close())}>
            {t('sleep.endOfTrack')}
          </MenuItem>
          {sleeping && (
            <MenuItem destructive onSelect={() => (cancel(), close())}>
              {t('sleep.off')}
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuHeader>{t('dj.title')}</MenuHeader>
          {djSupported() ? (
            <>
              <MenuItem icon={dj.enabled ? <Check size={15} /> : <Radio size={15} />} onSelect={() => dj.setEnabled(!dj.enabled)}>
                {dj.enabled ? `${t('dj.title')}: On` : `${t('dj.title')}: Off`}
              </MenuItem>
              {([1, 2, 3] as DjEvery[]).map((n) => (
                <MenuItem key={n} checked={dj.every === n} disabled={!dj.enabled} onSelect={() => dj.setEvery(n)}>
                  {t(n === 1 ? 'dj.every1' : n === 2 ? 'dj.every2' : 'dj.every3')}
                </MenuItem>
              ))}
              <MenuItem onSelect={() => (dj.speakNow(), close())}>{t('dj.preview')}</MenuItem>
              <MenuItem onSelect={() => (close(), void navigate('/settings/dj'))}>{t('dj.settings')}</MenuItem>
            </>
          ) : (
            <MenuItem disabled onSelect={() => {}}>
              {t('dj.unsupported')}
            </MenuItem>
          )}
        </Menu>
      )}
    </>
  );
}

/** The microphone in the player: karaoke on (voice out) and the lyrics full screen; off again. */
export function KaraokeButton({ className }: { className: string }) {
  const t = useT();
  const on = useMastering((s) => s.settings.enabled && s.settings.karaoke.on);
  return (
    <button
      className={className}
      aria-label={t('karaoke.title')}
      title={t('karaoke.title')}
      aria-pressed={on}
      onClick={() => {
        useMastering.getState().update((s) => ({ ...s, enabled: true, karaoke: { ...s.karaoke, on: !on } }));
        if (!on) useUi.getState().setFullScreen(true);
      }}
    >
      <Mic2 size={17} strokeWidth={2} />
    </button>
  );
}
