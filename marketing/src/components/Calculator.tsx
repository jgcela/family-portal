'use client';
import { useMemo, useState } from 'react';
import { calculatorDefaults, calculatorLimits } from '@/config/site';
import { calculateSavings, formatHours, formatUSD, validateField, type FieldKey } from '@/lib/savings';

type Raw = Record<FieldKey, string>;

const FIELDS: { key: FieldKey; label: string; hint?: string; unit: string; prefix?: boolean }[] = [
  { key: 'tasksPerWeek', label: 'Routine tasks per week', unit: 'tasks', hint: 'Repeat questions, attendance emails, form follow-ups.' },
  {
    key: 'sharePercent',
    label: 'Share of tasks fully handled without staff intervention',
    unit: '%',
    hint: 'Count a task only if it needs zero staff time.',
  },
  { key: 'minutesPerTask', label: 'Staff minutes saved per fully avoided task', unit: 'min' },
  { key: 'weeksPerYear', label: 'School weeks per year', unit: 'weeks' },
  { key: 'hourlyCost', label: 'Hourly staff cost', unit: '$', prefix: true },
];

const toRaw = (): Raw => ({
  tasksPerWeek: String(calculatorDefaults.tasksPerWeek),
  sharePercent: String(calculatorDefaults.sharePercent),
  minutesPerTask: String(calculatorDefaults.minutesPerTask),
  weeksPerYear: String(calculatorDefaults.weeksPerYear),
  hourlyCost: String(calculatorDefaults.hourlyCost),
});

export function Calculator() {
  const [raw, setRaw] = useState<Raw>(toRaw);
  const [last, setLast] = useState(() => ({ ...calculatorDefaults }));

  const errors = useMemo(() => {
    const e: Partial<Record<FieldKey, string>> = {};
    for (const f of FIELDS) {
      const msg = validateField(f.key, raw[f.key]);
      if (msg) e[f.key] = msg;
    }
    return e;
  }, [raw]);

  const onChange = (key: FieldKey, value: string) => {
    const next = { ...raw, [key]: value };
    setRaw(next);
    if (!validateField(key, value)) setLast((l) => ({ ...l, [key]: Number(value) }));
  };

  // Results use the last valid value of each field, so a half-typed entry never blanks them.
  const r = calculateSavings(last);
  const tasksAvoided = formatHours(r.tasksAvoidedPerWeek);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="calc">
      <form className="calc-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Savings inputs" noValidate>
        {FIELDS.map((f) => {
          const lim = calculatorLimits[f.key];
          const id = `calc-${f.key}`;
          const err = errors[f.key];
          const describedBy = [f.hint ? `${id}-hint` : '', err ? `${id}-err` : '', `${id}-range`].filter(Boolean).join(' ');
          return (
            <div key={f.key} className="calc-field">
              <div className="calc-head">
                <label htmlFor={`${id}-slider`}>{f.label}</label>
                <div className="unit-input compact" data-invalid={!!err}>
                  {f.prefix && (
                    <span className="unit prefix" aria-hidden="true">
                      {f.unit}
                    </span>
                  )}
                  <input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={lim.min}
                    max={lim.max}
                    step="any"
                    value={raw[f.key]}
                    aria-label={`${f.label}, exact value`}
                    aria-invalid={!!err}
                    aria-describedby={describedBy}
                    onChange={(e) => onChange(f.key, e.target.value)}
                  />
                  {!f.prefix && (
                    <span className="unit" aria-hidden="true">
                      {f.unit}
                    </span>
                  )}
                </div>
              </div>
              {f.hint && (
                <span className="hint" id={`${id}-hint`}>
                  {f.hint}
                </span>
              )}
              <input
                id={`${id}-slider`}
                className="slider"
                type="range"
                min={lim.min}
                max={lim.max}
                step={lim.step}
                value={last[f.key]}
                aria-valuetext={`${f.prefix ? f.unit : ''}${last[f.key]} ${f.prefix ? 'per hour' : f.unit}`}
                aria-describedby={f.hint ? `${id}-hint` : undefined}
                style={{ ['--fill' as string]: `${((last[f.key] - lim.min) / (lim.max - lim.min)) * 100}%` }}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
              <span className="slider-scale" aria-hidden="true">
                <span>{f.prefix ? f.unit : ''}{lim.min}</span>
                <span>{f.prefix ? f.unit : ''}{lim.max}</span>
              </span>
              <span className="sr-only" id={`${id}-range`}>
                {`Unit: ${lim.unit}. Allowed range ${lim.min} to ${lim.max}.`}
              </span>
              {err && (
                <span className="field-error" id={`${id}-err`}>
                  {err}
                </span>
              )}
            </div>
          );
        })}
      </form>

      <div className="calc-results block-navy">
        <div className="result-cards" aria-live="polite">
          <div className="result-card">
            <span className="result-value" data-testid="hours-year">
              {formatHours(r.hoursPerYear)}
            </span>
            <span className="result-label">hours freed per school year</span>
            <span className="result-sub" data-testid="hours-week">
              {formatHours(r.hoursPerWeek)} hours per school week
            </span>
          </div>
          <div className="result-card">
            <span className="result-value" data-testid="value-year">
              {formatUSD(r.value)}
            </span>
            <span className="result-label">in estimated staff time value</span>
            <span className="result-sub">{formatUSD(r.value / Math.max(last.weeksPerYear, 1))} per school week</span>
          </div>
        </div>
        <div className="calc-note">
          <p data-testid="assumption">
            This hypothetical example assumes {tasksAvoided} {tasksAvoided === '1' ? 'task is' : 'tasks are'} fully
            handled without staff intervention each week over {last.weeksPerYear} school{' '}
            {last.weeksPerYear === 1 ? 'week' : 'weeks'}
            {last.sharePercent < 100 && last.tasksPerWeek > 0 ? ` (${last.sharePercent}% of ${last.tasksPerWeek} routine tasks)` : ''}. Each
            avoided task saves {last.minutesPerTask} staff {last.minutesPerTask === 1 ? 'minute' : 'minutes'}, valued at{' '}
            {formatUSD(last.hourlyCost)} per hour.
          </p>
          <p>
            The dollar amount estimates the value of staff time freed. It does not necessarily translate into payroll
            savings. The estimate excludes supervision, implementation, and AI costs.
          </p>
          {hasErrors && <p>Results use the last valid value for any field marked in red.</p>}
        </div>
        <div className="calc-actions">
          <a className="btn btn-accent" href="#demo">
            See how this would work at your school
          </a>
          <button
            type="button"
            className="btn btn-on-ink"
            onClick={() => {
              setRaw(toRaw());
              setLast({ ...calculatorDefaults });
            }}
          >
            Reset example
          </button>
        </div>
      </div>
    </div>
  );
}
