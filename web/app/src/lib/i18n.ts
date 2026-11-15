import { create } from 'zustand';

/**
 * The web player's languages. The frame (top bar, library, player), Home,
 * Settings, the equaliser and the common page states are translated; pages
 * that are mostly YouTube Music's own text follow later.
 */
export type Lang = 'en' | 'id';

export const LANGUAGES: { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Bahasa Indonesia' },
];

const en = {
  'greeting.morning': 'Good morning',
  'greeting.afternoon': 'Good afternoon',
  'greeting.evening': 'Good evening',
  'greeting.night': 'Good night',

  'nav.home': 'Home',
  'nav.search': 'Search',
  'nav.new': 'New',
  'nav.settings': 'Settings',
  'nav.extension': 'Etify Extension',
  'search.placeholder': 'Search songs, artists, albums',

  'library.title': 'Your Library',
  'library.collapse': 'Collapse Your Library',
  'library.expand': 'Expand Your Library',
  'library.recent': 'Recently Played',
  'library.playlists': 'Playlists',
  'library.allPlaylists': 'All Playlists',
  'library.allSpotify': 'All Spotify Playlists',
  'library.playlist': 'Playlist',
  'library.spotifyPlaylist': 'Spotify playlist',
  'library.emptyTitle': 'Your playlists and recent plays',
  'library.emptyDetail': 'Install the Etify extension and sign in to YouTube Music to see them here.',
  'common.showAll': 'Show all',
  'common.getExtension': 'Get the Extension',
  'common.tryAgain': 'Try Again',
  'common.developedBy': 'Developed by',
  'common.on': 'On',
  'common.off': 'Off',
  'common.reset': 'Reset',
  'common.needsExtension': 'Needs the extension',
  'common.notInstalled': 'Not installed',
  'yt.checking': 'Checking…',
  'yt.notSignedIn': 'Not signed in',
  'yt.disconnected': 'Disconnected',
  'yt.signedIn': 'Signed in',

  'banner.appTitle': 'Etify is better in the app.',
  'banner.appDetail': 'Phone browsers can’t run the Etify extension. The Android app has everything.',
  'banner.getApp': 'Get the App',
  'banner.extTitle': 'Play YouTube Music with the Etify extension.',
  'banner.extDetail': 'Playback, YouTube Music sign-in, Spotify and Discord need the extension. Addons and lyrics work without it.',

  'state.needsTitle': 'Browse {what} with the Etify extension',
  'state.needsDetail': 'The extension lets this page reach YouTube Music from your own browser. Addons and lyrics work without it.',
  'state.loadError': 'Couldn’t load this page',
  'state.loadMore': 'Couldn’t load more.',

  'settings.title': 'Settings',
  'settings.profile': 'Profile',
  'settings.nickname': 'Nickname',
  'settings.nicknameFooter':
    'Shown in Home’s greeting, on the account button and to others in Listen Together, instead of your Google account’s name. Saved on this browser.',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.themeSystem': 'System',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.language': 'Language',
  'settings.appearanceFooter': 'System follows your computer’s light or dark setting.',
  'settings.account': 'Account & Integrations',
  'settings.shareHistory': 'Share Listening Activity to YouTube',
  'settings.shareHistoryDetail': 'Songs you play here go to your YouTube Music history and shape its recommendations.',
  'settings.listenTogether': 'Listen Together',
  'settings.listenTogetherValue': 'Listen in sync with friends',
  'settings.inParty': 'In party {code}',
  'settings.playback': 'Playback',
  'settings.equalizer': 'Equalizer',
  'settings.autoplay': 'AutoPlay',
  'settings.autoplayDetail': 'When the queue ends, keep playing similar music.',
  'settings.crossfade': 'Crossfade',
  'settings.seconds': '{n} seconds',
  'settings.blendLength': 'Blend Length',
  'settings.upToBars': 'Up to {n} bars',
  'settings.nerdStats': 'Show Stats for Nerds',
  'settings.nerdStatsDetail': 'Codec, bitrate and sample rate under the artist in the full-screen player, and what Automix is doing.',
  'settings.lyrics': 'Lyrics',
  'settings.lyricSources': 'Lyric Sources',
  'settings.lyricSourcesValue': 'Order, sources, syllable timing',
  'settings.lyricAccess': 'Lyric Sources Access',

  'eq.title': 'Equalizer',
  'eq.enable': 'Equalizer',
  'eq.enableDetail': 'Shapes everything you play here, on this browser.',
  'eq.preset': 'Preset',
  'eq.custom': 'Custom',
  'eq.preamp': 'Preamp',
  'eq.bands': 'Bands',
  'eq.footer':
    'Ten bands from 32 Hz to 16 kHz, ±12 dB each, with a preamp to keep loud boosts from clipping. Turning it on routes playback through Web Audio, the same path Automix uses.',
  'eq.curve': 'Frequency response',
} as const;

export type I18nKey = keyof typeof en;

const id: Record<I18nKey, string> = {
  'greeting.morning': 'Selamat pagi',
  'greeting.afternoon': 'Selamat siang',
  'greeting.evening': 'Selamat sore',
  'greeting.night': 'Selamat malam',

  'nav.home': 'Beranda',
  'nav.search': 'Cari',
  'nav.new': 'Baru',
  'nav.settings': 'Pengaturan',
  'nav.extension': 'Ekstensi Etify',
  'search.placeholder': 'Cari lagu, artis, album',

  'library.title': 'Koleksimu',
  'library.collapse': 'Ciutkan Koleksimu',
  'library.expand': 'Lebarkan Koleksimu',
  'library.recent': 'Baru Diputar',
  'library.playlists': 'Playlist',
  'library.allPlaylists': 'Semua Playlist',
  'library.allSpotify': 'Semua Playlist Spotify',
  'library.playlist': 'Playlist',
  'library.spotifyPlaylist': 'Playlist Spotify',
  'library.emptyTitle': 'Playlist dan lagu yang baru kamu putar',
  'library.emptyDetail': 'Pasang ekstensi Etify dan masuk ke YouTube Music untuk melihatnya di sini.',
  'common.showAll': 'Lihat semua',
  'common.getExtension': 'Pasang Ekstensi',
  'common.tryAgain': 'Coba Lagi',
  'common.developedBy': 'Dikembangkan oleh',
  'common.on': 'Aktif',
  'common.off': 'Mati',
  'common.reset': 'Atur ulang',
  'common.needsExtension': 'Perlu ekstensi',
  'common.notInstalled': 'Belum terpasang',
  'yt.checking': 'Memeriksa…',
  'yt.notSignedIn': 'Belum masuk',
  'yt.disconnected': 'Terputus',
  'yt.signedIn': 'Sudah masuk',

  'banner.appTitle': 'Etify lebih lengkap di aplikasinya.',
  'banner.appDetail': 'Browser HP tidak bisa menjalankan ekstensi Etify. Aplikasi Android punya semua fiturnya.',
  'banner.getApp': 'Unduh Aplikasi',
  'banner.extTitle': 'Putar YouTube Music dengan ekstensi Etify.',
  'banner.extDetail': 'Pemutaran, masuk YouTube Music, Spotify, dan Discord butuh ekstensi. Addon dan lirik tetap jalan tanpanya.',

  'state.needsTitle': 'Jelajahi {what} dengan ekstensi Etify',
  'state.needsDetail': 'Ekstensi membuat halaman ini bisa mengakses YouTube Music dari browsermu sendiri. Addon dan lirik tetap jalan tanpanya.',
  'state.loadError': 'Halaman ini gagal dimuat',
  'state.loadMore': 'Gagal memuat lagi.',

  'settings.title': 'Pengaturan',
  'settings.profile': 'Profil',
  'settings.nickname': 'Nama panggilan',
  'settings.nicknameFooter':
    'Ditampilkan di sapaan Beranda, tombol akun, dan ke orang lain di Dengar Bersama, menggantikan nama akun Google-mu. Disimpan di browser ini.',
  'settings.appearance': 'Tampilan',
  'settings.theme': 'Tema',
  'settings.themeSystem': 'Ikuti sistem',
  'settings.themeLight': 'Terang',
  'settings.themeDark': 'Gelap',
  'settings.language': 'Bahasa',
  'settings.appearanceFooter': 'Ikuti sistem memakai pengaturan terang atau gelap di komputermu.',
  'settings.account': 'Akun & Integrasi',
  'settings.shareHistory': 'Bagikan Aktivitas Mendengar ke YouTube',
  'settings.shareHistoryDetail': 'Lagu yang kamu putar di sini masuk ke riwayat YouTube Music dan memengaruhi rekomendasinya.',
  'settings.listenTogether': 'Dengar Bersama',
  'settings.listenTogetherValue': 'Dengar musik bareng teman',
  'settings.inParty': 'Di pesta {code}',
  'settings.playback': 'Pemutaran',
  'settings.equalizer': 'Equalizer',
  'settings.autoplay': 'Putar Otomatis',
  'settings.autoplayDetail': 'Saat antrean habis, terus putar musik yang mirip.',
  'settings.crossfade': 'Crossfade',
  'settings.seconds': '{n} detik',
  'settings.blendLength': 'Panjang Transisi',
  'settings.upToBars': 'Hingga {n} bar',
  'settings.nerdStats': 'Tampilkan Info Teknis',
  'settings.nerdStatsDetail': 'Codec, bitrate, dan sample rate di bawah nama artis di pemutar layar penuh, serta apa yang sedang dilakukan Automix.',
  'settings.lyrics': 'Lirik',
  'settings.lyricSources': 'Sumber Lirik',
  'settings.lyricSourcesValue': 'Urutan, sumber, waktu per suku kata',
  'settings.lyricAccess': 'Akses Sumber Lirik',

  'eq.title': 'Equalizer',
  'eq.enable': 'Equalizer',
  'eq.enableDetail': 'Mengatur suara semua yang kamu putar di sini, di browser ini.',
  'eq.preset': 'Preset',
  'eq.custom': 'Kustom',
  'eq.preamp': 'Preamp',
  'eq.bands': 'Band',
  'eq.footer':
    'Sepuluh band dari 32 Hz sampai 16 kHz, masing-masing ±12 dB, dengan preamp supaya penguatan besar tidak pecah. Saat aktif, pemutaran lewat Web Audio, jalur yang sama dengan Automix.',
  'eq.curve': 'Respons frekuensi',
};

const DICTS: Record<Lang, Record<I18nKey, string>> = { en, id };
const LANG_KEY = 'etify:language';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'id') return saved;
  } catch {
    // Storage refused: fall through to the browser's own language.
  }
  return navigator.language.toLowerCase().startsWith('id') ? 'id' : 'en';
}

interface LanguageState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLanguage = create<LanguageState>()((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // The choice then lasts for this tab.
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

document.documentElement.lang = useLanguage.getState().lang;

function format(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** A translated string, outside React (reads the current language). */
export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  return format(DICTS[useLanguage.getState().lang][key] ?? en[key], vars);
}

export type Translate = (key: I18nKey, vars?: Record<string, string | number>) => string;

/** The translator for the current language; re-renders the component when it changes. */
export function useT(): Translate {
  const lang = useLanguage((s) => s.lang);
  return (key, vars) => format(DICTS[lang][key] ?? en[key], vars);
}
