import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Mixer hardware for the equaliser page: rotary knobs (potentiometers) and
 * lit push buttons, drawn as on a mixing desk.
 */

const START = -135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  if (Math.abs(to - from) < 0.01) return '';
  const a = polar(cx, cy, r, Math.min(from, to));
  const b = polar(cx, cy, r, Math.max(from, to));
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${r},${r} 0 ${large} 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

export interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (value: number) => string;
  /** Double-click (or Backspace) goes back here. */
  reset?: number;
  /** The arc grows from the middle (gain, width) instead of from the left. */
  bipolar?: boolean;
  disabled?: boolean;
  /** The cap's diameter, px. */
  size?: number;
  /** The arc's colour; the key colour by default. */
  color?: string;
  onChange: (value: number) => void;
}

/**
 * A potentiometer: drag up/down (Shift for fine steps), scroll, or use the
 * arrow keys; double-click resets.
 */
export function Knob({ label, value, min, max, step = 0.1, unit = '', format, reset, bipolar, disabled, size = 46, color, onChange }: KnobProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; value: number } | null>(null);
  const live = useRef({ value, min, max, step, onChange, disabled });
  live.current = { value, min, max, step, onChange, disabled };
  const id = useId();

  const span = max - min;
  const norm = Math.min(1, Math.max(0, (value - min) / span));
  const angle = START + norm * SWEEP;
  const shown = format ? format(value) : `${Number.isInteger(step) ? Math.round(value) : value.toFixed(step < 0.1 ? 2 : 1)}${unit}`;

  const set = (next: number) => {
    const { min: lo, max: hi, step: s } = live.current;
    const snapped = Math.round(Math.min(hi, Math.max(lo, next)) / s) * s;
    live.current.onChange(Number(snapped.toFixed(4)));
  };

  // Wheel needs a non-passive listener, so the page doesn't scroll under it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (live.current.disabled) return;
      e.preventDefault();
      const { value: v, min: lo, max: hi, step: s } = live.current;
      const unitStep = Math.max(s, (hi - lo) / 100) * (e.shiftKey ? 0.2 : 1);
      set(v + (e.deltaY < 0 ? unitStep : -unitStep));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = 32;
  const r = 27;
  const track = arc(c, c, r, START, START + SWEEP);
  const from = bipolar ? START + SWEEP / 2 : START;
  const fill = arc(c, c, r, from, angle);
  const tip = polar(c, c, 17, angle);
  const base = polar(c, c, 6, angle);

  return (
    <div className={`flex w-[72px] flex-none flex-col items-center gap-1 select-none ${disabled ? 'opacity-40' : ''}`}>
      <div
        ref={ref}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={shown}
        aria-disabled={disabled}
        aria-describedby={id}
        className="cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-key"
        style={{ width: size + 18, height: size + 18 }}
        onPointerDown={(e) => {
          if (disabled) return;
          drag.current = { y: e.clientY, value };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dy = drag.current.y - e.clientY;
          set(drag.current.value + (dy / (e.shiftKey ? 1000 : 220)) * span);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => reset !== undefined && !disabled && set(reset)}
        onKeyDown={(e) => {
          if (disabled) return;
          const unitStep = Math.max(step, span / 100);
          const moves: Record<string, number> = {
            ArrowUp: unitStep,
            ArrowRight: unitStep,
            ArrowDown: -unitStep,
            ArrowLeft: -unitStep,
            PageUp: span / 10,
            PageDown: -span / 10,
          };
          if (e.key in moves) {
            e.preventDefault();
            set(value + moves[e.key]!);
          } else if (e.key === 'Home') set(min);
          else if (e.key === 'End') set(max);
          else if ((e.key === 'Backspace' || e.key === 'Delete') && reset !== undefined) set(reset);
        }}
      >
        <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
          <defs>
            <radialGradient id={`${id}-cap`} cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor="#5b5866" />
              <stop offset="0.55" stopColor="#2c2a33" />
              <stop offset="1" stopColor="#15141a" />
            </radialGradient>
          </defs>
          {/* Scale ticks around the knob. */}
          {Array.from({ length: 11 }, (_, i) => {
            const a = START + (i / 10) * SWEEP;
            const p = polar(c, c, 31.5, a);
            const q = polar(c, c, 29.5, a);
            return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--systemTertiary)" strokeWidth="1" />;
          })}
          <path d={track} fill="none" stroke="var(--systemQuaternary)" strokeWidth="3.5" strokeLinecap="round" />
          {fill && <path d={fill} fill="none" stroke={color ?? 'var(--keyColor)'} strokeWidth="3.5" strokeLinecap="round" />}
          {/* The cap: knurled edge, then the domed top. */}
          <circle cx={c} cy={c} r="21" fill="#0d0c10" />
          <circle cx={c} cy={c} r="20" fill="none" stroke="#3a3842" strokeWidth="2" strokeDasharray="1.2 1.6" />
          <circle cx={c} cy={c} r="17.5" fill={`url(#${id}-cap)`} stroke="#000" strokeOpacity="0.6" />
          <line x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>
      <span id={id} className="type-[600_11px/14px] tabular-nums text-primary">
        {shown}
      </span>
      <span className="max-w-full truncate text-center type-[600_10px/12px] tracking-wide text-secondary uppercase">{label}</span>
    </div>
  );
}

/**
 * A lit push button: dark when off, its LED glowing when on. [tone] colours
 * the LED: green for power, amber for solo or bypass, the key colour else.
 */
export function LedButton({
  on,
  onToggle,
  label,
  children,
  tone = 'green',
  disabled,
  className = '',
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  label: string;
  children?: ReactNode;
  tone?: 'green' | 'amber' | 'red' | 'key';
  disabled?: boolean;
  className?: string;
}) {
  const led = { green: '#3ddc84', amber: '#ffb020', red: '#ff4d5e', key: 'var(--keyColor)' }[tone];
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={children ? undefined : label}
      title={label}
      disabled={disabled}
      onClick={() => onToggle(!on)}
      className={`inline-flex h-7 flex-none items-center gap-1.5 rounded-[6px] border border-black/40 bg-[linear-gradient(180deg,#3a3842,#24222b)] px-2.5 type-[700_11px/1] tracking-wide text-white/85 uppercase shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_2px_3px_rgb(0_0_0/0.35)] transition-[transform,box-shadow] active:translate-y-px active:shadow-[inset_0_1px_3px_rgb(0_0_0/0.5)] disabled:opacity-40 ${className}`}
    >
      <span
        className="size-2 flex-none rounded-full transition-[background-color,box-shadow] duration-150"
        style={on ? { background: led, boxShadow: `0 0 6px 1px ${led}` } : { background: '#14131a', boxShadow: 'inset 0 1px 1px rgb(0 0 0 / 0.8)' }}
      />
      {children ?? (on ? 'On' : 'Off')}
    </button>
  );
}

/** A mixer channel strip: name, its power button, then its knobs. */
export function Strip({
  title,
  detail,
  on,
  onToggle,
  children,
  wide,
}: {
  title: string;
  detail: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      className={`flex flex-col rounded-[12px] border border-quaternary bg-quinary p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_1px_2px_rgb(0_0_0/0.12)] ${wide ? 'col-span-full' : ''}`}
      title={detail}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate type-[700_12px/16px] tracking-wide text-primary uppercase">{title}</span>
        <LedButton on={on} onToggle={onToggle} label={title} />
      </header>
      <p className="mb-2 type-[500_11px/14px] text-secondary">{detail}</p>
      {children && <div className={`flex flex-wrap justify-center gap-x-1 gap-y-3 transition-opacity ${on ? '' : 'opacity-45'}`}>{children}</div>}
    </section>
  );
}
