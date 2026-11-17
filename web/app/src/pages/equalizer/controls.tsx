import type { ReactNode } from 'react';
import { settingsUi } from '../settingsStyles';

/** A labelled horizontal slider with its value; double-click resets to [reset]. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '',
  format,
  reset,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (value: number) => string;
  reset?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const shown = format ? format(value) : `${Number.isInteger(step) ? Math.round(value) : value.toFixed(step < 0.1 ? 2 : 1)}${unit}`;
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${disabled ? 'opacity-50' : ''}`}>
      <span className="flex items-baseline justify-between gap-2 type-[500_12px/16px] text-secondary">
        <span className="truncate">{label}</span>
        <span className="tabular-nums text-primary">{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        onDoubleClick={() => reset !== undefined && onChange(reset)}
        className="w-full cursor-pointer disabled:cursor-default"
        style={{ accentColor: 'var(--keyColor)' }}
      />
    </label>
  );
}

/** A small switch, without a row around it. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return <input type="checkbox" role="switch" aria-label={label} className={settingsUi.switch} checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />;
}

/** An enhancement module: its switch, name and what it does, then its controls. */
export function ModuleCard({
  title,
  detail,
  on,
  onToggle,
  children,
}: {
  title: string;
  detail: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <section className={`${settingsUi.group} px-4 py-3`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="type-title-3 text-primary">{title}</span>
          <span className="type-callout text-secondary">{detail}</span>
        </div>
        <Switch label={title} checked={on} onChange={onToggle} />
      </div>
      {children && <div className={`mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 ${on ? '' : 'opacity-50'}`}>{children}</div>}
    </section>
  );
}

/** A pill button; pressed state through aria-pressed. */
export const pill =
  'inline-flex items-center gap-1.5 rounded-pill bg-quaternary px-3 py-1 type-callout-emphasized text-primary hover:brightness-125 aria-pressed:bg-key-bg aria-pressed:text-white disabled:opacity-50';
