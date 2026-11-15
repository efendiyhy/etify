import { useEffect, useRef } from 'react';
import { getAnalyser, useVisualizer } from '@/playback/analyser';
import { usePlayer } from '@/state/player';

const MIN_HZ = 40;
const MAX_HZ = 16000;

/**
 * Spectrum bars from the player's analyser: log-spaced, in the key colour,
 * rising from the bottom. They fall away smoothly when the music pauses, and
 * nothing is drawn while the visualizer is off or there is no sound graph.
 */
export function Visualizer({ bars = 64, className = '', opacity = 1 }: { bars?: number; className?: string; opacity?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const enabled = useVisualizer((s) => s.enabled);
  const playing = usePlayer((s) => s.status === 'playing');

  useEffect(() => {
    const element = canvas.current;
    if (!element || !enabled) return;
    const context = element.getContext('2d');
    if (!context) return;
    let frame = 0;
    let levels = new Float32Array(bars);
    let data: Uint8Array<ArrayBuffer> | null = null;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (element.width !== Math.round(width * dpr) || element.height !== Math.round(height * dpr)) {
        element.width = Math.round(width * dpr);
        element.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const analyser = getAnalyser();
      const live = analyser && playing;
      if (analyser && (!data || data.length !== analyser.frequencyBinCount)) data = new Uint8Array(analyser.frequencyBinCount);
      if (live && data) analyser.getByteFrequencyData(data);

      const nyquist = (analyser?.context.sampleRate ?? 48000) / 2;
      const binCount = data?.length ?? 1;
      let moving = false;
      for (let i = 0; i < bars; i++) {
        let target = 0;
        if (live && data) {
          const lo = MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / bars);
          const hi = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((i + 1) / bars);
          const from = Math.max(0, Math.floor((lo / nyquist) * binCount));
          const to = Math.max(from + 1, Math.min(binCount, Math.ceil((hi / nyquist) * binCount)));
          let peak = 0;
          for (let b = from; b < to; b++) peak = Math.max(peak, data[b]!);
          target = peak / 255;
        }
        // Up at once, down gently, so the bars read as music rather than noise.
        const current = levels[i]!;
        levels[i] = target > current ? target : current + (target - current) * 0.12;
        if (levels[i]! > 0.005) moving = true;
      }

      const style = getComputedStyle(element);
      const rgb = style.getPropertyValue('--keyColor-rgb').trim() || '185, 163, 255';
      const gradient = context.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, `rgba(${rgb}, 1)`);
      gradient.addColorStop(1, `rgba(${rgb}, 0.3)`);
      context.fillStyle = gradient;
      context.globalAlpha = opacity;
      const gap = Math.max(1, width / bars / 4);
      const barWidth = width / bars - gap;
      for (let i = 0; i < bars; i++) {
        const h = Math.max(0, levels[i]! * height);
        if (h < 0.5) continue;
        const x = i * (barWidth + gap) + gap / 2;
        const r = Math.min(barWidth / 2, 3);
        context.beginPath();
        context.roundRect(x, height - h, barWidth, h, [r, r, 0, 0]);
        context.fill();
      }

      if (live || moving) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      levels = new Float32Array(bars);
    };
  }, [enabled, playing, bars, opacity]);

  if (!enabled) return null;
  // A canvas keeps its own size under left/right insets: the width has to be given.
  return <canvas ref={canvas} className={`pointer-events-none block w-full ${className}`} aria-hidden="true" />;
}
