import { Download, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Menu, MenuItem } from '@/components/Menu';
import { PageHeader } from '@/components/PageHeader';
import { Select } from '@/components/Select';
import { useLanguage, useT, type I18nKey } from '@/lib/i18n';
import { MasteringChain } from '@/playback/dsp/MasteringChain';
import { PRESETS, toApo, toJson } from '@/playback/dsp/presets';
import {
  MAX_GAIN,
  MAX_HZ,
  MAX_Q,
  MIN_HZ,
  MIN_Q,
  PREAMP_MAX,
  PREAMP_MIN,
  type CompressorBand,
  type EqBand,
  type FilterType,
  type MasteringSettings,
  type Slope,
} from '@/playback/dsp/types';
import { getMasteringChain, useMastering } from '@/playback/equalizer';
import { pill } from './equalizer/controls';
import { BAND_COLORS, EqCanvas } from './equalizer/EqCanvas';
import { Knob, LedButton, Strip } from './equalizer/hardware';
import { Meters } from './equalizer/Meters';
import { Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const TYPES: FilterType[] = ['peaking', 'lowshelf', 'highshelf', 'tilt', 'highpass', 'lowpass', 'notch'];
const hasGain = (type: FilterType) => type === 'peaking' || type === 'lowshelf' || type === 'highshelf' || type === 'tilt';
const hasQ = (band: EqBand) => band.type === 'peaking' || band.type === 'notch' || ((band.type === 'highpass' || band.type === 'lowpass') && band.slope === 12);
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k` : `${Math.round(v)}`);
const hzUnit = (v: number) => `${hz(v)}${v >= 1000 ? 'Hz' : ' Hz'}`;
const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** L 40 · C · R 25: how far the balance leans, in percent. */
const balanceLabel = (v: number) => (Math.abs(v) < 0.005 ? 'C' : `${v < 0 ? 'L' : 'R'} ${Math.round(Math.abs(v) * 100)}`);
/** Frequency knobs turn along a log scale: 0–1000 maps to 20 Hz–20 kHz. */
const toPos = (f: number) => Math.round((Math.log10(f / MIN_HZ) / Math.log10(MAX_HZ / MIN_HZ)) * 1000);
const fromPos = (p: number) => Math.round(MIN_HZ * (MAX_HZ / MIN_HZ) ** (p / 1000));

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The selected band's controls, as a channel strip of knobs. */
function BandEditor({ index, band, solo }: { index: number; band: EqBand; solo: boolean }) {
  const t = useT();
  const { setBand, setSolo } = useMastering.getState();
  const set = (patch: Partial<EqBand>) => setBand(index, patch);
  return (
    <div className="flex flex-col gap-3 border-t border-quaternary px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 type-title-3 text-primary">
          <span className="size-3 rounded-full" style={{ background: BAND_COLORS[index] }} />
          {t('eq.band', { n: index + 1 })}
        </span>
        <LedButton on={band.on} onToggle={(on) => set({ on })} label={t('eq.on')} />
        <LedButton on={solo} onToggle={(on) => setSolo(on ? index : null)} label={t('eq.solo')} tone="amber">
          {t('eq.solo')}
        </LedButton>
        <span className="flex-1" />
        <Select<FilterType>
          label={t('eq.type')}
          value={band.type}
          options={TYPES.map((type) => ({ value: type, label: t(`eq.type.${type}` as I18nKey) }))}
          onChange={(type) => set({ type })}
        />
        {(band.type === 'highpass' || band.type === 'lowpass') && (
          <Select<Slope>
            label={t('eq.slope')}
            value={band.slope}
            options={([12, 24, 48] as const).map((s) => ({ value: s, label: `${s} dB/oct` }))}
            onChange={(slope) => set({ slope })}
          />
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <Knob
          size={54}
          color={BAND_COLORS[index]}
          label={t('eq.freq')}
          value={toPos(band.freq)}
          min={0}
          max={1000}
          step={1}
          format={(p) => hzUnit(fromPos(p))}
          onChange={(p) => set({ freq: fromPos(p) })}
        />
        <Knob
          size={54}
          color={BAND_COLORS[index]}
          label={t('eq.gain')}
          value={band.gain}
          min={-MAX_GAIN}
          max={MAX_GAIN}
          step={0.1}
          format={db}
          reset={0}
          bipolar
          disabled={!hasGain(band.type)}
          onChange={(gain) => set({ gain })}
        />
        <Knob
          size={54}
          color={BAND_COLORS[index]}
          label={t('eq.q')}
          value={band.q}
          min={MIN_Q}
          max={MAX_Q}
          step={0.01}
          reset={1.41}
          disabled={!hasQ(band)}
          onChange={(q) => set({ q })}
        />
      </div>
    </div>
  );
}

/** A mixer's vertical fader with a cap and its scale; it fills its strip's width. */
function Fader({ label, value, min, max, onChange, color, disabled }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; color?: string; disabled?: boolean }) {
  return (
    <div className={`flex w-full flex-col items-center gap-1 ${disabled ? 'opacity-40' : ''}`}>
      <span className="type-[600_10px/12px] tabular-nums text-primary">{`${value > 0 ? '+' : ''}${value.toFixed(1)}`}</span>
      <div className="relative h-36 w-full max-w-9">
        {/* The slot and its scale. */}
        <span className="absolute inset-y-1 left-1/2 w-1 -translate-x-1/2 rounded-full bg-black/50 shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]" />
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <span key={p} className="absolute left-0 h-px w-1 bg-tertiary" style={{ top: `calc(${p} * (100% - 8px) + 4px)` }} />
        ))}
        <input
          type="range"
          min={min}
          max={max}
          step={0.5}
          value={value}
          disabled={disabled}
          aria-label={`${label} dB`}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          onDoubleClick={() => onChange(0)}
          className="mixer-fader absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', ['--cap' as string]: color ?? 'var(--keyColor)' }}
        />
      </div>
    </div>
  );
}

/** A small lit power button: only the LED, for the mixer's narrow strips. */
function LedDot({ on, onToggle, label, tone = '#3ddc84' }: { on: boolean; onToggle: (on: boolean) => void; label: string; tone?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => onToggle(!on)}
      className="grid h-5 w-full max-w-8 place-items-center rounded-[5px] border border-black/40 bg-[linear-gradient(180deg,#3a3842,#24222b)] shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.35)] active:translate-y-px"
    >
      <span
        className="size-2 rounded-full"
        style={on ? { background: tone, boxShadow: `0 0 6px 1px ${tone}` } : { background: '#14131a', boxShadow: 'inset 0 1px 1px rgb(0 0 0 / 0.8)' }}
      />
    </button>
  );
}

/**
 * The mixer view: a channel strip per band (on, Q, fader) and the master
 * (balance, preamp), thirteen equal columns that always fit the panel.
 */
function MixerView({ settings, preamp }: { settings: MasteringSettings; preamp: number }) {
  const t = useT();
  const { setBand, update } = useMastering.getState();
  const strip = 'flex min-w-0 flex-col items-center gap-1.5 rounded-[8px] border border-quaternary bg-quinary px-0.5 py-2';
  return (
    <div className="grid grid-cols-[repeat(12,minmax(0,1fr))_minmax(0,1.25fr)] gap-1 p-2 sm:gap-1.5 sm:p-3">
      {settings.bands.map((band, i) => (
        <div key={i} className={strip}>
          <span className="grid size-[18px] place-items-center rounded-full type-[700_10px/1] text-black" style={{ background: BAND_COLORS[i] }}>
            {i + 1}
          </span>
          <LedDot on={band.on} onToggle={(on) => setBand(i, { on })} label={t('eq.band', { n: i + 1 })} />
          <Knob compact size={30} color={BAND_COLORS[i]} label={t('eq.q')} value={band.q} min={MIN_Q} max={MAX_Q} step={0.01} reset={1.41} disabled={!hasQ(band)} onChange={(q) => setBand(i, { q })} />
          <Fader
            label={hz(band.freq)}
            value={hasGain(band.type) ? band.gain : 0}
            min={-MAX_GAIN}
            max={MAX_GAIN}
            onChange={(v) => setBand(i, { gain: v })}
            color={BAND_COLORS[i]}
            disabled={!band.on || !hasGain(band.type)}
          />
          <span className="max-w-full truncate type-[700_10px/12px] text-secondary">{hz(band.freq)}</span>
        </div>
      ))}
      {/* Master: balance and the preamp, with Auto. */}
      <div className={`${strip} border-key/40 bg-key/10`}>
        <span className="max-w-full truncate type-[700_10px/18px] tracking-wide text-key uppercase">{t('eq.master')}</span>
        <LedDot on={settings.autoPreamp} onToggle={(on) => update((s) => ({ ...s, autoPreamp: on }))} label={`${t('eq.auto')}: ${t('eq.autoPreampDetail')}`} tone="var(--keyColor)" />
        <Knob
          compact
          size={30}
          label={t('mod.balance')}
          value={settings.balance}
          min={-1}
          max={1}
          step={0.01}
          format={balanceLabel}
          reset={0}
          bipolar
          onChange={(v) => update((s) => ({ ...s, balance: v }))}
        />
        <Fader
          label={t('eq.preamp')}
          value={preamp}
          min={PREAMP_MIN}
          max={PREAMP_MAX}
          onChange={(v) => update((s) => ({ ...s, preampDb: v, autoPreamp: false }))}
          disabled={settings.autoPreamp}
        />
        <span className="max-w-full truncate type-[700_10px/12px] text-secondary">{t('eq.preamp')}</span>
      </div>
    </div>
  );
}

/** Settings › Equalizer: the 12-band parametric EQ, the mastering modules and the meters. */
export default function EqualizerPage() {
  const t = useT();
  const lang = useLanguage((s) => s.lang);
  const { settings, bypass, solo, slot, custom } = useMastering();
  const store = useMastering.getState();
  const [view, setView] = useState<'graph' | 'mixer'>('graph');
  const [selected, setSelected] = useState(0);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const preamp = MasteringChain.effectivePreamp(settings);
  const update = (change: (s: MasteringSettings) => MasteringSettings) => store.update(change);
  const mod = <K extends 'exciter' | 'bass' | 'stereo' | 'crossfeed' | 'surround' | 'eightD' | 'limiter'>(key: K, patch: Partial<MasteringSettings[K]>) =>
    update((s) => ({ ...s, [key]: { ...s[key], ...patch } }));
  const comp = (i: number, patch: Partial<CompressorBand>) =>
    update((s) => ({ ...s, comp: { ...s.comp, bands: s.comp.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) as MasteringSettings['comp']['bands'] } }));

  const presetOptions = [
    ...PRESETS.map((p) => ({ value: p.id, label: p.name[lang] })),
    ...custom.map((p) => ({ value: p.name, label: `★ ${p.name}` })),
    ...(settings.preset === 'custom' ? [{ value: 'custom', label: t('eq.custom') }] : []),
  ];
  const isCustomPreset = custom.some((p) => p.name === settings.preset);

  const onImport = async (f: File) => {
    try {
      const text = await f.text();
      if (f.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{')) {
        setNotice(t('eq.imported', { name: store.importJson(text) }));
      } else {
        store.importApo(text);
        setNotice(t('eq.imported', { name: f.name }));
      }
    } catch (e) {
      setNotice(t('eq.importFailed', { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const band = settings.bands[selected]!;
  const compLabels = [t('mod.low'), t('mod.mid'), t('mod.high')];
  const { exciter, bass, stereo, crossfeed, surround, eightD, limiter } = settings;

  return (
    // Any press on the page wakes a suspended audio context (autoplay policy).
    <div className={`${settingsUi.centered} lg:max-w-[calc(960px+2*var(--body-gutter))]`} onPointerDown={() => void getMasteringChain()?.resume()}>
      <PageHeader title={t('eq.title')} />
      <div className={`${settingsUi.body} lg:max-w-[960px]`}>
        <section className={settingsUi.group}>
          <Toggle label={t('eq.enable')} detail={t('eq.enableDetail')} checked={settings.enabled} onChange={store.setEnabled} />
          <label className={settingsUi.controlRow}>
            <span>{t('eq.preset')}</span>
            <Select<string> label={t('eq.preset')} value={settings.preset} options={presetOptions} onChange={store.setPreset} />
          </label>
        </section>

        {/* Transport of the desk: A/B, bypass, then presets in and out. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 px-1">
          <LedButton on={settings.enabled} onToggle={store.setEnabled} label={t('eq.enable')} className="h-8 px-3">
            {t('eq.title')}
          </LedButton>
          {(['A', 'B'] as const).map((s) => (
            <LedButton key={s} on={slot === s} onToggle={() => slot !== s && store.switchSlot()} label={s} tone="key" className="h-8 px-3">
              {s}
            </LedButton>
          ))}
          <button className={pill} onClick={store.copyToOther}>
            {t('eq.copyTo', { slot: slot === 'A' ? 'B' : 'A' })}
          </button>
          <LedButton on={bypass} onToggle={store.setBypass} label={t('eq.bypass')} tone="amber" disabled={!settings.enabled} className="h-8 px-3">
            {t('eq.bypass')}
          </LedButton>
          <span className="flex-1" />
          <button
            className={pill}
            onClick={() => {
              const name = window.prompt(t('eq.saveName'), isCustomPreset ? settings.preset : '');
              if (name) store.savePreset(name);
            }}
          >
            <Save size={14} /> {t('eq.save')}
          </button>
          {isCustomPreset && (
            <button className={pill} onClick={() => store.deletePreset(settings.preset)} aria-label={t('eq.delete')} title={t('eq.delete')}>
              <Trash2 size={14} />
            </button>
          )}
          <button className={pill} onClick={(e) => setExportAnchor(exportAnchor ? null : e.currentTarget)} aria-haspopup="menu">
            <Download size={14} /> {t('eq.export')}
          </button>
          <button className={pill} onClick={() => file.current?.click()}>
            <Upload size={14} /> {t('eq.import')}
          </button>
          <button className={pill} onClick={store.reset}>
            <RotateCcw size={14} /> {t('common.reset')}
          </button>
          <input
            ref={file}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (f) void onImport(f);
            }}
          />
          {exportAnchor && (
            <Menu anchor={exportAnchor} placement="below-end" onClose={() => setExportAnchor(null)} label={t('eq.export')}>
              <MenuItem
                onSelect={() => {
                  download(`${settings.preset || 'etify'}.json`, toJson(settings, settings.preset), 'application/json');
                  setExportAnchor(null);
                }}
              >
                {t('eq.exportJson')}
              </MenuItem>
              <MenuItem
                onSelect={() => {
                  download(`${settings.preset || 'etify'}-apo.txt`, toApo(settings, preamp), 'text/plain');
                  setExportAnchor(null);
                }}
              >
                {t('eq.exportApo')}
              </MenuItem>
            </Menu>
          )}
        </div>
        {notice && (
          <p className="mx-1 mt-2 type-callout text-secondary" role="status">
            {notice}
          </p>
        )}

        {/* The EQ: graph or mixer. */}
        <div className="mt-6 mb-2 flex items-center justify-between px-4">
          <h2 className="type-subhead-emphasized text-secondary uppercase">{t('eq.bands')}</h2>
          <div className="inline-flex overflow-hidden rounded-pill bg-quaternary" role="group">
            {(['graph', 'mixer'] as const).map((v) => (
              <button
                key={v}
                className="px-3 py-1 type-callout-emphasized text-primary aria-pressed:bg-key-bg aria-pressed:text-white"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {t(v === 'graph' ? 'eq.viewGraph' : 'eq.viewMixer')}
              </button>
            ))}
          </div>
        </div>
        <section className={`${settingsUi.group} text-primary ${settings.enabled ? '' : 'opacity-70'}`}>
          {view === 'graph' ? (
            <>
              <div className="px-2 pt-2">
                <EqCanvas
                  bands={settings.bands}
                  enabled={settings.enabled && !bypass}
                  selected={selected}
                  solo={solo}
                  onSelect={setSelected}
                  onChange={store.setBand}
                  onSolo={store.setSolo}
                  ariaLabel={t('eq.curve')}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 type-[500_11px/14px] text-tertiary">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-sm bg-key/20" /> {t('eq.spectrumPre')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-key/60" /> {t('eq.spectrumPost')}
                </span>
                <span>{t('eq.canvasHelp')}</span>
              </div>
              <div className="flex gap-1 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
                {settings.bands.map((b, i) => (
                  <button
                    key={i}
                    className="grid size-7 flex-none place-items-center rounded-full type-[700_11px/1] text-black aria-pressed:ring-2 aria-pressed:ring-primary"
                    style={{ background: b.on ? BAND_COLORS[i] : 'var(--systemQuaternary)' }}
                    aria-pressed={selected === i}
                    aria-label={t('eq.band', { n: i + 1 })}
                    onClick={() => setSelected(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <BandEditor index={selected} band={band} solo={solo === selected} />
              <div className="flex flex-wrap items-center justify-center gap-4 border-t border-quaternary px-4 py-3">
                <Knob
                  size={54}
                  label={`${t('eq.preamp')}${settings.autoPreamp ? ` · ${t('eq.auto')}` : ''}`}
                  value={preamp}
                  min={PREAMP_MIN}
                  max={PREAMP_MAX}
                  step={0.1}
                  format={db}
                  reset={0}
                  bipolar
                  disabled={settings.autoPreamp}
                  onChange={(v) => update((s) => ({ ...s, preampDb: v }))}
                />
                <Knob
                  size={54}
                  label={t('mod.balance')}
                  value={settings.balance}
                  min={-1}
                  max={1}
                  step={0.01}
                  format={balanceLabel}
                  reset={0}
                  bipolar
                  onChange={(v) => update((s) => ({ ...s, balance: v }))}
                />
                <div className="flex max-w-[260px] flex-col items-start gap-1.5">
                  <LedButton on={settings.autoPreamp} onToggle={(on) => update((s) => ({ ...s, autoPreamp: on }))} label={t('eq.autoPreampDetail')} tone="key">
                    {t('eq.auto')}
                  </LedButton>
                  <span className="type-[500_11px/14px] text-secondary">{t('eq.autoPreampDetail')}</span>
                </div>
              </div>
            </>
          ) : (
            <MixerView settings={settings} preamp={preamp} />
          )}
        </section>

        <h2 className={settingsUi.sectionHeader}>{t('eq.meters')}</h2>
        <Meters labels={[compLabels[0]!, compLabels[1]!, compLabels[2]!, t('mod.limiter')]} />

        <h2 className={settingsUi.sectionHeader}>{t('eq.mastering')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Strip title={t('mod.surround')} detail={t('mod.surroundDetail')} on={surround.on} onToggle={(on) => mod('surround', { on })}>
            <Knob label={t('mod.room')} value={surround.amount} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('surround', { amount: v })} />
            <Knob label={t('mod.size')} value={surround.size} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('surround', { size: v })} />
            <Knob label={t('mod.depth')} value={surround.depth} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('surround', { depth: v })} />
          </Strip>

          <Strip title={t('mod.eightD')} detail={t('mod.eightDDetail')} on={eightD.on} onToggle={(on) => mod('eightD', { on })}>
            {/* Turns per minute on the knob; stored as seconds per turn. */}
            <Knob
              label={t('mod.speed')}
              value={Math.round(600 / eightD.speed) / 10}
              min={2}
              max={30}
              step={0.5}
              unit=" rpm"
              reset={7.5}
              onChange={(rpm) => mod('eightD', { speed: 60 / rpm })}
            />
            <Knob label={t('mod.mix')} value={eightD.depth} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('eightD', { depth: v })} />
          </Strip>

          <Strip title={t('mod.stereo')} detail={t('mod.stereoDetail')} on={stereo.on} onToggle={(on) => mod('stereo', { on })}>
            <Knob label={t('mod.width')} value={stereo.width} min={0} max={2} step={0.01} format={pct} reset={1} bipolar onChange={(v) => mod('stereo', { width: v })} />
            <Knob label={t('mod.monoBelow')} value={stereo.monoBelow} min={20} max={300} step={5} unit=" Hz" onChange={(v) => mod('stereo', { monoBelow: v })} />
          </Strip>

          <Strip title={t('mod.bass')} detail={t('mod.bassDetail')} on={bass.on} onToggle={(on) => mod('bass', { on })}>
            <Knob label={t('mod.below')} value={bass.freq} min={40} max={200} step={1} unit=" Hz" onChange={(v) => mod('bass', { freq: v })} />
            <Knob label={t('mod.amount')} value={bass.amount} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('bass', { amount: v })} />
          </Strip>

          <Strip
            title={t('mod.exciter')}
            detail={t('mod.exciterDetail')}
            on={exciter.on}
            onToggle={(on) => mod('exciter', { on })}
            buttons={(['tube', 'tape'] as const).map((m) => (
              <LedButton key={m} on={exciter.mode === m} onToggle={() => mod('exciter', { mode: m })} label={t(m === 'tube' ? 'mod.tube' : 'mod.tape')} tone="amber">
                {t(m === 'tube' ? 'mod.tube' : 'mod.tape')}
              </LedButton>
            ))}
          >
            <Knob label={t('mod.drive')} value={exciter.drive} min={1} max={10} step={0.1} unit="×" onChange={(v) => mod('exciter', { drive: v })} />
            <Knob label={t('mod.from')} value={exciter.freq} min={800} max={12000} step={50} format={hzUnit} onChange={(v) => mod('exciter', { freq: v })} />
            <Knob label={t('mod.mix')} value={exciter.mix} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('exciter', { mix: v })} />
          </Strip>

          <Strip title={t('mod.crossfeed')} detail={t('mod.crossfeedDetail')} on={crossfeed.on} onToggle={(on) => mod('crossfeed', { on })}>
            <Knob label={t('mod.amount')} value={crossfeed.amount} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('crossfeed', { amount: v })} />
          </Strip>

          <Strip title={t('mod.balance')} detail={t('mod.balanceDetail')}>
            <Knob label={t('mod.balance')} value={settings.balance} min={-1} max={1} step={0.01} format={balanceLabel} reset={0} bipolar onChange={(v) => update((s) => ({ ...s, balance: v }))} />
          </Strip>

          <Strip
            title={t('mod.limiter')}
            detail={t('mod.limiterDetail')}
            on={limiter.on}
            onToggle={(on) => mod('limiter', { on })}
            buttons={
              <LedButton on={settings.autoGain} onToggle={(on) => update((s) => ({ ...s, autoGain: on }))} label={t('mod.autoGainDetail')} tone="key">
                {t('mod.autoGain')}
              </LedButton>
            }
          >
            <Knob label={t('mod.ceiling')} value={limiter.ceiling} min={-6} max={0} step={0.1} unit=" dB" reset={-0.3} onChange={(v) => mod('limiter', { ceiling: v })} />
          </Strip>

          <Strip wide title={t('mod.comp')} detail={t('mod.compDetail')} on={settings.comp.on} onToggle={(on) => update((s) => ({ ...s, comp: { ...s.comp, on } }))}>
            {/* A console's rows: the crossovers, then a row of five knobs per band, each column one control. */}
            <div className="mx-auto flex w-fit max-w-full flex-col gap-2 overflow-x-auto">
              <div className="flex items-center gap-2 rounded-[10px] bg-quaternary/50 px-2 py-2">
                <span className="w-14 flex-none type-[700_11px/14px] tracking-wide text-secondary uppercase">X-over</span>
                <Knob size={40} label={t('mod.lowCross')} value={settings.comp.lowCross} min={60} max={600} step={5} unit=" Hz" onChange={(v) => update((s) => ({ ...s, comp: { ...s.comp, lowCross: v } }))} />
                <Knob size={40} label={t('mod.highCross')} value={settings.comp.highCross} min={1500} max={10000} step={50} format={hzUnit} onChange={(v) => update((s) => ({ ...s, comp: { ...s.comp, highCross: v } }))} />
              </div>
              {settings.comp.bands.map((b, i) => (
                <div key={i} className="flex items-center gap-2 rounded-[10px] bg-quaternary/50 px-2 py-2">
                  <span className="w-14 flex-none type-[700_11px/14px] tracking-wide text-secondary uppercase">{compLabels[i]}</span>
                  <Knob size={40} label={t('mod.threshold')} value={b.threshold} min={-60} max={0} step={0.5} unit=" dB" onChange={(v) => comp(i, { threshold: v })} />
                  <Knob size={40} label={t('mod.ratio')} value={b.ratio} min={1} max={20} step={0.1} format={(v) => `${v.toFixed(1)}:1`} onChange={(v) => comp(i, { ratio: v })} />
                  <Knob size={40} label={t('mod.attack')} value={b.attack * 1000} min={1} max={500} step={0.5} unit=" ms" onChange={(v) => comp(i, { attack: v / 1000 })} />
                  <Knob size={40} label={t('mod.release')} value={b.release * 1000} min={10} max={1000} step={5} unit=" ms" onChange={(v) => comp(i, { release: v / 1000 })} />
                  <Knob size={40} label={t('mod.makeup')} value={b.makeup} min={-12} max={12} step={0.5} unit=" dB" reset={0} bipolar onChange={(v) => comp(i, { makeup: v })} />
                </div>
              ))}
            </div>
          </Strip>
        </div>

        <p className={settingsUi.footer}>{t('eq.footer')}</p>
      </div>
    </div>
  );
}
