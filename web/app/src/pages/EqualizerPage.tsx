import { RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Select } from '@/components/Select';
import { useLanguage, useT } from '@/lib/i18n';
import {
  bandLabel,
  buildFilters,
  EQ_BANDS,
  EQ_MAX_DB,
  EQ_PRESETS,
  PREAMP_MAX_DB,
  PREAMP_MIN_DB,
  useEqualizer,
} from '@/playback/equalizer';
import { Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const CURVE_W = 600;
const CURVE_H = 160;
const CURVE_POINTS = 240;
const MIN_HZ = 20;
const MAX_HZ = 20000;

const xFor = (hz: number) => (Math.log10(hz / MIN_HZ) / Math.log10(MAX_HZ / MIN_HZ)) * CURVE_W;
const yFor = (db: number) => CURVE_H / 2 - (db / (EQ_MAX_DB + 3)) * (CURVE_H / 2);

/**
 * The response of the settings as drawn: the same filters, measured by the
 * browser itself on an offline context, summed in dB with the preamp.
 */
function useResponse(gains: number[], preampDb: number, enabled: boolean): string {
  const filters = useMemo(() => buildFilters(new OfflineAudioContext(1, 1, 48000)), []);
  const frequencies = useMemo(() => {
    const out = new Float32Array(CURVE_POINTS);
    for (let i = 0; i < CURVE_POINTS; i++) out[i] = MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / (CURVE_POINTS - 1));
    return out;
  }, []);
  return useMemo(() => {
    const total = new Float32Array(CURVE_POINTS).fill(enabled ? preampDb : 0);
    const magnitude = new Float32Array(CURVE_POINTS);
    const phase = new Float32Array(CURVE_POINTS);
    filters.forEach((filter, i) => {
      filter.gain.value = enabled ? (gains[i] ?? 0) : 0;
      filter.getFrequencyResponse(frequencies, magnitude, phase);
      for (let p = 0; p < CURVE_POINTS; p++) total[p]! += 20 * Math.log10(Math.max(magnitude[p]!, 1e-6));
    });
    return Array.from(total, (db, p) => `${p === 0 ? 'M' : 'L'}${xFor(frequencies[p]!).toFixed(1)},${yFor(db).toFixed(1)}`).join(' ');
  }, [filters, frequencies, gains, preampDb, enabled]);
}

function Curve({ gains, preampDb, enabled, label }: { gains: number[]; preampDb: number; enabled: boolean; label: string }) {
  const path = useResponse(gains, preampDb, enabled);
  return (
    <svg viewBox={`0 0 ${CURVE_W} ${CURVE_H}`} className="block h-40 w-full" role="img" aria-label={label} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--keyColor)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--keyColor)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[-12, -6, 0, 6, 12].map((db) => (
        <line key={db} x1="0" x2={CURVE_W} y1={yFor(db)} y2={yFor(db)} stroke="currentColor" strokeOpacity={db === 0 ? 0.25 : 0.08} vectorEffect="non-scaling-stroke" />
      ))}
      {EQ_BANDS.map((hz) => (
        <line key={hz} x1={xFor(hz)} x2={xFor(hz)} y1="0" y2={CURVE_H} stroke="currentColor" strokeOpacity="0.06" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={`${path} L${CURVE_W},${CURVE_H} L0,${CURVE_H} Z`} fill="url(#eq-fill)" opacity={enabled ? 1 : 0.4} />
      <path d={path} fill="none" stroke="var(--keyColor)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" opacity={enabled ? 1 : 0.4} />
    </svg>
  );
}

/** A vertical slider with its value above and its label below. */
function Fader({
  label,
  value,
  min,
  max,
  onChange,
  accent,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  accent?: boolean;
}) {
  const shown = `${value > 0 ? '+' : ''}${value % 1 === 0 ? value : value.toFixed(1)}`;
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span className={`type-[600_12px/16px] tabular-nums ${value === 0 ? 'text-tertiary' : 'text-primary'}`}>{shown}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.5}
        value={value}
        aria-label={`${label} dB`}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        onDoubleClick={() => onChange(0)}
        className="eq-fader h-44 w-7 cursor-pointer"
        style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: accent ? 'var(--systemSecondary)' : 'var(--keyColor)' }}
      />
      <span className={`type-[600_12px/16px] ${accent ? 'text-key' : 'text-secondary'}`}>{label}</span>
    </div>
  );
}

/** Settings › Equalizer: ten bands, a preamp and presets, with the curve they make. */
export default function EqualizerPage() {
  const t = useT();
  const lang = useLanguage((s) => s.lang);
  const { enabled, preset, gains, preampDb, setEnabled, setPreset, setGain, setPreamp, reset } = useEqualizer();

  const presetOptions = [
    ...EQ_PRESETS.map((p) => ({ value: p.id, label: p.name[lang] })),
    ...(preset === 'custom' ? [{ value: 'custom', label: t('eq.custom') }] : []),
  ];

  return (
    <div className={settingsUi.centered}>
      <PageHeader title={t('eq.title')} />
      <div className={settingsUi.body}>
        <section className={settingsUi.group}>
          <Toggle label={t('eq.enable')} detail={t('eq.enableDetail')} checked={enabled} onChange={setEnabled} />
          <label className={settingsUi.controlRow}>
            <span>{t('eq.preset')}</span>
            <Select<string> label={t('eq.preset')} value={preset} options={presetOptions} onChange={setPreset} />
          </label>
        </section>

        <h2 className={settingsUi.sectionHeader}>{t('eq.curve')}</h2>
        <section className={`${settingsUi.group} px-3 py-3 text-primary`}>
          <Curve gains={gains} preampDb={preampDb} enabled={enabled} label={t('eq.curve')} />
          <div className="relative mt-1 h-4 type-[500_11px/14px] text-tertiary">
            {EQ_BANDS.map((hz) => (
              <span key={hz} className="absolute -translate-x-1/2" style={{ left: `${(xFor(hz) / CURVE_W) * 100}%` }}>
                {bandLabel(hz)}
              </span>
            ))}
          </div>
        </section>

        <div className="mt-7 mb-2 flex items-center justify-between px-4">
          <h2 className="type-subhead-emphasized text-secondary uppercase">{t('eq.bands')}</h2>
          <button
            className="inline-flex items-center gap-1.5 rounded-pill bg-quaternary px-3 py-1 type-callout-emphasized text-primary hover:brightness-125"
            onClick={reset}
          >
            <RotateCcw size={14} strokeWidth={2.2} />
            {t('common.reset')}
          </button>
        </div>
        <section className={`${settingsUi.group} overflow-x-auto px-3 py-5 [scrollbar-width:none]`} aria-disabled={!enabled}>
          <div className={`grid min-w-[560px] grid-cols-[repeat(11,minmax(0,1fr))] gap-1 ${enabled ? '' : 'opacity-50'}`}>
            <Fader label={t('eq.preamp')} value={preampDb} min={PREAMP_MIN_DB} max={PREAMP_MAX_DB} onChange={setPreamp} accent />
            {EQ_BANDS.map((hz, i) => (
              <Fader key={hz} label={bandLabel(hz)} value={gains[i] ?? 0} min={-EQ_MAX_DB} max={EQ_MAX_DB} onChange={(db) => setGain(i, db)} />
            ))}
          </div>
        </section>
        <p className={settingsUi.footer}>{t('eq.footer')}</p>
      </div>
    </div>
  );
}
