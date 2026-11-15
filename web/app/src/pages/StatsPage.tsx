import { Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Artwork } from '@/components/music/Artwork';
import { useT, type I18nKey } from '@/lib/i18n';
import { shareImage, statsCard } from '@/lib/shareCard';
import { summarize, type StatsPeriod } from '@/playback/listeningStats';

const PERIODS: { id: StatsPeriod; label: I18nKey }[] = [
  { id: 'week', label: 'stats.week' },
  { id: 'month', label: 'stats.month' },
  { id: 'year', label: 'stats.year' },
  { id: 'all', label: 'stats.all' },
];

const chip =
  'rounded-pill bg-panel-elevated px-4 py-1.5 type-callout-emphasized text-primary transition-colors hover:brightness-110 aria-pressed:bg-primary aria-pressed:text-page';
const card = 'rounded-xl bg-quinary p-5';

/** Minutes per day as bars, with the day's number under the first and last. */
function DayChart({ days }: { days: { day: string; minutes: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.minutes));
  return (
    <div className="flex h-36 items-end gap-1">
      {days.map(({ day, minutes }) => (
        <div key={day} className="group/bar relative flex h-full flex-1 flex-col justify-end" title={`${day}: ${minutes} min`}>
          <div
            className="rounded-t-[4px] bg-key-bg transition-[height] duration-300 group-hover/bar:brightness-125"
            style={{ height: `${Math.max(minutes > 0 ? 4 : 1, (minutes / max) * 100)}%`, opacity: minutes > 0 ? 1 : 0.25 }}
          />
        </div>
      ))}
    </div>
  );
}

/** Your listening on this browser: totals, top songs and artists, minutes per day, and a card to share. */
export default function StatsPage() {
  const t = useT();
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [sharing, setSharing] = useState(false);
  const stats = useMemo(() => summarize(period), [period]);
  const minutes = Math.round(stats.totalSeconds / 60);
  const periodLabel = t(PERIODS.find((p) => p.id === period)!.label);

  const share = async () => {
    setSharing(true);
    try {
      const blob = await statsCard({
        heading: `${t('stats.title')} · ${periodLabel}`,
        minutesLabel: t('stats.minutes'),
        minutes,
        topTitle: t('stats.topSongs'),
        top: stats.songs.slice(0, 5).map((s) => `${s.title} — ${s.artists[0] ?? ''}`),
        artwork: stats.songs[0]?.artwork ?? null,
        caption: t('share.listening'),
      });
      await shareImage(blob, 'etify-stats.png');
    } catch {
      alert(t('share.failed'));
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="mb-16">
      <PageHeader title={t('stats.title')} />
      <div className="mx-(--body-gutter) mt-5 flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button key={p.id} className={chip} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
            {t(p.label)}
          </button>
        ))}
        {minutes > 0 && (
          <button
            className="ml-auto inline-flex items-center gap-2 rounded-pill bg-key-bg px-4 py-1.5 type-callout-emphasized text-white hover:brightness-110 disabled:opacity-60"
            onClick={() => void share()}
            disabled={sharing}
          >
            <Share2 size={15} strokeWidth={2.2} />
            {sharing ? t('share.making') : t('stats.share')}
          </button>
        )}
      </div>

      {minutes === 0 ? (
        <p className="mx-(--body-gutter) mt-16 text-center type-body text-secondary">{t('stats.empty')}</p>
      ) : (
        <>
          <div className="mx-(--body-gutter) mt-6 grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <div className={card}>
              <p className="type-callout-emphasized text-secondary">{t('stats.minutes')}</p>
              <p className="mt-1 type-[800_40px/44px] text-key tabular-nums">{minutes.toLocaleString()}</p>
            </div>
            <div className={card}>
              <p className="type-callout-emphasized text-secondary">{t('stats.songs')}</p>
              <p className="mt-1 type-[800_40px/44px] tabular-nums">{stats.songs.length.toLocaleString()}</p>
            </div>
            <div className={card}>
              <p className="type-callout-emphasized text-secondary">{t('stats.artists')}</p>
              <p className="mt-1 type-[800_40px/44px] tabular-nums">{stats.artists.length.toLocaleString()}</p>
            </div>
          </div>

          <div className={`mx-(--body-gutter) mt-3 ${card}`}>
            <p className="mb-3 type-callout-emphasized text-secondary">
              {t('stats.perDay')} · {period === 'week' ? t('stats.week') : t('stats.month')}
            </p>
            <DayChart days={stats.days} />
          </div>

          <div className="mx-(--body-gutter) mt-3 grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            <section className={card}>
              <h2 className="mb-3 type-title-3-emphasized">{t('stats.topSongs')}</h2>
              <ol className="flex flex-col gap-2">
                {stats.songs.slice(0, 10).map((song, i) => (
                  <li key={song.videoId} className="grid grid-cols-[24px_48px_minmax(0,1fr)_auto] items-center gap-3">
                    <span className="text-center type-body-emphasized text-secondary tabular-nums">{i + 1}</span>
                    <Artwork src={song.artwork} displayWidth={48} radius="6px" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate type-body-emphasized">{song.title}</span>
                      <span className="truncate type-callout text-secondary">{song.artists.join(', ')}</span>
                    </span>
                    <span className="text-right type-callout text-secondary tabular-nums">
                      {t('stats.min', { n: Math.round(song.seconds / 60) })}
                      {song.plays > 0 && <span className="block">{t('stats.plays', { n: song.plays })}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section className={card}>
              <h2 className="mb-3 type-title-3-emphasized">{t('stats.topArtists')}</h2>
              <ol className="flex flex-col gap-2">
                {stats.artists.slice(0, 10).map((artist, i) => (
                  <li key={artist.name} className="grid grid-cols-[24px_48px_minmax(0,1fr)_auto] items-center gap-3">
                    <span className="text-center type-body-emphasized text-secondary tabular-nums">{i + 1}</span>
                    <Artwork src={artist.artwork} displayWidth={48} radius="50%" />
                    <span className="truncate type-body-emphasized">{artist.name}</span>
                    <span className="type-callout text-secondary tabular-nums">{t('stats.min', { n: Math.round(artist.seconds / 60) })}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}
      <p className="mx-(--body-gutter) mt-6 type-callout text-tertiary">{t('stats.footer')}</p>
    </div>
  );
}
