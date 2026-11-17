import { MasteringChain } from './dsp/MasteringChain';
import { PRESETS } from './dsp/presets';
import { useMastering } from './dsp/store';

/**
 * Glue between the player and the mastering chain (playback/dsp): the player
 * hands over its Web Audio graph's volume stage and the speakers, and the
 * chain follows the settings from then on. The engine and its settings live
 * in playback/dsp; the page in pages/EqualizerPage.tsx.
 */

let chain: MasteringChain | null = null;

/** Puts the mastering chain between [input] and [output], once for the page. */
export function attachEqualizer(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
  chain = new MasteringChain(ctx, input, output);
  const sync = () => {
    const { settings, bypass, solo } = useMastering.getState();
    chain!.apply(settings, bypass);
    chain!.setSolo(solo);
  };
  sync();
  useMastering.subscribe(sync);
}

/** The running chain, once the player has built its audio graph; null before the first play. */
export function getMasteringChain(): MasteringChain | null {
  return chain;
}

/** The name to show for the settings' preset, in [lang]. */
export function presetLabel(preset: string, lang: 'en' | 'id', customLabel: string): string {
  return PRESETS.find((p) => p.id === preset)?.name[lang] ?? (preset === 'custom' ? customLabel : preset);
}

export { useMastering };
