import { ChevronRight, SlidersHorizontal, Users } from 'lucide-react';
import { lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react';
import { MdOutlineExtension } from 'react-icons/md';
import { SiApplemusic, SiDiscord, SiSpotify, SiYoutubemusic } from 'react-icons/si';
import { PageHeader } from '@/components/PageHeader';
import { PrefetchLink } from '@/components/PrefetchLink';
import { useDiscord } from '@/extension/useDiscord';
import { useExtension } from '@/extension/useExtension';
import { useYtAuth } from '@/extension/useYtAuth';
import { useParty } from '@/party/useParty';
import { useHistorySettings } from '@/playback/historyReporting';
import { Select } from '@/components/Select';
import { AUTOMIX_BARS } from '@/playback/automix/choices';
import { greetingKey } from '@/lib/greeting';
import { LANGUAGES, useLanguage, useT, type Lang, type Translate } from '@/lib/i18n';
import { useEqualizer, EQ_PRESETS } from '@/playback/equalizer';
import { useAppearance, type ThemePref } from '@/state/appearance';
import { CROSSFADE_CHOICES, usePlayer } from '@/state/player';
import { NICKNAME_MAX, useProfile } from '@/state/profile';
import { AppleMusicIntegration, AppleMusicToggles, CanvasToggle, DiscordIntegration, LyricSourcesAccess, SpotifyIntegration, Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const LyricsSettings = lazy(() => import('@/shell/LyricsSettings').then((m) => ({ default: m.LyricsSettings })));

/** An integration's coloured glyph, as on the Extension page. */
function Glyph({ Icon, color, ink }: { Icon: ComponentType<{ size?: number }>; color: string; ink?: string }) {
  return (
    <span className={settingsUi.integrationIcon} style={{ backgroundColor: color, ...(ink && { color: ink }) }}>
      <Icon size={15} />
    </span>
  );
}

/** A row that opens a page of its own. */
function LinkRow({ to, icon, title, value }: { to: string; icon?: ReactNode; title: string; value?: string | null }) {
  return (
    <PrefetchLink to={to} className={`${icon ? settingsUi.integration : settingsUi.integrationPlain} ${settingsUi.linkRow}`}>
      {icon}
      <span className={settingsUi.integrationName}>{title}</span>
      <span className={settingsUi.value}>
        {value}
        <ChevronRight size={16} />
      </span>
    </PrefetchLink>
  );
}

function youtubeText(auth: ReturnType<typeof useYtAuth>, t: Translate): string {
  if (auth.state === 'checking') return t('yt.checking');
  if (auth.state === 'unavailable') return t('common.needsExtension');
  const { browserSignedIn, connected, active } = auth.auth;
  if (!browserSignedIn) return t('yt.notSignedIn');
  if (!connected) return t('yt.disconnected');
  return active ? useProfile.getState().nickname.trim() || active.name : t('yt.signedIn');
}

/**
 * Settings (SettingsSheet on the phone): the account and its integrations,
 * Listen Together, playback and lyrics, in the same grouped rows.
 */
export default function SettingsPage() {
  const extension = useExtension();
  const yt = useYtAuth();
  const discord = useDiscord();
  const party = useParty();
  const autoplay = usePlayer((s) => s.autoplay);
  const crossfadeSec = usePlayer((s) => s.crossfadeSec);
  const automix = usePlayer((s) => s.automix);
  const automixBars = usePlayer((s) => s.automixBars);
  const showNerdStats = usePlayer((s) => s.showNerdStats);
  const shareHistory = useHistorySettings((s) => s.share);
  const setShareHistory = useHistorySettings((s) => s.setShare);
  const { setAutoplay, setCrossfade, setAutomix, setAutomixBars, setShowNerdStats } = usePlayer.getState();
  const [lyrics, setLyrics] = useState(false);
  const nickname = useProfile((s) => s.nickname);
  const t = useT();
  const lang = useLanguage((s) => s.lang);
  const setLang = useLanguage((s) => s.setLang);
  const theme = useAppearance((s) => s.theme);
  const setTheme = useAppearance((s) => s.setTheme);
  const eqEnabled = useEqualizer((s) => s.enabled);
  const eqPreset = useEqualizer((s) => s.preset);
  const setNickname = useProfile((s) => s.setNickname);
  const present = extension.state === 'present';
  const discordText =
    discord.state === 'ready' && discord.discord.connected
      ? discord.discord.enabled
        ? 'On'
        : 'Off'
      : discord.state === 'ready' && discord.discord.available
        ? 'Not connected'
        : null;

  return (
    <div className={settingsUi.centered}>
      <PageHeader title={t('settings.title')} />
      <div className={settingsUi.body}>
        <h2 className={settingsUi.sectionHeader}>{t('settings.profile')}</h2>
        <section className={settingsUi.group}>
          <label className={settingsUi.controlRow}>
            <span>{t('settings.nickname')}</span>
            <input
              className={settingsUi.input}
              placeholder="e.g. Yamata"
              value={nickname}
              maxLength={NICKNAME_MAX}
              autoComplete="nickname"
              onChange={(e) => setNickname(e.currentTarget.value)}
            />
          </label>
        </section>
        <p className={settingsUi.footer}>
          {t('settings.nicknameFooter')}
          {nickname.trim() ? ` (“${t(greetingKey())}, ${nickname.trim()}”)` : ''}
        </p>

        <h2 className={settingsUi.sectionHeader}>{t('settings.appearance')}</h2>
        <section className={settingsUi.group}>
          <label className={settingsUi.controlRow}>
            <span>{t('settings.theme')}</span>
            <Select<ThemePref>
              label={t('settings.theme')}
              value={theme}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
              onChange={setTheme}
            />
          </label>
          <label className={settingsUi.controlRow}>
            <span>{t('settings.language')}</span>
            <Select<Lang> label={t('settings.language')} value={lang} options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))} onChange={setLang} />
          </label>
        </section>
        <p className={settingsUi.footer}>{t('settings.appearanceFooter')}</p>

        <h2 className={settingsUi.sectionHeader}>{t('settings.account')}</h2>
        <section className={settingsUi.group}>
          <div className={settingsUi.integration}>
            <Glyph Icon={SiYoutubemusic} color="#ffffff" ink="#ff0033" />
            <span className={settingsUi.integrationName}>YouTube Music</span>
            <span className={settingsUi.value}>{youtubeText(yt, t)}</span>
          </div>
          <div className={settingsUi.integration}>
            <Glyph Icon={SiSpotify} color="#1ed760" />
            <span className={settingsUi.integrationName}>Spotify</span>
            {present ? <SpotifyIntegration /> : <span className={settingsUi.value}>{t('common.needsExtension')}</span>}
          </div>
          {present && discord.state === 'ready' && discord.discord.available && (
            <LinkRow to="/settings/discord" icon={<Glyph Icon={SiDiscord} color="#5865f2" />} title="Discord" value={discordText} />
          )}
          <LinkRow
            to="/extension"
            icon={<Glyph Icon={MdOutlineExtension} color="#636366" />}
            title="Etify Extension"
            value={present ? `v${extension.extension.info.version}` : t('common.notInstalled')}
          />
        </section>
        <section className={`${settingsUi.group} mt-3 empty:hidden`}>
          <Toggle
            label={t('settings.shareHistory')}
            detail={
              present && !extension.extension.info.capabilities.includes('yt.stats')
                ? 'Update the Etify extension to share: this version can’t send plays to YouTube.'
                : t('settings.shareHistoryDetail')
            }
            checked={shareHistory}
            onChange={setShareHistory}
          />
          <CanvasToggle />
        </section>

        <h2 className={settingsUi.sectionHeader}>Apple Music</h2>
        <section className={settingsUi.group}>
          <div className={settingsUi.integration}>
            <Glyph Icon={SiApplemusic} color="#fa2d48" />
            <span className={settingsUi.integrationName}>Extension Access</span>
            {present ? <AppleMusicIntegration /> : <span className={settingsUi.value}>{t('common.needsExtension')}</span>}
          </div>
          <AppleMusicToggles />
        </section>
        <p className={settingsUi.footer}>From Apple Music’s public pages. No Apple Music account or sign-in needed.</p>

        <h2 className={settingsUi.sectionHeader}>{t('settings.listenTogether')}</h2>
        <section className={settingsUi.group}>
          <LinkRow
            to="/settings/listen-together"
            icon={<Glyph Icon={Users} color="#fa2d48" />}
            title={t('settings.listenTogether')}
            value={party.code ? t('settings.inParty', { code: party.code }) : t('settings.listenTogetherValue')}
          />
        </section>

        <h2 className={settingsUi.sectionHeader}>{t('settings.playback')}</h2>
        <section className={settingsUi.group}>
          <LinkRow
            to="/settings/equalizer"
            icon={<Glyph Icon={SlidersHorizontal} color="#8b6cf0" />}
            title={t('settings.equalizer')}
            value={eqEnabled ? (EQ_PRESETS.find((p) => p.id === eqPreset)?.name[lang] ?? t('eq.custom')) : t('common.off')}
          />
          <Toggle
            label={t('settings.autoplay')}
            detail={t('settings.autoplayDetail')}
            checked={autoplay}
            onChange={setAutoplay}
          />
          <label className={settingsUi.controlRow}>
            <span>{t('settings.crossfade')}</span>
            <Select<number | 'automix'>
              label={t('settings.crossfade')}
              value={automix ? 'automix' : crossfadeSec}
              options={[
                ...CROSSFADE_CHOICES.map((seconds) => ({ value: seconds, label: seconds === 0 ? t('common.off') : t('settings.seconds', { n: seconds }) })),
                { value: 'automix', label: 'Automix' },
              ]}
              onChange={(value) => (value === 'automix' ? setAutomix(true) : setCrossfade(value))}
            />
          </label>
          {automix && (
            <label className={settingsUi.controlRow}>
              <span>{t('settings.blendLength')}</span>
              <Select
                label={t('settings.blendLength')}
                value={automixBars}
                options={AUTOMIX_BARS.map((bars) => ({ value: bars, label: t('settings.upToBars', { n: bars }) }))}
                onChange={setAutomixBars}
              />
            </label>
          )}
          <Toggle
            label={t('settings.nerdStats')}
            detail={t('settings.nerdStatsDetail')}
            checked={showNerdStats}
            onChange={setShowNerdStats}
          />
        </section>
        {automix && (
          <p className={settingsUi.footer}>
            Automix finds each song’s tempo, key and phrases, then blends on the beat: the next song is time-stretched to match, and
            the bass swaps over halfway. Where it can, it loops a few instrumental bars of each song and ramps the tempo between
            them. Songs it can’t read in time play to the end and crossfade. Based on AutoMix by David Finnegan (AGPL-3.0).
          </p>
        )}

        <h2 className={settingsUi.sectionHeader}>{t('settings.lyrics')}</h2>
        <section className={settingsUi.group}>
          <button className={`${settingsUi.integrationPlain} ${settingsUi.linkRow}`} onClick={() => setLyrics(true)}>
            <span className={settingsUi.integrationName}>{t('settings.lyricSources')}</span>
            <span className={settingsUi.value}>
              {t('settings.lyricSourcesValue')}
              <ChevronRight size={16} />
            </span>
          </button>
          <div className={settingsUi.integrationPlain}>
            <span className={settingsUi.integrationName}>{t('settings.lyricAccess')}</span>
            {present ? <LyricSourcesAccess /> : <span className={settingsUi.value}>{t('common.needsExtension')}</span>}
          </div>
        </section>
      </div>
      {lyrics && (
        <Suspense fallback={null}>
          <LyricsSettings onClose={() => setLyrics(false)} />
        </Suspense>
      )}
    </div>
  );
}
