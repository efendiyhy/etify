import { Megaphone, Play, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Select } from '@/components/Select';
import { useT } from '@/lib/i18n';
import { djSupported, listVoices, useDj, type DjEvery } from '@/playback/dj';
import { Knob } from './equalizer/hardware';
import { Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

/** The system's voices, kept fresh: Chrome fills the list a moment after the page loads. */
function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(listVoices);
  useEffect(() => {
    if (!djSupported()) return;
    const update = () => setVoices(listVoices());
    window.speechSynthesis.addEventListener('voiceschanged', update);
    update();
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

const pill =
  'inline-flex items-center gap-1.5 rounded-pill bg-quaternary px-3 py-1 type-callout-emphasized text-primary hover:brightness-125 disabled:opacity-50';

/** Settings › AI DJ: the voice, how it talks, and what it says. */
export default function DjPage() {
  const t = useT();
  const dj = useDj();
  const voices = useVoices();
  const [draft, setDraft] = useState('');
  const [once, setOnce] = useState('');

  if (!djSupported()) {
    return (
      <div className={settingsUi.centered}>
        <PageHeader title={t('dj.title')} />
        <p className={`${settingsUi.body} type-body text-secondary`}>{t('dj.unsupported')}</p>
      </div>
    );
  }

  const addLine = () => {
    const line = draft.trim();
    if (!line) return;
    dj.set({ lines: [...dj.lines, line].slice(0, 50) });
    setDraft('');
  };

  return (
    <div className={settingsUi.centered}>
      <PageHeader title={t('dj.title')} />
      <div className={settingsUi.body}>
        <section className={settingsUi.group}>
          <Toggle label={t('dj.title')} detail={t('dj.detail')} checked={dj.enabled} onChange={dj.setEnabled} />
          <label className={settingsUi.controlRow}>
            <span>{t('dj.when')}</span>
            <Select<DjEvery>
              label={t('dj.when')}
              value={dj.every}
              options={[
                { value: 1, label: t('dj.every1') },
                { value: 2, label: t('dj.every2') },
                { value: 3, label: t('dj.every3') },
              ]}
              onChange={dj.setEvery}
            />
          </label>
        </section>

        <h2 className={settingsUi.sectionHeader}>{t('dj.voice')}</h2>
        <section className={settingsUi.group}>
          <label className={settingsUi.controlRow}>
            <span>{t('dj.voice')}</span>
            <Select<string>
              label={t('dj.voice')}
              value={dj.voice ?? ''}
              options={[{ value: '', label: t('dj.voiceAuto') }, ...voices.map((v) => ({ value: v.voiceURI, label: `${v.name} · ${v.lang}` }))]}
              onChange={(voice) => dj.set({ voice: voice || null })}
            />
          </label>
          <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-3">
            <Knob size={44} label={t('dj.rate')} value={dj.rate} min={0.5} max={1.8} step={0.01} format={(v) => `${v.toFixed(2)}×`} reset={1.03} onChange={(rate) => dj.set({ rate })} />
            <Knob size={44} label={t('dj.pitch')} value={dj.pitch} min={0} max={2} step={0.01} format={(v) => v.toFixed(2)} reset={1} bipolar onChange={(pitch) => dj.set({ pitch })} />
            <Knob
              size={44}
              label={t('dj.duck')}
              value={dj.duck}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              reset={0.28}
              onChange={(duck) => dj.set({ duck })}
            />
            <button className={`${pill} ms-2`} onClick={dj.speakNow}>
              <Play size={14} /> {t('dj.preview')}
            </button>
          </div>
        </section>
        <p className={settingsUi.footer}>{t('dj.voiceFooter')}</p>

        <h2 className={settingsUi.sectionHeader}>{t('dj.lines')}</h2>
        <section className={`${settingsUi.group} flex flex-col gap-2 px-4 py-3`}>
          {dj.lines.length === 0 && <p className="type-callout text-secondary">{t('dj.linesEmpty')}</p>}
          {dj.lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2 rounded-[8px] bg-quaternary px-3 py-2">
              <span className="min-w-0 flex-1 type-body text-primary">{line}</span>
              <button className="grid size-7 flex-none place-items-center rounded-full hover:bg-quinary" aria-label={t('dj.sayThis')} title={t('dj.sayThis')} onClick={() => dj.say(line)}>
                <Play size={14} />
              </button>
              <button
                className="grid size-7 flex-none place-items-center rounded-full text-[#ff5a6a] hover:bg-quinary"
                aria-label={t('dj.deleteLine')}
                title={t('dj.deleteLine')}
                onClick={() => dj.set({ lines: dj.lines.filter((_, j) => j !== i) })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addLine();
            }}
          >
            <input className="min-w-0 flex-1 rounded-[8px] border-0 bg-quaternary px-2.5 py-[5px] type-body text-primary placeholder:text-tertiary" value={draft} maxLength={300} placeholder={t('dj.linePlaceholder')} onChange={(e) => setDraft(e.currentTarget.value)} />
            <button className={pill} type="submit" disabled={!draft.trim()}>
              <Plus size={14} /> {t('dj.addLine')}
            </button>
          </form>
          <Toggle label={t('dj.onlyMine')} detail={t('dj.onlyMineDetail')} checked={dj.onlyMine} onChange={(onlyMine) => dj.set({ onlyMine })} />
        </section>
        <p className={settingsUi.footer}>{t('dj.placeholders')}</p>

        <h2 className={settingsUi.sectionHeader}>{t('dj.sayNow')}</h2>
        <section className={`${settingsUi.group} px-4 py-3`}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              dj.say(once);
            }}
          >
            <input className="min-w-0 flex-1 rounded-[8px] border-0 bg-quaternary px-2.5 py-[5px] type-body text-primary placeholder:text-tertiary" value={once} maxLength={300} placeholder={t('dj.sayNowPlaceholder')} onChange={(e) => setOnce(e.currentTarget.value)} />
            <button className={pill} type="submit" disabled={!once.trim()}>
              <Megaphone size={14} /> {t('dj.say')}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
