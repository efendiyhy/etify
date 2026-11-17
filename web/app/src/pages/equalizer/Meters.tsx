import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import type { MeterReading } from '@/playback/dsp/MasteringChain';
import { getMasteringChain } from '@/playback/equalizer';
import { settingsUi } from '../settingsStyles';

const FLOOR = -60;
const fmt = (db: number, unit: string) => (Number.isFinite(db) && db > -99 ? `${db.toFixed(1)} ${unit}` : `–∞ ${unit}`);
const pct = (db: number) => `${Math.max(0, Math.min(100, ((db - FLOOR) / -FLOOR) * 100))}%`;

function Bar({ label, db }: { label: string; db: number }) {
  const hot = db > -1;
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)_64px] items-center gap-2 type-[500_12px/16px]">
      <span className="text-secondary">{label}</span>
      <span className="relative h-2 overflow-hidden rounded-full bg-quaternary">
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
          style={{ width: pct(db), background: hot ? '#ff5a6a' : 'linear-gradient(90deg, var(--keyColor), #4fd1a5)' }}
        />
      </span>
      <span className={`text-right tabular-nums ${hot ? 'text-[#ff5a6a]' : 'text-primary'}`}>{fmt(db, 'dB')}</span>
    </div>
  );
}

/** Peak, true peak, loudness, correlation and gain reduction, read about 15 times a second. */
export function Meters({ labels }: { labels: [string, string, string, string] }) {
  const t = useT();
  const [m, setM] = useState<MeterReading | null>(null);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      const chain = getMasteringChain();
      if (chain && now - last > 66) {
        last = now;
        setM(chain.readMeters());
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!m) return <p className={`${settingsUi.group} px-4 py-3 type-callout text-secondary`}>{t('eq.metersIdle')}</p>;

  const corr = Math.max(-1, Math.min(1, m.correlation));
  return (
    <section className={`${settingsUi.group} flex flex-col gap-2.5 px-4 py-3`}>
      <Bar label={`${t('eq.peak')} L`} db={m.peakL} />
      <Bar label={`${t('eq.peak')} R`} db={m.peakR} />
      <div className="grid grid-cols-3 gap-3 pt-1 type-[500_12px/16px]">
        {(
          [
            [t('eq.truePeak'), fmt(m.truePeak, 'dBTP')],
            [t('eq.momentary'), fmt(m.momentary, 'LUFS')],
            [t('eq.shortTerm'), fmt(m.shortTerm, 'LUFS')],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-[8px] bg-quaternary px-2.5 py-2">
            <span className="truncate text-secondary">{label}</span>
            <span className="type-[600_15px/20px] tabular-nums text-primary">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 pt-1 type-[500_12px/16px]">
        <span className="flex justify-between text-secondary">
          <span>{t('eq.correlation')}</span>
          <span className="tabular-nums text-primary">{corr.toFixed(2)}</span>
        </span>
        <span className="relative h-2 rounded-full bg-[linear-gradient(90deg,#ff5a6a,#ffd25a_50%,#4fd1a5)] opacity-80">
          <span className="absolute top-1/2 size-3 -translate-1/2 rounded-full border-2 border-white bg-black/60" style={{ left: `${((corr + 1) / 2) * 100}%` }} />
        </span>
      </div>
      <div className="flex flex-col gap-1 pt-1 type-[500_12px/16px]">
        <span className="text-secondary">{t('eq.reduction')}</span>
        <div className="grid grid-cols-4 gap-2">
          {m.reduction.map((db, i) => (
            <div key={labels[i]} className="flex flex-col items-center gap-1">
              <span className="relative h-12 w-3 overflow-hidden rounded-full bg-quaternary">
                <span className="absolute inset-x-0 top-0 bg-[#ff9f5a]" style={{ height: `${Math.min(100, (-db / 12) * 100)}%` }} />
              </span>
              <span className="tabular-nums text-primary">{db.toFixed(1)}</span>
              <span className="text-tertiary">{labels[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
