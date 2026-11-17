import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Mixer hardware for the equaliser page: rotary knobs (potentiometers) and
 * lit push buttons, drawn as on a mixing desk.
 */

const START = -135;
const SWEEP = 270;

/** The pointer's angle around [el]'s centre, degrees clockwise from straight up. */
function pointerAngle(el: Element, x: number, y: number): number {
  const r = el.getBoundingClientRect();
  return (Math.atan2(x - (r.left + r.width / 2), r.top + r.height / 2 - y) * 180) / Math.PI;
}

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
  /** Fills its column and shows only the value (the mixer's narrow strips). */
  compact?: boolean;
  onChange: (value: number) => void;
}

/**
 * A potentiometer: turn it with the cursor, round its centre, clockwise to
 * raise (Shift for fine steps); or scroll, or use the
 * arrow keys; double-click resets.
 */
export function Knob({ label, value, min, max, step = 0.1, unit = '', format, reset, bipolar, disabled, size = 38, color, compact, onChange }: KnobProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ angle: number; value: number } | null>(null);
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
    <div className={`flex flex-none flex-col items-center gap-0.5 select-none ${compact ? 'w-full' : 'w-[58px]'} ${disabled ? 'opacity-40' : ''}`}>
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
        className="cursor-grab touch-none active:cursor-grabbing rounded-full outline-none focus-visible:ring-2 focus-visible:ring-key"
        style={compact ? { width: '100%', maxWidth: size + 18, aspectRatio: '1' } : { width: size + 18, height: size + 18 }}
        onPointerDown={(e) => {
          if (disabled) return;
          drag.current = { angle: pointerAngle(e.currentTarget, e.clientX, e.clientY), value };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const angle = pointerAngle(e.currentTarget, e.clientX, e.clientY);
          // The turn since the last move, the short way round (so crossing the bottom doesn't jump).
          let turn = angle - drag.current.angle;
          if (turn > 180) turn -= 360;
          if (turn < -180) turn += 360;
          drag.current.angle = angle;
          const { min: lo, max: hi } = live.current;
          drag.current.value = Math.min(hi, Math.max(lo, drag.current.value + (turn / SWEEP) * span * (e.shiftKey ? 0.2 : 1)));
          set(drag.current.value);
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
        <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" className="overflow-visible">
          <defs>
            {/* Brushed aluminium: a bright top-left, a darker rim. */}
            <radialGradient id={`${id}-cap`} cx="38%" cy="30%" r="78%">
              <stop offset="0" stopColor="#fbfaff" />
              <stop offset="0.45" stopColor="#c9c5d6" />
              <stop offset="0.8" stopColor="#8d889c" />
              <stop offset="1" stopColor="#5d5869" />
            </radialGradient>
            <linearGradient id={`${id}-skirt`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3b3646" />
              <stop offset="1" stopColor="#0c0a12" />
            </linearGradient>
            <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Scale ticks printed round the knob. */}
          {Array.from({ length: 11 }, (_, i) => {
            const a = START + (i / 10) * SWEEP;
            const p = polar(c, c, 31.8, a);
            const q = polar(c, c, i % 5 === 0 ? 28.6 : 29.8, a);
            return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--systemTertiary)" strokeWidth={i % 5 === 0 ? 1.4 : 1} />;
          })}
          {/* The LED ring: unlit track, lit arc. */}
          <path d={track} fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="3.4" strokeLinecap="round" />
          {fill && <path d={fill} fill="none" stroke={color ?? 'var(--keyColor)'} strokeWidth="3" strokeLinecap="round" filter={`url(#${id}-glow)`} />}
          {/* Drop shadow, knurled skirt, then the domed metal cap. */}
          <circle cx={c} cy={c + 1.6} r="22" fill="#000" opacity="0.45" />
          <circle cx={c} cy={c} r="22" fill={`url(#${id}-skirt)`} />
          <circle cx={c} cy={c} r="21" fill="none" stroke="#5a5466" strokeWidth="1.6" strokeDasharray="1 1.4" />
          <circle cx={c} cy={c} r="17" fill={`url(#${id}-cap)`} stroke="#2a2633" strokeWidth="0.8" />
          <circle cx={c} cy={c} r="12.5" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="0.6" />
          <circle cx={c} cy={c} r="8" fill="none" stroke="#000" strokeOpacity="0.08" strokeWidth="0.6" />
          {/* The pointer: an engraved line with a coloured tip. */}
          <line x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} stroke="#1b1822" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx={tip.x} cy={tip.y} r="1.6" fill={color ?? 'var(--keyColor)'} />
        </svg>
      </div>
      <span id={id} className="rounded-[3px] bg-black/35 px-1 font-mono whitespace-nowrap text-[10.5px]/[14px] tabular-nums text-primary shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]">
        {shown}
      </span>
      {/* Two lines kept for every label, so knobs in a row line up. */}
      {!compact && (
        <span className="line-clamp-2 flex min-h-5 max-w-full items-start justify-center text-center type-[600_9px/10px] tracking-wide text-secondary uppercase">
          {label}
        </span>
      )}
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
  on = true,
  onToggle,
  buttons,
  children,
  wide,
  free,
}: {
  title: string;
  detail: string;
  on?: boolean;
  /** Without it the strip has no power button (always on). */
  onToggle?: (on: boolean) => void;
  /** Push buttons under the description (modes, extras). */
  buttons?: ReactNode;
  children?: ReactNode;
  wide?: boolean;
  /** Its own layout inside, not a grid of knobs. */
  free?: boolean;
}) {
  return (
    <section
      className={`flex flex-col rounded-[12px] border border-quaternary bg-quinary p-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_1px_2px_rgb(0_0_0/0.12)] ${wide ? 'col-span-full' : ''}`}
      title={detail}
    >
      <header className="mb-1 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate type-[700_12px/16px] tracking-wide text-primary uppercase">{title}</span>
        {onToggle ? <LedButton on={on} onToggle={onToggle} label={title} /> : <span className="h-7" />}
      </header>
      <p className="mb-2 line-clamp-1 type-[500_11px/14px] text-secondary">{detail}</p>
      {buttons && <div className="mb-2 flex flex-wrap justify-center gap-1">{buttons}</div>}
      {children && (
        <div
          className={`mt-auto transition-opacity ${wide || free ? '' : 'grid grid-cols-[repeat(auto-fit,58px)] justify-center gap-x-0.5 gap-y-2'} ${on ? '' : 'opacity-45'}`}
        >
          {children}
        </div>
      )}
    </section>
  );
}

// ---- The rack (pages/EqualizerPage.tsx) --------------------------------------------

/** A faceplate's colours: top and bottom of its gradient, and its accent (LEDs, arcs, legends). */
export interface Finish {
  top: string;
  bottom: string;
  accent: string;
}

export const FINISHES = {
  controller: { top: '#2b2735', bottom: '#17141f', accent: '#b9a3ff' },
  violet: { top: '#3a2766', bottom: '#1d1236', accent: '#c4b0ff' },
  orange: { top: '#2a2522', bottom: '#141110', accent: '#ff8a3d' },
  gunmetal: { top: '#3d4049', bottom: '#1b1c22', accent: '#ffcf4a' },
  teal: { top: '#1f2f3b', bottom: '#0f171f', accent: '#4fd1c5' },
  burgundy: { top: '#45192a', bottom: '#200a13', accent: '#ff6b57' },
  plum: { top: '#3b1d45', bottom: '#1c0c22', accent: '#ff7ad9' },
  midnight: { top: '#232347', bottom: '#101028', accent: '#7aa8ff' },
  bronze: { top: '#3a2e1d', bottom: '#1b150c', accent: '#ffb020' },
} satisfies Record<string, Finish>;

function Screw() {
  return <span className="rack-screw block size-[11px] rounded-full" aria-hidden="true" />;
}

/**
 * One device in the rack: ears with screws, a faceplate in its own finish,
 * the maker's badge and model, and (when it has one) its power switch.
 */
export function RackUnit({
  finish,
  model,
  name,
  power,
  onPower,
  powerLabel,
  extra,
  children,
}: {
  finish: Finish;
  /** The model number on the badge, e.g. "EQ-12". */
  model: string;
  name: string;
  power?: boolean;
  onPower?: (on: boolean) => void;
  powerLabel?: string;
  /** Controls in the badge row, after the name. */
  extra?: ReactNode;
  children: ReactNode;
}) {
  const style = { ['--face-top' as string]: finish.top, ['--face-bottom' as string]: finish.bottom, ['--accent' as string]: finish.accent };
  return (
    <section className="flex items-stretch" style={style} aria-label={`${model} ${name}`}>
      <div className="rack-ear flex w-[22px] flex-none flex-col items-center justify-between rounded-l-[4px] py-2.5 max-sm:w-3 max-sm:[&>span]:hidden">
        <Screw />
        <Screw />
      </div>
      <div className="rack-face min-w-0 flex-1 px-3 pt-2 pb-3">
        <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-black/40 pb-2 shadow-[0_1px_0_rgb(255_255_255/0.06)]">
          <span className="flex items-baseline gap-2">
            <span className="text-[11px]/[14px] font-black tracking-[0.28em] text-white/85 italic">ETIFY</span>
            <span className="rounded-[3px] px-1.5 py-px text-[10px]/[14px] font-bold tracking-[0.12em]" style={{ background: finish.accent, color: '#120c1c' }}>
              {model}
            </span>
          </span>
          <span className="min-w-0 truncate text-[11px]/[14px] font-semibold tracking-[0.16em] text-white/70 uppercase">{name}</span>
          <span className="flex-1" />
          {extra}
          {onPower && <PowerSwitch on={!!power} onToggle={onPower} label={powerLabel ?? name} />}
        </header>
        {children}
      </div>
      <div className="rack-ear flex w-[22px] flex-none flex-col items-center justify-between rounded-r-[4px] py-2.5 max-sm:w-3 max-sm:[&>span]:hidden">
        <Screw />
        <Screw />
      </div>
    </section>
  );
}

/** A toggle switch with its power LED, as on a hardware unit. */
export function PowerSwitch({ on, onToggle, label, disabled }: { on: boolean; onToggle: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onToggle(!on)}
      className="group flex flex-none items-center gap-1.5 disabled:opacity-40"
    >
      <span
        className="size-2 rounded-full transition-[background-color,box-shadow]"
        style={on ? { background: '#ff3b4e', boxShadow: '0 0 7px 2px #ff3b4e' } : { background: '#2a0d12', boxShadow: 'inset 0 1px 1px #000' }}
      />
      <span className="relative h-[22px] w-[13px] rounded-[3px] bg-[#0b0910] shadow-[inset_0_1px_3px_#000,0_1px_0_rgb(255_255_255/0.1)]">
        <span
          className={`absolute inset-x-[1.5px] h-[11px] rounded-[2px] bg-[linear-gradient(180deg,#f2f0f7,#8f8a9c)] shadow-[0_1px_2px_rgb(0_0_0/0.7)] transition-[top] ${on ? 'top-[1.5px]' : 'top-[9.5px]'}`}
        />
      </span>
      <span className="text-[9px]/[10px] font-bold tracking-[0.14em] text-white/60 uppercase">Power</span>
    </button>
  );
}

/**
 * A module inside a unit: its silkscreened name, its own power button, then
 * its controls. Dimmed while off, like a bypassed processor.
 */
export function Section({
  title,
  detail,
  on = true,
  onToggle,
  buttons,
  children,
  className = '',
}: {
  title: string;
  detail?: string;
  on?: boolean;
  onToggle?: (on: boolean) => void;
  buttons?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rack-section flex min-w-0 flex-col rounded-[6px] p-2 ${className}`} title={detail}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10.5px]/[14px] font-bold tracking-[0.16em] uppercase" style={{ color: 'var(--accent)' }}>
          {title}
        </span>
        {onToggle && <LedButton on={on} onToggle={onToggle} label={title} className="h-6 px-2" />}
      </div>
      {detail && <p className="mb-1.5 line-clamp-2 text-[10.5px]/[13px] text-white/55">{detail}</p>}
      {buttons && <div className="mb-1.5 flex flex-wrap justify-center gap-1">{buttons}</div>}
      {children && <div className={`mt-auto flex flex-wrap items-start justify-center gap-x-1 gap-y-2 transition-opacity ${on ? '' : 'opacity-45'}`}>{children}</div>}
    </div>
  );
}

/** A segmented LED meter, bottom to top: green, then amber, then red near the top. */
export function LedMeter({ db, label, floor = -60, segments = 24, height = 132 }: { db: number; label: string; floor?: number; segments?: number; height?: number }) {
  const lit = Math.round(Math.max(0, Math.min(1, (db - floor) / -floor)) * segments);
  return (
    <div className="flex flex-col items-center gap-1" role="meter" aria-label={label} aria-valuemin={floor} aria-valuemax={0} aria-valuenow={Math.round(db)}>
      <div className="rack-screen flex flex-col-reverse gap-[2px] rounded-[3px] p-[3px]" style={{ height }}>
        {Array.from({ length: segments }, (_, i) => {
          const color = i >= segments - 2 ? '#ff3b4e' : i >= segments - 6 ? '#ffc23a' : '#3ddc84';
          const on = i < lit;
          return (
            <span
              key={i}
              className="w-3 flex-1 rounded-[1px]"
              style={on ? { background: color, boxShadow: `0 0 4px ${color}` } : { background: color, opacity: 0.12 }}
            />
          );
        })}
      </div>
      <span className="text-[9px]/[10px] font-bold tracking-[0.12em] text-white/60 uppercase">{label}</span>
    </div>
  );
}

/** A small backlit readout: a label above, a value in a glowing display. */
export function Lcd({ label, value, color, wide }: { label: string; value: string; color?: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? 'min-w-0 flex-1' : ''}`}>
      <span className="text-[9px]/[10px] font-bold tracking-[0.12em] text-white/55 uppercase">{label}</span>
      <span className="rack-lcd truncate rounded-[3px] px-2 py-1 text-[12px]/[16px] tabular-nums" style={color ? { ['--lcd' as string]: color } : undefined}>
        {value}
      </span>
    </div>
  );
}
