import { create } from 'zustand';

/**
 * A tap on the finished sound (after volume and the equaliser) for the
 * visualizer. It exists once the player's Web Audio graph does; the graph is
 * built when Automix, the equaliser or the visualizer asks for it.
 */
let analyser: AnalyserNode | null = null;

export function tapAnalyser(ctx: AudioContext, node: AudioNode): void {
  analyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0.78, minDecibels: -90, maxDecibels: -20 });
  node.connect(analyser);
}

export function getAnalyser(): AnalyserNode | null {
  return analyser;
}

const VIZ_KEY = 'etify:visualizer';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(VIZ_KEY) !== '0';
  } catch {
    return true;
  }
}

interface VisualizerState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

/** Whether the visualizer draws (Settings › Playback); on unless turned off. */
export const useVisualizer = create<VisualizerState>()((set) => ({
  enabled: readEnabled(),
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(VIZ_KEY, enabled ? '1' : '0');
    } catch {
      // The choice then lasts for this tab.
    }
    set({ enabled });
  },
}));
