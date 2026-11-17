import { useEffect, useMemo, useRef } from 'react';
import { logFrequencies, responseDb } from '@/playback/dsp/filters';
import { MAX_GAIN, MAX_HZ, MAX_Q, MIN_HZ, MIN_Q, type EqBand } from '@/playback/dsp/types';
import { getMasteringChain } from '@/playback/equalizer';

/**
 * The interactive EQ graph: the pre- and post-EQ spectrum (two analysers,
 * log frequency) behind the bands' combined curve, measured with
 * getFrequencyResponse, and a handle per band.
 *
 * - drag a handle: frequency (x) and gain (y, for the types that have gain)
 * - scroll on a handle: Q
 * - Alt+click a handle: solo that band (again, or Alt+click elsewhere: un-solo)
 * - double-click empty space: turn on the first unused band there
 */

const HEIGHT = 320;
const PAD = { left: 40, right: 12, top: 12, bottom: 24 };
const DB_RANGE = MAX_GAIN;
const SPECTRUM_MIN = -100;
const SPECTRUM_MAX = -10;
const GRID_HZ = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const GRID_DB = [-24, -18, -12, -6, 0, 6, 12, 18, 24];
export const BAND_COLORS = ['#ff7a90', '#ff9f5a', '#ffd25a', '#9be15d', '#4fd1a5', '#4fc3f7', '#6c8cff', '#a58bff', '#d07bff', '#ff7ad9', '#bdbdbd', '#8d8d8d'];

const hasGain = (band: EqBand) => band.type === 'peaking' || band.type === 'lowshelf' || band.type === 'highshelf' || band.type === 'tilt';
const label = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : String(hz));

interface Props {
  bands: EqBand[];
  enabled: boolean;
  selected: number;
  solo: number | null;
  onSelect: (index: number) => void;
  onChange: (index: number, patch: Partial<EqBand>) => void;
  onSolo: (index: number | null) => void;
  ariaLabel: string;
}

export function EqCanvas({ bands, enabled, selected, solo, onSelect, onChange, onSolo, ariaLabel }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<number | null>(null);
  // The latest props for the draw loop and the listeners, without restarting them.
  const live = useRef({ bands, enabled, selected, solo });
  live.current = { bands, enabled, selected, solo };
  const handlers = useRef({ onSelect, onChange, onSolo });
  handlers.current = { onSelect, onChange, onSolo };

  const width = useRef(800);
  const freqs = useMemo(() => logFrequencies(400), []);
  const curves = useMemo(() => responseDb(bands, freqs), [bands, freqs]);
  const curvesRef = useRef(curves);
  curvesRef.current = curves;

  const plotW = () => width.current - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xOf = (hz: number) => PAD.left + (Math.log10(hz / MIN_HZ) / Math.log10(MAX_HZ / MIN_HZ)) * plotW();
  const hzOf = (x: number) => MIN_HZ * (MAX_HZ / MIN_HZ) ** Math.min(1, Math.max(0, (x - PAD.left) / plotW()));
  const yOf = (db: number) => PAD.top + ((DB_RANGE - db) / (2 * DB_RANGE)) * plotH;
  const dbOf = (y: number) => DB_RANGE - ((y - PAD.top) / plotH) * 2 * DB_RANGE;
  const handleY = (band: EqBand) => yOf(hasGain(band) ? (band.type === 'tilt' ? band.gain / 2 : band.gain) : 0);

  // ---- Drawing: every frame while mounted (the spectrum moves) -------------------
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    let frame = 0;
    let pre: Float32Array<ArrayBuffer> | null = null;
    let post: Float32Array<ArrayBuffer> | null = null;

    const spectrumPath = (data: Float32Array, sampleRate: number) => {
      const binHz = sampleRate / 2 / data.length;
      const path = new Path2D();
      const left = PAD.left;
      const right = width.current - PAD.right;
      for (let x = left; x <= right; x += 2) {
        const f0 = hzOf(x);
        const f1 = hzOf(x + 2);
        let peak = SPECTRUM_MIN;
        for (let b = Math.floor(f0 / binHz); b <= Math.ceil(f1 / binHz) && b < data.length; b++) peak = Math.max(peak, data[b]!);
        const norm = Math.min(1, Math.max(0, (peak - SPECTRUM_MIN) / (SPECTRUM_MAX - SPECTRUM_MIN)));
        const y = PAD.top + plotH - norm * plotH;
        if (x === left) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      return path;
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      width.current = element.clientWidth;
      if (element.width !== Math.round(width.current * dpr)) element.width = Math.round(width.current * dpr);
      if (element.height !== Math.round(HEIGHT * dpr)) element.height = Math.round(HEIGHT * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const style = getComputedStyle(element);
      const key = style.getPropertyValue('--keyColor').trim() || '#b9a3ff';
      const keyRgb = style.getPropertyValue('--keyColor-rgb').trim() || '185, 163, 255';
      const text = style.getPropertyValue('--systemSecondary').trim() || '#999';
      const grid = style.getPropertyValue('--systemQuaternary').trim() || '#333';
      const { bands: b, enabled: on, selected: sel, solo: soloing } = live.current;
      const { total, perBand } = curvesRef.current;
      const w = width.current;
      ctx.clearRect(0, 0, w, HEIGHT);

      // Grid and labels.
      ctx.lineWidth = 1;
      ctx.font = '500 10px system-ui, sans-serif';
      ctx.fillStyle = text;
      ctx.strokeStyle = grid;
      for (const hz of GRID_HZ) {
        const x = Math.round(xOf(hz)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, PAD.top + plotH);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(label(hz), x, HEIGHT - 8);
      }
      for (const db of GRID_DB) {
        const y = Math.round(yOf(db)) + 0.5;
        ctx.globalAlpha = db === 0 ? 1 : 0.6;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(w - PAD.right, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.textAlign = 'right';
        ctx.fillText(`${db > 0 ? '+' : ''}${db}`, PAD.left - 6, y + 3);
      }

      // Spectrum (RTA): before the EQ, filled and faint; after, a line.
      const chain = getMasteringChain();
      if (chain) {
        pre ??= new Float32Array(chain.preAnalyser.frequencyBinCount);
        post ??= new Float32Array(chain.postAnalyser.frequencyBinCount);
        chain.preAnalyser.getFloatFrequencyData(pre);
        chain.postAnalyser.getFloatFrequencyData(post);
        const rate = chain.ctx.sampleRate;
        const prePath = spectrumPath(pre, rate);
        const filled = new Path2D(prePath);
        filled.lineTo(w - PAD.right, PAD.top + plotH);
        filled.lineTo(PAD.left, PAD.top + plotH);
        filled.closePath();
        ctx.fillStyle = `rgba(${keyRgb}, 0.10)`;
        ctx.fill(filled);
        ctx.strokeStyle = `rgba(${keyRgb}, 0.25)`;
        ctx.stroke(prePath);
        ctx.strokeStyle = `rgba(${keyRgb}, 0.55)`;
        ctx.lineWidth = 1.25;
        ctx.stroke(spectrumPath(post, rate));
      }

      // The selected band's own curve, filled.
      const selCurve = perBand[sel];
      if (selCurve && b[sel]?.on) {
        ctx.beginPath();
        ctx.moveTo(PAD.left, yOf(0));
        for (let i = 0; i < freqs.length; i++) ctx.lineTo(xOf(freqs[i]!), yOf(Math.max(-DB_RANGE, Math.min(DB_RANGE, selCurve[i]!))));
        ctx.lineTo(w - PAD.right, yOf(0));
        ctx.closePath();
        ctx.fillStyle = `${BAND_COLORS[sel]}33`;
        ctx.fill();
      }

      // The combined curve.
      ctx.beginPath();
      for (let i = 0; i < freqs.length; i++) {
        const x = xOf(freqs[i]!);
        const y = yOf(Math.max(-DB_RANGE, Math.min(DB_RANGE, total[i]!)));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = key;
      ctx.globalAlpha = on ? 1 : 0.45;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Handles.
      b.forEach((band, i) => {
        const x = xOf(band.freq);
        const y = handleY(band);
        const r = i === sel ? 11 : 9;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = band.on ? BAND_COLORS[i]! : 'rgba(128,128,128,0.25)';
        ctx.fill();
        if (i === sel || soloing === i) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = soloing === i ? '#ffd25a' : '#ffffff';
          ctx.stroke();
        }
        ctx.fillStyle = band.on ? '#111' : text;
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), x, y + 3.5);
      });

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
    // The draw loop reads live props through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Pointer and wheel -----------------------------------------------------------
  const hit = (x: number, y: number): number | null => {
    let best: number | null = null;
    let bestD = 14 * 14;
    live.current.bands.forEach((band, i) => {
      const dx = xOf(band.freq) - x;
      const dy = handleY(band) - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  const point = (e: { clientX: number; clientY: number }) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    // Non-passive, so the page doesn't scroll while Q changes.
    const onWheel = (e: WheelEvent) => {
      const { x, y } = point(e);
      const i = hit(x, y);
      if (i === null) return;
      e.preventDefault();
      const band = live.current.bands[i]!;
      const q = Math.min(MAX_Q, Math.max(MIN_Q, band.q * (e.deltaY > 0 ? 1 / 1.12 : 1.12)));
      handlers.current.onSelect(i);
      handlers.current.onChange(i, { q: Math.round(q * 100) / 100 });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (i: number, x: number, y: number) => {
    const band = live.current.bands[i]!;
    const freq = Math.round(hzOf(x));
    const patch: Partial<EqBand> = { freq };
    if (hasGain(band)) {
      const db = Math.round(Math.max(-DB_RANGE, Math.min(DB_RANGE, dbOf(y))) * 10) / 10;
      patch.gain = band.type === 'tilt' ? Math.max(-DB_RANGE, Math.min(DB_RANGE, db * 2)) : db;
    }
    handlers.current.onChange(i, patch);
  };

  return (
    <canvas
      ref={canvas}
      className="block w-full touch-none cursor-crosshair select-none"
      style={{ height: HEIGHT }}
      role="img"
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        const { x, y } = point(e);
        const i = hit(x, y);
        if (e.altKey) {
          handlers.current.onSolo(i === null || live.current.solo === i ? null : i);
          if (i !== null) handlers.current.onSelect(i);
          return;
        }
        if (i === null) return;
        handlers.current.onSelect(i);
        drag.current = i;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current === null) {
          const { x, y } = point(e);
          e.currentTarget.style.cursor = hit(x, y) === null ? 'crosshair' : 'grab';
          return;
        }
        const { x, y } = point(e);
        move(drag.current, x, y);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onDoubleClick={(e) => {
        const { x, y } = point(e);
        if (hit(x, y) !== null) return;
        const free = live.current.bands.findIndex((b) => !b.on);
        if (free < 0) return;
        handlers.current.onChange(free, {
          on: true,
          type: 'peaking',
          freq: Math.round(hzOf(x)),
          gain: Math.round(dbOf(y) * 10) / 10,
          q: 1.41,
        });
        handlers.current.onSelect(free);
      }}
    />
  );
}
