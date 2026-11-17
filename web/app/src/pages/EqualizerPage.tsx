import { Download, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Menu, MenuItem } from '@/components/Menu';
import { PageHeader } from '@/components/PageHeader';
import { Select } from '@/components/Select';
import { useLanguage, useT, type I18nKey } from '@/lib/i18n';
import { MasteringChain } from '@/playback/dsp/MasteringChain';
import { curvePeakDb } from '@/playback/dsp/filters';
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
import { BAND_COLORS, EqCanvas } from './equalizer/EqCanvas';
import { Meters } from './equalizer/Meters';
import { ModuleCard, pill, Slider, Switch } from './equalizer/controls';
import { Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const TYPES: FilterType[] = ['peaking', 'lowshelf', 'highshelf', 'tilt', 'highpass', 'lowpass', 'notch'];
const hasGain = (type: FilterType) => type === 'peaking' || type === 'lowshelf' || type === 'highshelf' || type === 'tilt';
const hasQ = (band: EqBand) => band.type === 'peaking' || band.type === 'notch' || ((band.type === 'highpass' || band.type === 'lowpass') && band.slope === 12);
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${Math.round(v)} Hz`);
const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
/** Frequency sliders move along a log scale: 0–1000 maps to 20 Hz–20 kHz. */
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

/** The selected band's controls. */
function BandEditor({ index, band, solo }: { index: number; band: EqBand; solo: boolean }) {
  const t = useT();
  const { setBand, setSolo } = useMastering.getState();
  const set = (patch: Partial<EqBand>) => setBand(index, patch);
  return (
    <div className="flex flex-col gap-3 border-t border-quaternary px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 type-title-3 text-primary">
          <span className="size-3 rounded-full" style={{ background: BAND_COLORS[index] }} />
          {t('eq.band', { n: index + 1 })}
        </span>
        <Switch label={t('eq.on')} checked={band.on} onChange={(on) => set({ on })} />
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
        <button className={`${pill} ms-auto`} aria-pressed={solo} onClick={() => setSolo(solo ? null : index)}>
          {t('eq.solo')}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Slider label={t('eq.freq')} value={toPos(band.freq)} min={0} max={1000} step={1} format={(p) => hz(fromPos(p))} onChange={(p) => set({ freq: fromPos(p) })} />
        <Slider
          label={t('eq.gain')}
          value={band.gain}
          min={-MAX_GAIN}
          max={MAX_GAIN}
          step={0.1}
          format={db}
          reset={0}
          disabled={!hasGain(band.type)}
          onChange={(gain) => set({ gain })}
        />
        <Slider label={t('eq.q')} value={band.q} min={MIN_Q} max={MAX_Q} step={0.01} reset={1.41} disabled={!hasQ(band)} onChange={(q) => set({ q })} />
      </div>
    </div>
  );
}

/** The classic view: a vertical fader per band (gain), and the preamp first. */
function Faders({ settings, preamp }: { settings: MasteringSettings; preamp: number }) {
  const t = useT();
  const { setBand, update } = useMastering.getState();
  const fader = (label: string, value: number, min: number, max: number, onChange: (v: number) => void, color?: string, disabled?: boolean) => (
    <div key={label} className={`flex min-w-0 flex-col items-center gap-2 ${disabled ? 'opacity-40' : ''}`}>
      <span className="type-[600_12px/16px] tabular-nums text-primary">{`${value > 0 ? '+' : ''}${value.toFixed(1)}`}</span>
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
        className="h-44 w-7 cursor-pointer"
        style={{ writingMode: 'vertical-lr', direction: 'rtl', accentColor: color ?? 'var(--keyColor)' }}
      />
      <span className="type-[600_11px/14px] whitespace-nowrap text-secondary">{label}</span>
    </div>
  );
  return (
    <div className="overflow-x-auto px-3 py-5 [scrollbar-width:thin]">
      <div className="grid min-w-[640px] grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
        {fader(t('eq.preamp'), preamp, PREAMP_MIN, PREAMP_MAX, (v) => update((s) => ({ ...s, preampDb: v, autoPreamp: false })), 'var(--systemSecondary)', settings.autoPreamp)}
        {settings.bands.map((band, i) =>
          fader(
            hz(band.freq).replace(' Hz', '').replace(' kHz', 'k'),
            hasGain(band.type) ? band.gain : 0,
            -MAX_GAIN,
            MAX_GAIN,
            (v) => setBand(i, { gain: v }),
            BAND_COLORS[i],
            !band.on || !hasGain(band.type),
          ),
        )}
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
  const [view, setView] = useState<'graph' | 'sliders'>('graph');
  const [selected, setSelected] = useState(0);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const preamp = MasteringChain.effectivePreamp(settings);
  const peak = useMemo(() => curvePeakDb(settings.bands), [settings.bands]);
  const update = (change: (s: MasteringSettings) => MasteringSettings) => store.update(change);
  const comp = (i: number, patch: Partial<CompressorBand>) =>
    update((s) => ({ ...s, comp: { ...s.comp, bands: s.comp.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) as MasteringSettings['comp']['bands'] } }));

  const builtIn = PRESETS.map((p) => ({ value: p.id, label: p.name[lang] }));
  const presetOptions = [
    ...builtIn,
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

  return (
    // Any press on the page wakes a suspended audio context (autoplay policy).
    <div className={`${settingsUi.centered} lg:max-w-[calc(920px+2*var(--body-gutter))]`} onPointerDown={() => void getMasteringChain()?.resume()}>
      <PageHeader title={t('eq.title')} />
      <div className={`${settingsUi.body} lg:max-w-[920px]`}>
        <section className={settingsUi.group}>
          <Toggle label={t('eq.enable')} detail={t('eq.enableDetail')} checked={settings.enabled} onChange={store.setEnabled} />
          <label className={settingsUi.controlRow}>
            <span>{t('eq.preset')}</span>
            <Select<string> label={t('eq.preset')} value={settings.preset} options={presetOptions} onChange={store.setPreset} />
          </label>
        </section>

        {/* Toolbar: A/B, bypass, presets in and out. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 px-1">
          <div className="inline-flex overflow-hidden rounded-pill bg-quaternary" role="group" aria-label="A/B">
            {(['A', 'B'] as const).map((s) => (
              <button
                key={s}
                className="px-3 py-1 type-callout-emphasized text-primary aria-pressed:bg-key-bg aria-pressed:text-white"
                aria-pressed={slot === s}
                onClick={() => slot !== s && store.switchSlot()}
              >
                {s}
              </button>
            ))}
          </div>
          <button className={pill} onClick={store.copyToOther}>
            {t('eq.copyTo', { slot: slot === 'A' ? 'B' : 'A' })}
          </button>
          <button className={pill} aria-pressed={bypass} onClick={() => store.setBypass(!bypass)} disabled={!settings.enabled}>
            {t('eq.bypass')}
          </button>
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

        {/* The EQ: graph or sliders. */}
        <div className="mt-6 mb-2 flex items-center justify-between px-4">
          <h2 className="type-subhead-emphasized text-secondary uppercase">{t('eq.bands')}</h2>
          <div className="inline-flex overflow-hidden rounded-pill bg-quaternary" role="group">
            {(['graph', 'sliders'] as const).map((v) => (
              <button
                key={v}
                className="px-3 py-1 type-callout-emphasized text-primary aria-pressed:bg-key-bg aria-pressed:text-white"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {t(v === 'graph' ? 'eq.viewGraph' : 'eq.viewSliders')}
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
            </>
          ) : (
            <Faders settings={settings} preamp={preamp} />
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-quaternary px-4 py-3">
            <Slider
              label={`${t('eq.preamp')}${settings.autoPreamp ? ` (${t('eq.auto')})` : ''}`}
              value={preamp}
              min={PREAMP_MIN}
              max={PREAMP_MAX}
              step={0.1}
              format={db}
              reset={0}
              disabled={settings.autoPreamp}
              onChange={(v) => update((s) => ({ ...s, preampDb: v }))}
            />
            <label className="flex items-center gap-2 type-callout text-secondary" title={t('eq.autoPreampDetail')}>
              {t('eq.auto')}
              <Switch label={t('eq.autoPreampDetail')} checked={settings.autoPreamp} onChange={(on) => update((s) => ({ ...s, autoPreamp: on }))} />
            </label>
          </div>
          {settings.autoPreamp && peak > 0 && <p className="px-4 pb-3 type-callout text-secondary">{t('eq.autoPreampDetail')}</p>}
        </section>

        <h2 className={settingsUi.sectionHeader}>{t('eq.meters')}</h2>
        <Meters labels={[compLabels[0]!, compLabels[1]!, compLabels[2]!, t('mod.limiter')]} />

        <h2 className={settingsUi.sectionHeader}>{t('eq.mastering')}</h2>
        <div className="flex flex-col gap-3">
          <ModuleCard title={t('mod.comp')} detail={t('mod.compDetail')} on={settings.comp.on} onToggle={(on) => update((s) => ({ ...s, comp: { ...s.comp, on } }))}>
            <Slider label={t('mod.lowCross')} value={settings.comp.lowCross} min={60} max={600} step={5} unit=" Hz" onChange={(v) => update((s) => ({ ...s, comp: { ...s.comp, lowCross: v } }))} />
            <Slider label={t('mod.highCross')} value={settings.comp.highCross} min={1500} max={10000} step={50} format={hz} onChange={(v) => update((s) => ({ ...s, comp: { ...s.comp, highCross: v } }))} />
            <span className="max-sm:hidden" />
            {settings.comp.bands.map((b, i) => (
              <div key={i} className="col-span-2 grid grid-cols-2 gap-x-5 gap-y-2 rounded-[8px] bg-quaternary/60 p-2.5 sm:col-span-1 sm:grid-cols-1">
                <span className="col-span-full type-callout-emphasized text-primary">{compLabels[i]}</span>
                <Slider label={t('mod.threshold')} value={b.threshold} min={-60} max={0} step={0.5} unit=" dB" onChange={(v) => comp(i, { threshold: v })} />
                <Slider label={t('mod.ratio')} value={b.ratio} min={1} max={20} step={0.1} format={(v) => `${v.toFixed(1)}:1`} onChange={(v) => comp(i, { ratio: v })} />
                <Slider label={t('mod.attack')} value={b.attack * 1000} min={1} max={500} step={0.5} unit=" ms" onChange={(v) => comp(i, { attack: v / 1000 })} />
                <Slider label={t('mod.release')} value={b.release * 1000} min={10} max={1000} step={5} unit=" ms" onChange={(v) => comp(i, { release: v / 1000 })} />
                <Slider label={t('mod.makeup')} value={b.makeup} min={-12} max={12} step={0.5} unit=" dB" reset={0} onChange={(v) => comp(i, { makeup: v })} />
              </div>
            ))}
          </ModuleCard>

          <ModuleCard title={t('mod.exciter')} detail={t('mod.exciterDetail')} on={settings.exciter.on} onToggle={(on) => update((s) => ({ ...s, exciter: { ...s.exciter, on } }))}>
            <label className="flex flex-col gap-1 type-[500_12px/16px] text-secondary">
              <span>{t('eq.type')}</span>
              <Select<'tube' | 'tape'>
                label={t('eq.type')}
                value={settings.exciter.mode}
                options={[
                  { value: 'tube', label: t('mod.tube') },
                  { value: 'tape', label: t('mod.tape') },
                ]}
                onChange={(mode) => update((s) => ({ ...s, exciter: { ...s.exciter, mode } }))}
              />
            </label>
            <Slider label={t('mod.drive')} value={settings.exciter.drive} min={1} max={10} step={0.1} unit="×" onChange={(v) => update((s) => ({ ...s, exciter: { ...s.exciter, drive: v } }))} />
            <Slider label={t('mod.from')} value={settings.exciter.freq} min={800} max={12000} step={50} format={hz} onChange={(v) => update((s) => ({ ...s, exciter: { ...s.exciter, freq: v } }))} />
            <Slider label={t('mod.mix')} value={Math.round(settings.exciter.mix * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => update((s) => ({ ...s, exciter: { ...s.exciter, mix: v / 100 } }))} />
          </ModuleCard>

          <ModuleCard title={t('mod.bass')} detail={t('mod.bassDetail')} on={settings.bass.on} onToggle={(on) => update((s) => ({ ...s, bass: { ...s.bass, on } }))}>
            <Slider label={t('mod.below')} value={settings.bass.freq} min={40} max={200} step={1} unit=" Hz" onChange={(v) => update((s) => ({ ...s, bass: { ...s.bass, freq: v } }))} />
            <Slider label={t('mod.amount')} value={Math.round(settings.bass.amount * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => update((s) => ({ ...s, bass: { ...s.bass, amount: v / 100 } }))} />
          </ModuleCard>

          <ModuleCard title={t('mod.stereo')} detail={t('mod.stereoDetail')} on={settings.stereo.on} onToggle={(on) => update((s) => ({ ...s, stereo: { ...s.stereo, on } }))}>
            <Slider label={t('mod.width')} value={Math.round(settings.stereo.width * 100)} min={0} max={200} step={1} unit="%" reset={100} onChange={(v) => update((s) => ({ ...s, stereo: { ...s.stereo, width: v / 100 } }))} />
            <Slider label={t('mod.monoBelow')} value={settings.stereo.monoBelow} min={20} max={300} step={5} unit=" Hz" onChange={(v) => update((s) => ({ ...s, stereo: { ...s.stereo, monoBelow: v } }))} />
          </ModuleCard>

          <ModuleCard title={t('mod.crossfeed')} detail={t('mod.crossfeedDetail')} on={settings.crossfeed.on} onToggle={(on) => update((s) => ({ ...s, crossfeed: { ...s.crossfeed, on } }))}>
            <Slider label={t('mod.amount')} value={Math.round(settings.crossfeed.amount * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => update((s) => ({ ...s, crossfeed: { ...s.crossfeed, amount: v / 100 } }))} />
          </ModuleCard>

          <ModuleCard title={t('mod.limiter')} detail={t('mod.limiterDetail')} on={settings.limiter.on} onToggle={(on) => update((s) => ({ ...s, limiter: { ...s.limiter, on } }))}>
            <Slider label={t('mod.ceiling')} value={settings.limiter.ceiling} min={-6} max={0} step={0.1} unit=" dB" reset={-0.3} onChange={(v) => update((s) => ({ ...s, limiter: { ...s.limiter, ceiling: v } }))} />
          </ModuleCard>

          <ModuleCard title={t('mod.autoGain')} detail={t('mod.autoGainDetail')} on={settings.autoGain} onToggle={(on) => update((s) => ({ ...s, autoGain: on }))} />
        </div>

        <p className={settingsUi.footer}>{t('eq.footer')}</p>
      </div>
    </div>
  );
}
