import { Circle, Download, Square, Trash2, Wand2 } from 'lucide-react';
import { useT, type I18nKey } from '@/lib/i18n';
import { FORMATS, formatBytes, formatClock, formatSupported, useRecorder, type RecFormat, type RecMode, type RecSettings } from '@/playback/recorder';
import { FINISHES, Knob, Lcd, LedButton, LedMeter, RackUnit, Section } from './hardware';

/** The settings that record best for most: lossless 24-bit, one song from its start, silence trimmed, safe levels. */
const BEST: Partial<RecSettings> = {
  format: 'wav24',
  mode: 'song',
  fromStart: true,
  autoPause: true,
  trimSilence: true,
  normalize: false,
  compensate: true,
  safetyLimiter: true,
  inputGainDb: 0,
};

/** One-press setups for the common jobs. */
const PROFILES: { id: string; icon: string; label: I18nKey; detail: I18nKey; settings: Partial<RecSettings> }[] = [
  { id: 'best', icon: '🏆', label: 'rec.profile.best', detail: 'rec.profile.bestDetail', settings: BEST },
  { id: 'cd', icon: '💿', label: 'rec.profile.cd', detail: 'rec.profile.cdDetail', settings: { ...BEST, format: 'wav16' } },
  { id: 'share', icon: '🎧', label: 'rec.profile.share', detail: 'rec.profile.shareDetail', settings: { ...BEST, format: 'mp3-320', normalize: true } },
  { id: 'album', icon: '📀', label: 'rec.profile.album', detail: 'rec.profile.albumDetail', settings: { ...BEST, format: 'mp3-320', mode: 'split', normalize: false } },
  { id: 'small', icon: '📦', label: 'rec.profile.small', detail: 'rec.profile.smallDetail', settings: { ...BEST, format: 'opus', trimSilence: false } },
];

const FORMAT_LABEL: Record<RecFormat, string> = {
  wav24: 'WAV 24-bit',
  wav16: 'WAV 16-bit',
  'mp3-320': 'MP3 320',
  'mp3-192': 'MP3 192',
  opus: 'Opus 256',
  aac: 'AAC 256',
};

const matches = (s: RecSettings, p: Partial<RecSettings>) => (Object.keys(p) as (keyof RecSettings)[]).every((k) => s[k] === p[k]);

/** REC-1: the master recorder, at the foot of the rack. */
export function RecorderUnit() {
  const t = useT();
  const rec = useRecorder();
  const { settings: s, status } = rec;
  const busy = status !== 'idle';
  const recording = status === 'recording' || status === 'paused' || status === 'arming';
  const pcm = FORMATS[s.format].pcm;

  const statusText =
    status === 'recording' ? '● REC' : status === 'paused' ? '❚❚ PAUSE' : status === 'encoding' ? t('rec.encoding') : status === 'arming' ? '…' : t('rec.ready');

  return (
    <RackUnit finish={FINISHES.recorder} model="REC-1" name={t('rec.title')}>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Transport, counter and record level. */}
        <div className="rack-section flex flex-col gap-2 rounded-[6px] p-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (recording ? rec.stop() : void rec.start())}
              disabled={status === 'encoding'}
              aria-pressed={recording}
              className="flex h-12 flex-none items-center gap-2 rounded-[8px] border border-black/60 bg-[linear-gradient(180deg,#4a2026,#24090d)] px-4 text-[13px]/[1] font-black tracking-[0.12em] text-white uppercase shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_3px_6px_rgb(0_0_0/0.5)] active:translate-y-px disabled:opacity-50"
            >
              {recording ? (
                <Square size={16} fill="currentColor" />
              ) : (
                <Circle size={18} fill="#ff3b4e" className="text-[#ff3b4e] drop-shadow-[0_0_6px_#ff3b4e]" />
              )}
              {recording ? t('rec.stop') : t('rec.record')}
            </button>
            <div className="flex min-w-[180px] flex-1 flex-col">
              <span
                className="rack-lcd flex items-baseline justify-between gap-2 rounded-[4px] px-2.5 py-1.5"
                style={{ ['--lcd' as string]: status === 'recording' ? '#ff5a6a' : '#9dff8a' }}
              >
                <span className={`text-[12px]/[16px] font-bold ${status === 'recording' ? 'animate-pulse' : ''}`}>{statusText}</span>
                <span className="text-[22px]/[26px] tabular-nums">{formatClock(rec.elapsed)}</span>
              </span>
              <span className="mt-0.5 flex justify-between font-mono text-[10px]/[13px] text-white/50">
                <span>{FORMAT_LABEL[s.format]}</span>
                <span>{formatBytes(rec.bytes)}</span>
              </span>
            </div>
          </div>
          {rec.error && (
            <p className="rounded-[4px] bg-[#ff3b4e]/15 px-2 py-1 text-[11px]/[15px] text-[#ff8a8a]">
              {rec.error === 'play' ? t('rec.errorPlay') : rec.error === 'format' ? t('rec.errorFormat') : rec.error}
            </p>
          )}
          <div className="flex flex-wrap items-end justify-center gap-3">
            <LedMeter db={rec.peakL} label="L" height={110} segments={20} />
            <LedMeter db={rec.peakR} label="R" height={110} segments={20} />
            <button
              type="button"
              onClick={rec.resetClip}
              title={t('rec.clipReset')}
              className="flex flex-col items-center gap-1 self-center"
            >
              <span
                className="size-3.5 rounded-full"
                style={rec.clipped ? { background: '#ff3b4e', boxShadow: '0 0 8px 2px #ff3b4e' } : { background: '#2a0d12', boxShadow: 'inset 0 1px 1px #000' }}
              />
              <span className="text-[9px]/[10px] font-bold tracking-[0.12em] text-white/60 uppercase">Clip</span>
            </button>
            <Knob size={44} color="#ff3b4e" label={t('rec.level')} value={s.inputGainDb} min={-12} max={12} step={0.5} unit=" dB" reset={0} bipolar onChange={(v) => rec.set({ inputGainDb: v })} />
          </div>
          <p className="text-[10.5px]/[14px] text-white/45">{t('rec.levelTip')}</p>
          <div className="rack-lcd mt-auto rounded-[4px] px-2.5 py-2" style={{ ['--lcd' as string]: '#ffcf9a' }}>
            <p className="mb-1 text-[11px]/[14px] font-bold">{t('rec.tipsTitle')}</p>
            <ul className="flex list-none flex-col gap-0.5 text-[10.5px]/[14px]">
              {(['rec.tip1', 'rec.tip2', 'rec.tip3', 'rec.tip4', 'rec.tip5'] as const).map((k) => (
                <li key={k}>› {t(k)}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Setups, format, mode and options. */}
        <div className="flex min-w-0 flex-col gap-2">
          <Section title={t('rec.profiles')} detail={t('rec.profilesDetail')}>
            <div className="grid w-full grid-cols-1 gap-1 sm:grid-cols-2">
              {PROFILES.map((p) => {
                const on = matches(s, p.settings);
                return (
                  <button
                    key={p.id}
                    disabled={busy}
                    onClick={() => rec.set(p.settings)}
                    aria-pressed={on}
                    className="flex items-center gap-2 rounded-[6px] border border-black/40 bg-black/25 px-2 py-1.5 text-start hover:bg-black/35 disabled:opacity-50 aria-pressed:border-[#ff3b4e]/60 aria-pressed:bg-[#ff3b4e]/12"
                  >
                    <span className="text-[16px]/[1]" aria-hidden="true">
                      {p.icon}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[12px]/[16px] font-semibold text-white/90">{t(p.label)}</span>
                      <span className="truncate text-[10.5px]/[13px] text-white/50">{t(p.detail)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            title={t('rec.format')}
            buttons={(Object.keys(FORMATS) as RecFormat[]).map((f) => (
              <LedButton
                key={f}
                on={s.format === f}
                onToggle={() => rec.set({ format: f })}
                label={FORMAT_LABEL[f]}
                tone="red"
                disabled={busy || !formatSupported(f)}
                className="h-6 px-2"
              >
                {FORMAT_LABEL[f]}
              </LedButton>
            ))}
          >
            <Lcd wide label={t('rec.formatNote')} value={t(`rec.fmt.${s.format}` as I18nKey)} color="#ffb4b4" />
          </Section>

          <Section
            title={t('rec.mode')}
            buttons={(['manual', 'song', 'split'] as RecMode[]).map((m) => (
              <LedButton key={m} on={s.mode === m} onToggle={() => rec.set({ mode: m })} label={t(`rec.mode.${m}` as I18nKey)} tone="key" disabled={busy} className="h-6 px-2">
                {t(`rec.mode.${m}` as I18nKey)}
              </LedButton>
            ))}
          >
            <div className="flex w-full flex-wrap justify-center gap-1">
              <LedButton on={s.fromStart} onToggle={(v) => rec.set({ fromStart: v })} label={t('rec.opt.fromStartDetail')} tone="amber" disabled={busy || s.mode === 'manual'} className="h-6 px-2">
                {t('rec.opt.fromStart')}
              </LedButton>
              <LedButton on={s.autoPause} onToggle={(v) => rec.set({ autoPause: v })} label={t('rec.opt.autoPauseDetail')} tone="amber" disabled={busy} className="h-6 px-2">
                {t('rec.opt.autoPause')}
              </LedButton>
              <LedButton on={s.trimSilence && pcm} onToggle={(v) => rec.set({ trimSilence: v })} label={t('rec.opt.trimDetail')} tone="amber" disabled={busy || !pcm} className="h-6 px-2">
                {t('rec.opt.trim')}
              </LedButton>
              <LedButton on={s.normalize && pcm} onToggle={(v) => rec.set({ normalize: v })} label={t('rec.opt.normalizeDetail')} tone="amber" disabled={busy || !pcm} className="h-6 px-2">
                {t('rec.opt.normalize')}
              </LedButton>
              <LedButton on={s.compensate} onToggle={(v) => rec.set({ compensate: v })} label={t('rec.opt.compensateDetail')} tone="green" className="h-6 px-2">
                {t('rec.opt.compensate')}
              </LedButton>
              <LedButton on={s.safetyLimiter} onToggle={(v) => rec.set({ safetyLimiter: v })} label={t('rec.opt.limiterDetail')} tone="green" className="h-6 px-2">
                {t('rec.opt.limiter')}
              </LedButton>
              <button
                type="button"
                disabled={busy}
                onClick={() => rec.set(BEST)}
                className="inline-flex h-6 items-center gap-1 rounded-[6px] border border-black/40 bg-[linear-gradient(180deg,#5a2630,#2d0e14)] px-2 text-[11px]/[1] font-bold tracking-wide text-white uppercase shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] disabled:opacity-50"
              >
                <Wand2 size={12} /> {t('rec.best')}
              </button>
            </div>
          </Section>
        </div>
      </div>

      {/* The takes of this session. */}
      <div className="rack-section mt-2 rounded-[6px] p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10.5px]/[14px] font-bold tracking-[0.16em] uppercase" style={{ color: 'var(--accent)' }}>
            {t('rec.takes')} ({rec.recordings.length})
          </span>
          <span className="text-[10px]/[13px] text-white/45">{t('rec.takesNote')}</span>
        </div>
        {rec.recordings.length === 0 && <p className="px-1 py-2 text-[11.5px]/[16px] text-white/45">{t('rec.empty')}</p>}
        <ul className="flex flex-col gap-1">
          {rec.recordings.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-[5px] bg-black/25 px-2 py-1.5">
              <span className="flex min-w-[160px] flex-1 flex-col">
                <span className="truncate text-[12.5px]/[17px] font-semibold text-white/90">{r.name}</span>
                <span className="font-mono text-[10px]/[13px] text-white/50">
                  {FORMAT_LABEL[r.format]} · {formatClock(r.seconds)} · {formatBytes(r.size)}
                </span>
              </span>
              <audio src={r.url} controls preload="none" className="h-8 max-w-full min-w-[200px] flex-1" />
              <a
                href={r.url}
                download={`${r.name}.${r.ext}`}
                className="grid size-8 place-items-center rounded-full bg-[#ff3b4e]/20 text-[#ffb4b4] hover:bg-[#ff3b4e]/35"
                aria-label={`${t('rec.download')}: ${r.name}`}
                title={t('rec.download')}
              >
                <Download size={15} />
              </a>
              <button
                className="grid size-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-[#ff8a8a]"
                aria-label={`${t('rec.delete')}: ${r.name}`}
                title={t('rec.delete')}
                onClick={() => rec.remove(r.id)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[10px]/[13px] text-white/40">{t('rec.legal')}</p>
      </div>
    </RackUnit>
  );
}
