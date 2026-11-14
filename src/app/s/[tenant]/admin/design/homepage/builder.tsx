'use client';
import { useActionState, useState } from 'react';
import { BLOCK_INFO, HOMEPAGE_BLOCK_TYPES, validateHomepage, type HomepageBlock } from '@/server/tenancy/homepage-defaults';
import type { DesignResult } from '../actions';

type Props = {
  initial: HomepageBlock[];
  activeModules: string[];
  moduleNames: Record<string, string>;
  canPublish: boolean;
  hasDraft: boolean;
  save: (prev: DesignResult, fd: FormData) => Promise<DesignResult>;
};

type NumField = { key: string; label: string; min: number; max: number; def: number };
const NUMBER_SETTINGS: Partial<Record<HomepageBlock['type'], NumField[]>> = {
  'this-week': [{ key: 'days', label: 'Days to show', min: 1, max: 21, def: 7 }],
  'upcoming-events': [
    { key: 'withinDays', label: 'Look ahead (days)', min: 7, max: 180, def: 60 },
    { key: 'limit', label: 'Most events shown', min: 1, max: 20, def: 5 },
  ],
  'school-updates': [{ key: 'limit', label: 'Most updates shown', min: 1, max: 20, def: 4 }],
  volunteer: [{ key: 'limit', label: 'Most opportunities shown', min: 1, max: 12, def: 3 }],
};

const ADDABLE = HOMEPAGE_BLOCK_TYPES.filter((t) => BLOCK_INFO[t].rendered);

function newId(type: string, taken: Set<string>) {
  if (type !== 'custom-content' && !taken.has(type)) return type;
  for (let n = 2; ; n++) if (!taken.has(`${type}-${n}`)) return `${type}-${n}`;
}

export function HomepageBuilder({ initial, activeModules, moduleNames, canPublish, hasDraft, save }: Props) {
  const [blocks, setBlocks] = useState<HomepageBlock[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState<HomepageBlock['type']>('custom-content');
  const [state, submit, pending] = useActionState(save, undefined);
  const sig = JSON.stringify(initial);
  const [seen, setSeen] = useState(sig);
  if (sig !== seen) {
    setSeen(sig);
    setBlocks(initial);
    setDirty(false);
  }

  const active = new Set(activeModules);
  const check = validateHomepage(blocks);
  const errors = check.ok ? [] : check.errors;
  const change = (fn: (b: HomepageBlock[]) => HomepageBlock[]) => {
    setBlocks(fn);
    setDirty(true);
  };
  const patch = (i: number, p: Partial<HomepageBlock>) => change((bs) => bs.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const setting = (i: number, k: string, v: unknown) =>
    change((bs) => bs.map((b, j) => (j === i ? { ...b, settings: { ...b.settings, [k]: v } } : b)));
  const move = (i: number, d: -1 | 1) =>
    change((bs) => {
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const hasWelcome = blocks.some((b) => b.type === 'welcome');

  return (
    <form
      action={(fd) => {
        setDirty(false);
        submit(fd);
      }}
      className="form"
      style={{ maxWidth: 860 }}
    >
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
      {state?.error && (
        <p className="notice notice-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && !dirty && (
        <p className="notice notice-ok" role="status">
          {state.ok}
        </p>
      )}
      <ol className="block-list">
        {blocks.map((b, i) => {
          const info = BLOCK_INFO[b.type];
          const moduleOff = info.module && !active.has(info.module);
          const hidden = !info.rendered || moduleOff;
          return (
            <li key={b.id} className={`block-item${b.enabled && !hidden ? '' : ' block-item-off'}`}>
              <div className="block-item-head">
                <div>
                  <strong>{info.label}</strong>
                  <span className="muted block-desc"> {info.description}</span>
                  {!info.rendered && <p className="field-warning">Families will not see this block yet: it arrives with a later module.</p>}
                  {info.rendered && moduleOff && (
                    <p className="field-warning">
                      Hidden because the {moduleNames[info.module!] ?? info.module} module is off. Turn it on in Module Manager.
                    </p>
                  )}
                </div>
                <div className="block-tools">
                  <label className="check">
                    <input type="checkbox" checked={b.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} />
                    Show
                  </label>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${info.label} up`}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => move(i, 1)}
                    disabled={i === blocks.length - 1}
                    aria-label={`Move ${info.label} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => change((bs) => bs.filter((_, j) => j !== i))}
                    aria-label={`Remove ${info.label}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
              {info.rendered && (
                <div className="block-item-body form-row form-row-2">
                  <div className="field">
                    <label htmlFor={`title-${b.id}`}>{b.type === 'welcome' ? 'Headline' : 'Heading'}</label>
                    <input
                      id={`title-${b.id}`}
                      value={b.title ?? ''}
                      maxLength={80}
                      placeholder={b.type === 'welcome' ? 'Uses the school tagline when empty' : b.type === 'custom-content' ? 'Optional' : info.label}
                      onChange={(e) => patch(i, { title: e.target.value || undefined })}
                    />
                  </div>
                  {(NUMBER_SETTINGS[b.type] ?? []).map((f) => (
                    <div className="field" key={f.key}>
                      <label htmlFor={`${f.key}-${b.id}`}>{f.label}</label>
                      <input
                        id={`${f.key}-${b.id}`}
                        type="number"
                        min={f.min}
                        max={f.max}
                        value={typeof b.settings[f.key] === 'number' ? (b.settings[f.key] as number) : f.def}
                        onChange={(e) => setting(i, f.key, e.target.value === '' ? undefined : Math.round(Number(e.target.value)))}
                      />
                      <span className="hint">
                        Between {f.min} and {f.max}.
                      </span>
                    </div>
                  ))}
                  {b.type === 'custom-content' && (
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor={`body-${b.id}`}>Message</label>
                      <textarea
                        id={`body-${b.id}`}
                        className="md-input"
                        maxLength={5000}
                        value={typeof b.settings.body === 'string' ? b.settings.body : ''}
                        onChange={(e) => setting(i, 'body', e.target.value)}
                      />
                      <span className="hint">Markdown: **bold**, *italic*, [link](https://…), lists. An empty message is not shown.</span>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {blocks.length === 0 && <p className="notice">The homepage has no blocks. Families will only see the front office card.</p>}

      <div className="add-block">
        <div className="field">
          <label htmlFor="add-type">Add a block</label>
          <select id="add-type" value={adding} onChange={(e) => setAdding(e.target.value as HomepageBlock['type'])}>
            {ADDABLE.filter((t) => t !== 'welcome' || !hasWelcome).map((t) => (
              <option key={t} value={t}>
                {BLOCK_INFO[t].label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={blocks.length >= 20 || (adding === 'welcome' && hasWelcome)}
          onClick={() =>
            change((bs) => {
              const block: HomepageBlock = {
                id: newId(adding, new Set(bs.map((b) => b.id))),
                type: adding,
                enabled: true,
                audienceKeys: [],
                settings: adding === 'custom-content' ? { body: '' } : {},
                ...(adding === 'welcome' || adding === 'custom-content' ? {} : { title: BLOCK_INFO[adding].label }),
              };
              return adding === 'welcome' ? [block, ...bs] : [...bs, block];
            })
          }
        >
          Add
        </button>
      </div>

      {errors.length > 0 && (
        <div className="notice notice-error" role="alert">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      <div className="form-actions sticky-actions">
        <button className="btn btn-quiet" type="submit" name="then" value="draft" disabled={pending || errors.length > 0}>
          Save draft
        </button>
        {canPublish && (
          <button className="btn btn-primary" type="submit" name="then" value="publish" disabled={pending || errors.length > 0}>
            Save and publish
          </button>
        )}
        {dirty && <span className="muted">Unsaved changes</span>}
        {!dirty && hasDraft && !state?.ok && <span className="muted">Showing your saved draft.</span>}
      </div>
    </form>
  );
}
