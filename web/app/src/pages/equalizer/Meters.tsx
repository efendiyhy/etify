import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import type { MeterReading } from '@/playback/dsp/MasteringChain';
import { getMasteringChain } from '@/playback/equalizer';
import { settingsUi } from '../settingsStyles';
import { Lcd, LedMeter } from './hardware';

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

/** The chain's meters, read about 15 times a second; null until something has played. */
export function useMeterReading(): MeterReading | null {
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
  return m;
}

/** Peak, true peak, loudness, correlation and gain reduction, read about 15 times a second. */
export function Meters({ labels, stacked }: { labels: [string, string, string, string]; /** A narrow column: the readouts one per row. */ stacked?: boolean }) {
  const t = useT();
  const m = useMeterReading();

  if (!m) return <p className={`${settingsUi.group} h-full px-4 py-3 type-callout text-secondary`}>{t('eq.metersIdle')}</p>;

  const corr = Math.max(-1, Math.min(1, m.correlation));
  return (
    <section className={`${settingsUi.group} flex h-full flex-col gap-2.5 px-4 py-3`}>
      <Bar label={`${t('eq.peak')} L`} db={m.peakL} />
      <Bar label={`${t('eq.peak')} R`} db={m.peakR} />
      <div className={`grid gap-2 pt-1 type-[500_12px/16px] ${stacked ? 'grid-cols-1' : 'grid-cols-3 gap-3'}`}>
        {(
          [
            [t('eq.truePeak'), fmt(m.truePeak, 'dBTP')],
            [t('eq.momentary'), fmt(m.momentary, 'LUFS')],
            [t('eq.shortTerm'), fmt(m.shortTerm, 'LUFS')],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className={`flex gap-0.5 rounded-[8px] bg-quaternary px-2.5 py-2 ${stacked ? 'items-baseline justify-between' : 'flex-col'}`}>
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

/**
 * The rack's meter bridge: LED peak meters for left and right, the true
 * peak and loudness on backlit readouts, and the phase correlation.
 */
export function MeterBridge() {
  const t = useT();
  const m = useMeterReading();
  const idle = !m;
  const corr = Math.max(-1, Math.min(1, m?.correlation ?? 0));
  return (
    <div className="flex h-full flex-col gap-2" title={idle ? t('eq.metersIdle') : undefined}>
      <div className="flex items-end justify-center gap-2">
        <div className="flex flex-col justify-between self-stretch pb-4 text-right font-mono text-[8px]/[8px] text-white/40" aria-hidden="true">
          {['0', '-6', '-12', '-24', '-36', '-48', '-60'].map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>
        <LedMeter db={m?.peakL ?? -99} label={`${t('eq.peak')} L`} />
        <LedMeter db={m?.peakR ?? -99} label={`${t('eq.peak')} R`} />
      </div>
      <Lcd label={t('eq.truePeak')} value={fmt(m?.truePeak ?? -100, 'dBTP')} color={(m?.truePeak ?? -100) > -1 ? '#ff6b6b' : undefined} />
      <div className="grid grid-cols-2 gap-1.5">
        <Lcd label={t('eq.momentary')} value={fmt(m?.momentary ?? -100, 'LU')} color="#ffcf4a" />
        <Lcd label={t('eq.shortTerm')} value={fmt(m?.shortTerm ?? -100, 'LU')} color="#ffcf4a" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="flex justify-between text-[9px]/[10px] font-bold tracking-[0.12em] text-white/55 uppercase">
          <span>{t('eq.correlation')}</span>
          <span className="font-mono tabular-nums text-white/80">{corr.toFixed(2)}</span>
        </span>
        <span className="rack-screen relative block h-3 rounded-[3px]">
          <span className="absolute inset-[3px] rounded-[2px] bg-[linear-gradient(90deg,#ff3b4e,#ffc23a_50%,#3ddc84)] opacity-35" />
          <span className="absolute inset-y-[1px] left-1/2 w-px bg-white/30" />
          <span
            className="absolute inset-y-[1px] w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_5px_#fff]"
            style={{ left: `${((corr + 1) / 2) * 100}%` }}
          />
        </span>
        <span className="flex justify-between font-mono text-[8px]/[8px] text-white/40">
          <span>-1</span>
          <span>0</span>
          <span>+1</span>
        </span>
      </div>
    </div>
  );
}

/** Gain reduction as amber LED columns that fall from the top: the compressor bands and the limiter. */
export function GainReductionMeters({ labels }: { labels: [string, string, string, string] }) {
  const t = useT();
  const m = useMeterReading();
  const SEGMENTS = 12;
  return (
    <div className="flex flex-col items-center gap-1" title={t('eq.reduction')}>
      <span className="text-[9px]/[10px] font-bold tracking-[0.12em] text-white/55 uppercase">{t('eq.reduction')}</span>
      <div className="flex gap-2">
        {labels.map((label, i) => {
          const db = m?.reduction[i] ?? 0;
          const lit = Math.round(Math.min(1, -db / 12) * SEGMENTS);
          return (
            <div key={label} className="flex flex-col items-center gap-1" role="meter" aria-label={`${t('eq.reduction')} ${label}`} aria-valuenow={db} aria-valuemin={-12} aria-valuemax={0}>
              <div className="rack-screen flex h-[104px] flex-col gap-[2px] rounded-[3px] p-[3px]">
                {Array.from({ length: SEGMENTS }, (_, k) => (
                  <span
                    key={k}
                    className="w-2.5 flex-1 rounded-[1px]"
                    style={k < lit ? { background: '#ffb020', boxShadow: '0 0 4px #ffb020' } : { background: '#ffb020', opacity: 0.12 }}
                  />
                ))}
              </div>
              <span className="font-mono text-[9px]/[10px] tabular-nums text-white/80">{db.toFixed(1)}</span>
              <span className="max-w-12 truncate text-[8.5px]/[10px] font-bold tracking-[0.1em] text-white/55 uppercase">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
