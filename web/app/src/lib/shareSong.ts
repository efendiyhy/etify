import type { Track } from '@/data/music/types';
import { t } from './i18n';
import { shareImage, songCard } from './shareCard';

/** Makes a song's share card and shares or downloads it. */
export async function shareSongCard(track: Pick<Track, 'title' | 'thumbnail' | 'artists'>): Promise<void> {
  try {
    const blob = await songCard({
      title: track.title,
      artist: track.artists.map((a) => a.name).join(', '),
      artwork: track.thumbnail,
      caption: t('share.listening'),
    });
    const safe = track.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'song';
    await shareImage(blob, `etify-${safe}.png`, `${track.title} — ${track.artists.map((a) => a.name).join(', ')}`);
  } catch {
    alert(t('share.failed'));
  }
}
