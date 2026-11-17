import { create } from 'zustand';
import { applyPreset, fromApo, fromJson } from './presets';
import { defaultBands, defaultSettings, sanitizeSettings, type EqBand, type MasteringSettings } from './types';

/**
 * The mastering settings as app state, kept in localStorage: the live
 * settings, the A/B slots, the user's own presets, and the momentary states
 * (bypass, solo) that aren't saved.
 */

export interface CustomPreset {
  name: string;
  settings: MasteringSettings;
}

type Slot = 'A' | 'B';

interface MasteringState {
  settings: MasteringSettings;
  /** Hear the input untouched (time-aligned), without turning the chain off. */
  bypass: boolean;
  /** The band being auditioned on its own (Alt+click), or null. */
  solo: number | null;
  slot: Slot;
  /** The other slot's settings; the live settings are always the current slot's. */
  other: MasteringSettings | null;
  custom: CustomPreset[];

  update: (change: (s: MasteringSettings) => MasteringSettings) => void;
  setEnabled: (enabled: boolean) => void;
  setBand: (index: number, patch: Partial<EqBand>) => void;
  setPreset: (id: string) => void;
  reset: () => void;
  setBypass: (bypass: boolean) => void;
  setSolo: (index: number | null) => void;
  switchSlot: () => void;
  copyToOther: () => void;
  savePreset: (name: string) => void;
  deletePreset: (name: string) => void;
  importJson: (text: string) => string;
  importApo: (text: string) => void;
}

const KEY = 'etify:mastering';
const LEGACY_KEY = 'etify:equalizer';

interface Saved {
  settings: MasteringSettings;
  slot: Slot;
  other: MasteringSettings | null;
  custom: CustomPreset[];
}

/** The earlier ten-band equaliser's settings, carried over into the first ten bands. */
function migrateLegacy(): MasteringSettings | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null') as {
      enabled?: boolean;
      preset?: string;
      gains?: number[];
      preampDb?: number;
    } | null;
    if (!raw) return null;
    const base = defaultSettings();
    const bands = defaultBands().map((b, i) => (Array.isArray(raw.gains) && i < 10 ? { ...b, gain: Number(raw.gains[i]) || 0 } : b));
    return sanitizeSettings({
      ...base,
      enabled: raw.enabled === true,
      preset: raw.preset === 'acoustic' ? 'acoustic-classic' : (raw.preset ?? 'custom'),
      bands,
      autoPreamp: false,
      preampDb: Number(raw.preampDb) || 0,
    });
  } catch {
    return null;
  }
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (raw?.settings) {
      return {
        settings: sanitizeSettings(raw.settings),
        slot: raw.slot === 'B' ? 'B' : 'A',
        other: raw.other ? sanitizeSettings(raw.other) : null,
        custom: Array.isArray(raw.custom)
          ? raw.custom.filter((p) => p && typeof p.name === 'string').map((p) => ({ name: p.name, settings: sanitizeSettings(p.settings) }))
          : [],
      };
    }
  } catch {
    // Unreadable: start over below.
  }
  return { settings: migrateLegacy() ?? defaultSettings(), slot: 'A', other: null, custom: [] };
}

function save({ settings, slot, other, custom }: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ settings, slot, other, custom }));
  } catch {
    // Full or refused storage: the settings last for this tab.
  }
}

export const useMastering = create<MasteringState>()((set, get) => {
  const commit = (patch: Partial<Saved>) => {
    set(patch);
    const { settings, slot, other, custom } = get();
    save({ settings, slot, other, custom });
  };
  const edit = (change: (s: MasteringSettings) => MasteringSettings) => commit({ settings: change(get().settings) });

  return {
    ...load(),
    bypass: false,
    solo: null,
    update: (change) => edit((s) => ({ ...change(s), preset: 'custom' })),
    setEnabled: (enabled) => edit((s) => ({ ...s, enabled })),
    setBand: (index, patch) =>
      edit((s) => ({ ...s, enabled: true, preset: 'custom', bands: s.bands.map((b, i) => (i === index ? { ...b, ...patch } : b)) })),
    setPreset: (id) => {
      const custom = get().custom.find((p) => p.name === id);
      if (custom) return edit(() => ({ ...custom.settings, enabled: true, preset: custom.name }));
      const next = applyPreset(get().settings, id);
      if (next) edit(() => next);
    },
    reset: () => edit((s) => ({ ...defaultSettings(), enabled: s.enabled })),
    setBypass: (bypass) => set({ bypass }),
    setSolo: (solo) => set({ solo }),
    switchSlot: () => {
      const { settings, other, slot } = get();
      // The first switch to B starts B as a copy of A.
      commit({ settings: other ?? settings, other: settings, slot: slot === 'A' ? 'B' : 'A' });
    },
    copyToOther: () => commit({ other: get().settings }),
    savePreset: (name) => {
      const clean = name.trim().slice(0, 40);
      if (!clean) return;
      const settings = { ...get().settings, preset: clean };
      commit({ settings, custom: [...get().custom.filter((p) => p.name !== clean), { name: clean, settings }] });
    },
    deletePreset: (name) => commit({ custom: get().custom.filter((p) => p.name !== name) }),
    importJson: (text) => {
      const { name, settings } = fromJson(text);
      const clean = name.trim().slice(0, 40) || 'Imported';
      const imported = { ...settings, enabled: true, preset: clean };
      commit({ settings: imported, custom: [...get().custom.filter((p) => p.name !== clean), { name: clean, settings: imported }] });
      return clean;
    },
    importApo: (text) => edit((s) => fromApo(text, s)),
  };
});
