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
import { useUi } from '@/state/ui';
import { BAND_COLORS, EqCanvas } from './equalizer/EqCanvas';
import { FINISHES, Knob, Lcd, LedButton, RackUnit, Section } from './equalizer/hardware';
import { HeadphonePickerBody } from './equalizer/HeadphonePicker';
import { GainReductionMeters, MeterBridge } from './equalizer/Meters';
import { PresetPicker } from './equalizer/PresetPicker';
import { RecorderUnit } from './equalizer/RecorderUnit';
import { settingsUi } from './settingsStyles';

const TYPES: FilterType[] = ['peaking', 'lowshelf', 'highshelf', 'tilt', 'highpass', 'lowpass', 'notch'];
const hasGain = (type: FilterType) => type === 'peaking' || type === 'lowshelf' || type === 'highshelf' || type === 'tilt';
const hasQ = (band: EqBand) => band.type === 'peaking' || band.type === 'notch' || ((band.type === 'highpass' || band.type === 'lowpass') && band.slope === 12);
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k` : `${Math.round(v)}`);
const hzUnit = (v: number) => `${hz(v)}${v >= 1000 ? 'Hz' : ' Hz'}`;
const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const semis = (v: number) => `${v > 0 ? '+' : ''}${v % 1 === 0 ? v : v.toFixed(1)} st`;

/** The vibe presets: speed (the pitch follows it, as on a turntable), extra pitch, reverb. */
const VIBES = {
  normal: { speed: 1, pitch: 0, reverb: 0, lockPitch: false },
  slowed: { speed: 0.85, pitch: 0, reverb: 0.55, lockPitch: false },
  vaporwave: { speed: 0.75, pitch: 0, reverb: 0.35, lockPitch: false },
  spedUp: { speed: 1.15, pitch: 0, reverb: 0, lockPitch: false },
  nightcore: { speed: 1.25, pitch: 0, reverb: 0.1, lockPitch: false },
} satisfies Record<string, MasteringSettings['vibe']>;
const sameVibe = (a: MasteringSettings['vibe'], b: MasteringSettings['vibe']) =>
  Math.abs(a.speed - b.speed) < 0.005 && Math.abs(a.pitch - b.pitch) < 0.01 && Math.abs(a.reverb - b.reverb) < 0.005 && a.lockPitch === b.lockPitch;
/** L 40 · C · R 25: how far the balance leans, in percent. */
const balanceLabel = (v: number) => (Math.abs(v) < 0.005 ? 'C' : `${v < 0 ? 'L' : 'R'} ${Math.round(Math.abs(v) * 100)}`);
/** Frequency knobs turn along a log scale: 0–1000 maps to 20 Hz–20 kHz. */
const toPos = (f: number) => Math.round((Math.log10(f / MIN_HZ) / Math.log10(MAX_HZ / MIN_HZ)) * 1000);
const fromPos = (p: number) => Math.round(MIN_HZ * (MAX_HZ / MIN_HZ) ** (p / 1000));

/** A hardware push button without a lamp: files, copy, reset. */
const hwButton =
  'inline-flex h-8 flex-none items-center gap-1.5 rounded-[6px] border border-black/40 bg-[linear-gradient(180deg,#3a3842,#24222b)] px-2.5 text-[11px]/[1] font-bold tracking-wide text-white/85 uppercase shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_2px_3px_rgb(0_0_0/0.35)] active:translate-y-px active:shadow-[inset_0_1px_3px_rgb(0_0_0/0.5)] disabled:opacity-40';

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The selected band's controls: band select buttons, then its switches, readouts and three large knobs. */
function BandEditor({ index, band, solo, onSelect, bands }: { index: number; band: EqBand; solo: boolean; onSelect: (i: number) => void; bands: EqBand[] }) {
  const t = useT();
  const { setBand, setSolo } = useMastering.getState();
  const set = (patch: Partial<EqBand>) => setBand(index, patch);
  return (
    <div className="flex flex-col gap-2">
      {/* Band select: a row of lit push buttons. */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="me-1 text-[9px]/[10px] font-bold tracking-[0.14em] text-white/55 uppercase">{t('eq.bands')}</span>
        {bands.map((b, i) => (
          <button
            key={i}
            className="grid h-6 min-w-7 place-items-center rounded-[4px] border border-black/50 bg-[linear-gradient(180deg,#3a3842,#1f1d26)] px-1 font-mono text-[11px]/[1] font-bold shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.5)] active:translate-y-px"
            style={{
              color: b.on ? BAND_COLORS[i] : 'rgb(255 255 255 / 0.35)',
              boxShadow: i === index ? `0 0 0 1.5px ${BAND_COLORS[i]}, 0 0 8px ${BAND_COLORS[i]}88` : undefined,
            }}
            aria-pressed={i === index}
            aria-label={t('eq.band', { n: i + 1 })}
            onClick={() => onSelect(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="grid size-7 place-items-center rounded-full font-mono text-[12px]/[1] font-bold text-black shadow-[0_0_10px_var(--glow)]" style={{ background: BAND_COLORS[index], ['--glow' as string]: `${BAND_COLORS[index]}aa` }}>
            {index + 1}
          </span>
          <LedButton on={band.on} onToggle={(on) => set({ on })} label={t('eq.on')} />
          <LedButton on={solo} onToggle={(on) => setSolo(on ? index : null)} label={t('eq.solo')} tone="amber">
            {t('eq.solo')}
          </LedButton>
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
        <div className="ms-auto flex flex-wrap items-end gap-1">
          <Knob size={46} color={BAND_COLORS[index]} label={t('eq.freq')} value={toPos(band.freq)} min={0} max={1000} step={1} format={(p) => hzUnit(fromPos(p))} onChange={(p) => set({ freq: fromPos(p) })} />
          <Knob
            size={46}
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
          <Knob size={46} color={BAND_COLORS[index]} label={t('eq.q')} value={band.q} min={MIN_Q} max={MAX_Q} step={0.01} reset={1.41} disabled={!hasQ(band)} onChange={(q) => set({ q })} />
        </div>
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
  const strip = 'rack-section flex min-w-0 flex-col items-center gap-1.5 rounded-[6px] px-0.5 py-2';
  return (
    <div className="grid grid-cols-[repeat(12,minmax(0,1fr))_minmax(0,1.25fr)] gap-1 sm:gap-1.5">
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
      <div className={`${strip} shadow-[inset_0_0_0_1px_rgb(185_163_255/0.35)]`}>
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
  const vibe = settings.vibe;
  const vibeName = (Object.keys(VIBES) as (keyof typeof VIBES)[]).find((k) => sameVibe(VIBES[k], vibe)) ?? null;
  const vibeOn = vibeName !== 'normal';
  // Turning on a vibe or karaoke turns the chain on: they live in it.
  const setVibe = (next: MasteringSettings['vibe']) => update((s) => ({ ...s, enabled: true, vibe: next }));
  const fullScreen = useUi((s) => s.fullScreen);
  const openKaraoke = () => {
    update((s) => ({ ...s, enabled: true, karaoke: { ...s.karaoke, on: true } }));
    useUi.getState().setFullScreen(true);
  };
  const compLabels = [t('mod.low'), t('mod.mid'), t('mod.high')];
  const { exciter, bass, stereo, crossfeed, surround, eightD, limiter } = settings;

  const grLabels: [string, string, string, string] = [compLabels[0]!, compLabels[1]!, compLabels[2]!, t('mod.limiter')];

  return (
    // Any press on the page wakes a suspended audio context (autoplay policy).
    <div className={`${settingsUi.centered} lg:max-w-[calc(1080px+2*var(--body-gutter))]`} onPointerDown={() => void getMasteringChain()?.resume()}>
      <PageHeader title={t('eq.title')} />
      <div className={`${settingsUi.body} lg:max-w-[1080px]`}>
        {/* The rack: rails down both sides, the devices mounted one under another. */}
        <div data-rack className="rack-frame grid grid-cols-[14px_minmax(0,1fr)_14px] gap-x-1.5 rounded-[14px] p-2 max-sm:grid-cols-[6px_minmax(0,1fr)_6px] max-sm:gap-x-1 max-sm:p-1">
          <div className="rack-rail rounded-[3px]" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-1.5">
            {/* ---- PC-1: the rack's controller: power, presets, A/B, bypass, files ---- */}
            <RackUnit
              finish={FINISHES.controller}
              model="PC-1"
              name={t('rack.controller')}
              power={settings.enabled}
              onPower={store.setEnabled}
              powerLabel={t('eq.enable')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                  <span className="text-[9px]/[10px] font-bold tracking-[0.12em] text-white/55 uppercase">{t('eq.preset')}</span>
                  <div className="rack-lcd flex items-center gap-2 rounded-[4px] px-2 py-1">
                    <span className="size-1.5 flex-none rounded-full" style={{ background: settings.enabled ? '#9dff8a' : '#2c4a25', boxShadow: settings.enabled ? '0 0 6px #9dff8a' : undefined }} />
                    <span className="min-w-0 flex-1 truncate text-[13px]/[18px]">
                      {settings.enabled ? (presetOptions.find((o) => o.value === settings.preset)?.label ?? settings.preset) : t('common.off')}
                    </span>
                    <PresetPicker />
                  </div>
                  <span className="truncate text-[10px]/[13px] text-white/45">{t('eq.enableDetail')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <LedButton on={settings.enabled} onToggle={store.setEnabled} label={t('eq.enable')} className="h-8 px-3">
                    {t('eq.title')}
                  </LedButton>
                  {(['A', 'B'] as const).map((s) => (
                    <LedButton key={s} on={slot === s} onToggle={() => slot !== s && store.switchSlot()} label={s} tone="key" className="h-8 px-3">
                      {s}
                    </LedButton>
                  ))}
                  <button className={hwButton} onClick={store.copyToOther}>
                    {t('eq.copyTo', { slot: slot === 'A' ? 'B' : 'A' })}
                  </button>
                  <LedButton on={bypass} onToggle={store.setBypass} label={t('eq.bypass')} tone="amber" disabled={!settings.enabled} className="h-8 px-3">
                    {t('eq.bypass')}
                  </LedButton>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    className={hwButton}
                    onClick={() => {
                      const name = window.prompt(t('eq.saveName'), isCustomPreset ? settings.preset : '');
                      if (name) store.savePreset(name);
                    }}
                  >
                    <Save size={13} /> {t('eq.save')}
                  </button>
                  {isCustomPreset && (
                    <button className={hwButton} onClick={() => store.deletePreset(settings.preset)} aria-label={t('eq.delete')} title={t('eq.delete')}>
                      <Trash2 size={13} />
                    </button>
                  )}
                  <button className={hwButton} onClick={(e) => setExportAnchor(exportAnchor ? null : e.currentTarget)} aria-haspopup="menu">
                    <Download size={13} /> {t('eq.export')}
                  </button>
                  <button className={hwButton} onClick={() => file.current?.click()}>
                    <Upload size={13} /> {t('eq.import')}
                  </button>
                  <button className={hwButton} onClick={store.reset}>
                    <RotateCcw size={13} /> {t('common.reset')}
                  </button>
                </div>
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
                <p className="rack-lcd mt-2 rounded-[4px] px-2 py-1 text-[11px]/[15px]" role="status" style={{ ['--lcd' as string]: '#ffcf4a' }}>
                  {notice}
                </p>
              )}
            </RackUnit>

            {/* ---- EQ-12: the parametric equaliser: screen, band controls, meter bridge ---- */}
            <RackUnit finish={FINISHES.violet} model="EQ-12" name={t('rack.eq')} power={settings.enabled} onPower={store.setEnabled} powerLabel={t('eq.enable')}>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_196px]">
                <div className={`flex min-w-0 flex-col gap-2 ${settings.enabled ? '' : 'opacity-75'}`}>
                  <div className="rack-screen rounded-[6px] p-1.5">
                    <EqCanvas
                      bands={settings.bands}
                      enabled={settings.enabled && !bypass}
                      selected={selected}
                      solo={solo}
                      onSelect={setSelected}
                      onChange={store.setBand}
                      onSolo={store.setSolo}
                      ariaLabel={t('eq.curve')}
                      correction={settings.headphone?.on ? settings.headphone.bands : null}
                    />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pt-1 font-mono text-[10px]/[13px] text-white/45">
                      {settings.headphone?.on && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-0 w-4 border-t-2 border-dashed border-[#ffb020]" /> {t('autoeq.curve')}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-4 rounded-sm bg-key/25" /> {t('eq.spectrumPre')}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-0.5 w-4 bg-key/70" /> {t('eq.spectrumPost')}
                      </span>
                      <span>{t('eq.canvasHelp')}</span>
                    </div>
                  </div>
                  <BandEditor index={selected} band={band} solo={solo === selected} onSelect={setSelected} bands={settings.bands} />
                </div>
                <div className="rack-section rounded-[6px] p-2">
                  <MeterBridge />
                </div>
              </div>
            </RackUnit>

            {/* ---- GQ-12: the fader bank, a channel per band and the master ---- */}
            <RackUnit finish={FINISHES.violet} model="GQ-12" name={t('rack.faders')}>
              <div className={settings.enabled ? '' : 'opacity-75'}>
                <MixerView settings={settings} preamp={preamp} />
              </div>
            </RackUnit>

            {/* ---- HD-2: the space unit (delay-based): surround and 8D, in orange ---- */}
            <RackUnit finish={FINISHES.orange} model="HD-2" name={t('rack.space')}>
              <div className="grid gap-2 md:grid-cols-[3fr_2fr]">
                <Section title={t('mod.surround')} detail={t('mod.surroundDetail')} on={surround.on} onToggle={(on) => mod('surround', { on })}>
                  <Knob size={44} color="#ff8a3d" label={t('mod.room')} value={surround.amount} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('surround', { amount: v })} />
                  <Knob size={44} color="#ff8a3d" label={t('mod.size')} value={surround.size} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('surround', { size: v })} />
                  <Knob size={44} color="#ff8a3d" label={t('mod.depth')} value={surround.depth} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('surround', { depth: v })} />
                  <Lcd label={t('rack.delayTime')} value={`${(8 + surround.size * 17).toFixed(1)} ms`} color="#ff9a52" />
                </Section>
                <Section title={t('mod.eightD')} detail={t('mod.eightDDetail')} on={eightD.on} onToggle={(on) => mod('eightD', { on })}>
                  {/* Turns per minute on the knob; stored as seconds per turn. */}
                  <Knob
                    size={44}
                    color="#ff8a3d"
                    label={t('mod.speed')}
                    value={Math.round(600 / eightD.speed) / 10}
                    min={2}
                    max={30}
                    step={0.5}
                    unit=" rpm"
                    reset={7.5}
                    onChange={(rpm) => mod('eightD', { speed: 60 / rpm })}
                  />
                  <Knob size={44} color="#ff8a3d" label={t('mod.mix')} value={eightD.depth} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('eightD', { depth: v })} />
                  <Lcd label={t('rack.period')} value={`${eightD.speed.toFixed(1)} s`} color="#ff9a52" />
                </Section>
              </div>
            </RackUnit>

            {/* ---- MB-3: multiband dynamics: the compressor, the limiter, gain reduction ---- */}
            <RackUnit finish={FINISHES.gunmetal} model="MB-3" name={t('rack.dynamics')}>
              <div className="flex flex-wrap gap-2">
                <Section className="flex-[2_1_440px]" title={t('mod.comp')} detail={t('mod.compDetail')} on={settings.comp.on} onToggle={(on) => update((s) => ({ ...s, comp: { ...s.comp, on } }))}>
                  {/* A console's rows: the crossovers, then a row of five knobs per band, each column one control. */}
                  <div className="flex w-full max-w-full flex-col gap-1.5 overflow-x-auto">
                    <div className="flex items-center gap-1 rounded-[5px] bg-black/20 px-2 py-1.5">
                      <span className="w-14 flex-none text-[10px]/[14px] font-bold tracking-[0.14em] text-white/60 uppercase">X-over</span>
                      <Knob color="#ffcf4a" label={t('mod.lowCross')} value={settings.comp.lowCross} min={60} max={600} step={5} unit=" Hz" onChange={(v) => update((s) => ({ ...s, comp: { ...s.comp, lowCross: v } }))} />
                      <Knob color="#ffcf4a" label={t('mod.highCross')} value={settings.comp.highCross} min={1500} max={10000} step={50} format={hzUnit} onChange={(v) => update((s) => ({ ...s, comp: { ...s.comp, highCross: v } }))} />
                    </div>
                    {settings.comp.bands.map((b, i) => (
                      <div key={i} className="flex items-center gap-1 rounded-[5px] bg-black/20 px-2 py-1.5">
                        <span className="w-14 flex-none text-[10px]/[14px] font-bold tracking-[0.14em] text-white/60 uppercase">{compLabels[i]}</span>
                        <Knob color="#ffcf4a" label={t('mod.threshold')} value={b.threshold} min={-60} max={0} step={0.5} unit=" dB" onChange={(v) => comp(i, { threshold: v })} />
                        <Knob color="#ffcf4a" label={t('mod.ratio')} value={b.ratio} min={1} max={20} step={0.1} format={(v) => `${v.toFixed(1)}:1`} onChange={(v) => comp(i, { ratio: v })} />
                        <Knob color="#ffcf4a" label={t('mod.attack')} value={b.attack * 1000} min={1} max={500} step={0.5} unit=" ms" onChange={(v) => comp(i, { attack: v / 1000 })} />
                        <Knob color="#ffcf4a" label={t('mod.release')} value={b.release * 1000} min={10} max={1000} step={5} unit=" ms" onChange={(v) => comp(i, { release: v / 1000 })} />
                        <Knob color="#ffcf4a" label={t('mod.makeup')} value={b.makeup} min={-12} max={12} step={0.5} unit=" dB" reset={0} bipolar onChange={(v) => comp(i, { makeup: v })} />
                      </div>
                    ))}
                  </div>
                </Section>
                <div className="flex flex-[1_1_230px] flex-wrap items-stretch gap-2">
                  <Section
                    title={t('mod.limiter')}
                    detail={t('mod.limiterDetail')}
                    on={limiter.on}
                    onToggle={(on) => mod('limiter', { on })}
                    buttons={
                      <LedButton on={settings.autoGain} onToggle={(on) => update((s) => ({ ...s, autoGain: on }))} label={t('mod.autoGainDetail')} tone="key">
                        {t('mod.autoGain')}
                      </LedButton>
                    }
                    className="min-w-[200px] flex-[1_1_200px]"
                  >
                    <Knob size={44} color="#ffcf4a" label={t('mod.ceiling')} value={limiter.ceiling} min={-6} max={0} step={0.1} unit=" dB" reset={-0.3} onChange={(v) => mod('limiter', { ceiling: v })} />
                  </Section>
                  <div className="rack-section flex flex-[1_1_200px] justify-center rounded-[6px] p-2">
                    <GainReductionMeters labels={grLabels} />
                  </div>
                </div>
              </div>
            </RackUnit>

            {/* ---- SI-1: the stereo imager: width, balance, crossfeed ---- */}
            <RackUnit finish={FINISHES.teal} model="SI-1" name={t('rack.imager')}>
              <div className="grid gap-2 sm:grid-cols-3">
                <Section title={t('mod.stereo')} detail={t('mod.stereoDetail')} on={stereo.on} onToggle={(on) => mod('stereo', { on })}>
                  <Knob size={44} color="#4fd1c5" label={t('mod.width')} value={stereo.width} min={0} max={2} step={0.01} format={pct} reset={1} bipolar onChange={(v) => mod('stereo', { width: v })} />
                  <Knob size={44} color="#4fd1c5" label={t('mod.monoBelow')} value={stereo.monoBelow} min={20} max={300} step={5} unit=" Hz" onChange={(v) => mod('stereo', { monoBelow: v })} />
                </Section>
                <Section title={t('mod.balance')} detail={t('mod.balanceDetail')}>
                  <Knob size={44} color="#4fd1c5" label={t('mod.balance')} value={settings.balance} min={-1} max={1} step={0.01} format={balanceLabel} reset={0} bipolar onChange={(v) => update((s) => ({ ...s, balance: v }))} />
                  <Lcd label="L · R" value={balanceLabel(settings.balance)} color="#7ff5ea" />
                </Section>
                <Section title={t('mod.crossfeed')} detail={t('mod.crossfeedDetail')} on={crossfeed.on} onToggle={(on) => mod('crossfeed', { on })}>
                  <Knob size={44} color="#4fd1c5" label={t('mod.amount')} value={crossfeed.amount} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('crossfeed', { amount: v })} />
                </Section>
              </div>
            </RackUnit>

            {/* ---- HX-2: harmonics: exciter and bass enhancer ---- */}
            <RackUnit finish={FINISHES.burgundy} model="HX-2" name={t('rack.harmonics')}>
              <div className="grid gap-2 md:grid-cols-[3fr_2fr]">
                <Section
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
                  <Knob size={44} color="#ff6b57" label={t('mod.drive')} value={exciter.drive} min={1} max={10} step={0.1} unit="×" onChange={(v) => mod('exciter', { drive: v })} />
                  <Knob size={44} color="#ff6b57" label={t('mod.from')} value={exciter.freq} min={800} max={12000} step={50} format={hzUnit} onChange={(v) => mod('exciter', { freq: v })} />
                  <Knob size={44} color="#ff6b57" label={t('mod.mix')} value={exciter.mix} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('exciter', { mix: v })} />
                </Section>
                <Section title={t('mod.bass')} detail={t('mod.bassDetail')} on={bass.on} onToggle={(on) => mod('bass', { on })}>
                  <Knob size={44} color="#ff6b57" label={t('mod.below')} value={bass.freq} min={40} max={200} step={1} unit=" Hz" onChange={(v) => mod('bass', { freq: v })} />
                  <Knob size={44} color="#ff6b57" label={t('mod.amount')} value={bass.amount} min={0} max={1} step={0.01} format={pct} onChange={(v) => mod('bass', { amount: v })} />
                </Section>
              </div>
            </RackUnit>

            {/* ---- TV-5: the tape vibe machine: speed, pitch, reverb ---- */}
            <RackUnit finish={FINISHES.plum} model="TV-5" name={t('rack.vibe')}>
              <Section
                title={t('vibe.title')}
                detail={t('vibe.detail')}
                on={vibeOn}
                onToggle={(on) => setVibe(on ? VIBES.slowed : VIBES.normal)}
                buttons={
                  <>
                    {(Object.keys(VIBES) as (keyof typeof VIBES)[]).map((k) => (
                      <LedButton key={k} on={vibeName === k} onToggle={() => setVibe(VIBES[k])} label={t(`vibe.${k}`)} tone="key" className="h-6 px-2">
                        {t(`vibe.${k}`)}
                      </LedButton>
                    ))}
                    <LedButton on={vibe.lockPitch} onToggle={(on) => setVibe({ ...vibe, lockPitch: on })} label={t('vibe.lockPitch')} tone="amber" className="h-6 px-2">
                      {t('vibe.lockPitch')}
                    </LedButton>
                  </>
                }
              >
                <Lcd label={t('rack.mode')} value={vibeName ? t(`vibe.${vibeName}`) : t('eq.custom')} color="#ff9ae6" />
                <Knob size={44} color="#ff7ad9" label={t('mod.speed')} value={vibe.speed} min={0.5} max={1.5} step={0.01} format={(v) => `${v.toFixed(2)}×`} reset={1} bipolar onChange={(v) => setVibe({ ...vibe, speed: v })} />
                <Knob size={44} color="#ff7ad9" label={t('vibe.pitch')} value={vibe.pitch} min={-12} max={12} step={0.5} format={semis} reset={0} bipolar onChange={(v) => setVibe({ ...vibe, pitch: v })} />
                <Knob size={44} color="#ff7ad9" label={t('vibe.reverb')} value={vibe.reverb} min={0} max={1} step={0.01} format={pct} reset={0} onChange={(v) => setVibe({ ...vibe, reverb: v })} />
              </Section>
            </RackUnit>

            {/* ---- VK-1 and HP-EQ: the vocal eliminator, and the headphone correction ---- */}
            <div className="grid gap-1.5 lg:grid-cols-2">
              <RackUnit finish={FINISHES.midnight} model="VK-1" name={t('rack.karaoke')}>
                <Section
                  title={t('karaoke.title')}
                  detail={t('karaoke.detail')}
                  on={settings.karaoke.on}
                  onToggle={(on) => update((s) => ({ ...s, enabled: true, karaoke: { ...s.karaoke, on } }))}
                  buttons={
                    <LedButton on={fullScreen} onToggle={() => openKaraoke()} label={t('karaoke.open')} tone="key" className="h-6 px-2">
                      {t('karaoke.open')}
                    </LedButton>
                  }
                >
                  <Knob size={44} color="#7aa8ff" label={t('karaoke.vocal')} value={settings.karaoke.vocal} min={0} max={1} step={0.01} format={pct} onChange={(v) => update((s) => ({ ...s, enabled: true, karaoke: { ...s.karaoke, vocal: v } }))} />
                  <Knob size={44} color="#7aa8ff" label={t('karaoke.key')} value={vibe.pitch} min={-12} max={12} step={0.5} format={semis} reset={0} bipolar onChange={(v) => setVibe({ ...vibe, pitch: v })} />
                </Section>
              </RackUnit>
              <RackUnit finish={FINISHES.bronze} model="HP-EQ" name={t('rack.headphone')}>
                <HeadphonePickerBody
                  onApplied={(name) => setNotice(t('autoeq.applied', { name }))}
                  frame={({ children, ...props }) => (
                    <Section {...props}>
                      <div className="w-full">{children}</div>
                    </Section>
                  )}
                />
              </RackUnit>
            </div>

            {/* ---- REC-1: the master recorder, at the foot of the rack ---- */}
            <RecorderUnit />

            <p className="px-2 pt-1 pb-0.5 text-[10.5px]/[14px] text-white/45">{t('eq.footer')}</p>
          </div>
          <div className="rack-rail rounded-[3px]" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
