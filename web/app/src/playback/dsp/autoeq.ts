/**
 * Headphone correction from the AutoEQ project (github.com/jaakkopasanen/AutoEq,
 * MIT): thousands of headphones and earphones measured, each with a
 * parametric EQ that brings it to a neutral target. The index and the
 * profiles are fetched from GitHub when asked; the profiles are Equalizer APO
 * text, which presets.ts already reads.
 */

const BASE = 'https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/';

export interface HeadphoneEntry {
  name: string;
  /** Who measured it, and on what rig. */
  source: string;
  /** The profile's folder, relative to results/, as GitHub encodes it. */
  path: string;
}

let index: Promise<HeadphoneEntry[]> | null = null;

/** The whole list, fetched once (about 9 000 entries). */
export function headphoneIndex(): Promise<HeadphoneEntry[]> {
  index ??= fetch(`${BASE}INDEX.md`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then((text) => {
      const out: HeadphoneEntry[] = [];
      for (const line of text.split('\n')) {
        const m = /^- \[(.+?)\]\(\.\/(.+?)\) by (.+)$/.exec(line.trim());
        if (m) out.push({ name: m[1]!, path: m[2]!, source: m[3]!.replace(/ on /, ' · ') });
      }
      return out;
    })
    .catch((error: unknown) => {
      index = null;
      throw error;
    });
  return index;
}

/** The best matches for [query]: every word must appear; names that start with it first. */
export function searchHeadphones(all: HeadphoneEntry[], query: string, limit = 40): HeadphoneEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits = all.filter((e) => {
    const name = e.name.toLowerCase();
    return words.every((w) => name.includes(w));
  });
  const q = words.join(' ');
  hits.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.length - b.name.length);
  return hits.slice(0, limit);
}

/** The profile's Equalizer APO text: a preamp and up to ten filters. */
export async function headphoneProfile(entry: HeadphoneEntry): Promise<string> {
  const folder = decodeURIComponent(entry.path.split('/').pop()!);
  const url = `${BASE}${entry.path}/${encodeURIComponent(`${folder} ParametricEQ.txt`)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
