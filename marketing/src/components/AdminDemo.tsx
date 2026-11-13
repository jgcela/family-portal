'use client';
// "Your school can run it": a local admin walkthrough with fictional data.
import { useState } from 'react';
import { brand, features, type FeatureId } from '@/config/site';
import { FeatureBadge, SampleBadge, StatusBadge } from './Badge';
import { ArrowDown, ArrowUp, Calendar, Check, Doc, Grid, Layout, Palette, People } from './Icons';
import { TabList } from './Tabs';

const TASKS = [
  { id: 'brand', label: 'Logo and colors', icon: Palette },
  { id: 'home', label: 'Homepage', icon: Layout },
  { id: 'calendar', label: 'Calendar import', icon: Calendar },
  { id: 'docs', label: 'Handbook', icon: Doc },
  { id: 'people', label: 'Editors', icon: People },
  { id: 'modules', label: 'Modules', icon: Grid },
] as const;

type TaskId = (typeof TASKS)[number]['id'];

const COLORS = [
  { name: 'Forest', value: '#1f4b3f' },
  { name: 'Navy', value: '#1d3461' },
  { name: 'Maroon', value: '#6b1f2a' },
  { name: 'Teal', value: '#0f5c63' },
  { name: 'Slate', value: '#334155' },
];
const ACCENTS = [
  { name: 'Gold', value: '#d9a520' },
  { name: 'Sky', value: '#7cb7e8' },
  { name: 'Coral', value: '#e8836b' },
];
const LOGOS = ['M', 'MR', '✠'];

export function AdminDemo() {
  const [task, setTask] = useState<TaskId>('brand');
  return (
    <div className="frame admin-frame">
      <div className="frame-bar">
        <span className="frame-title">Maple Ridge School · Admin</span>
        <SampleBadge>Sample school</SampleBadge>
        <span className="spacer" />
        <span className="small muted">{brand.name}</span>
      </div>
      <div className="admin ui">
        <TabList
          label="Admin tasks"
          idBase="adm"
          className="admin-nav"
          tabClassName=""
          vertical
          items={TASKS.map((t) => ({ id: t.id, label: t.label }))}
          value={task}
          onChange={(id) => setTask(id as TaskId)}
          render={(it) => {
            const Icon = TASKS.find((t) => t.id === it.id)!.icon;
            return (
              <>
                <Icon /> {it.label}
              </>
            );
          }}
        />
        <div className="admin-main" id="adm-panel" role="tabpanel" aria-labelledby={`adm-tab-${task}`}>
          {task === 'brand' && <BrandTask />}
          {task === 'home' && <HomepageTask />}
          {task === 'calendar' && <CalendarTask />}
          {task === 'docs' && <DocsTask />}
          {task === 'people' && <PeopleTask />}
          {task === 'modules' && <ModulesTask />}
        </div>
      </div>
    </div>
  );
}

function TaskHead({ title, feature, children }: { title: string; feature: FeatureId; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <h3>{title}</h3>
        <FeatureBadge id={feature} />
      </div>
      <p className="muted">{children}</p>
    </div>
  );
}

function BrandTask() {
  const [color, setColor] = useState(COLORS[0]!.value);
  const [accent, setAccent] = useState(ACCENTS[0]!.value);
  const [logo, setLogo] = useState(0);
  const [published, setPublished] = useState(false);
  const change = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPublished(false);
  };
  return (
    <>
      <TaskHead title="Logo and colors" feature="familyPortal">
        Pick a logo and school colors. Text contrast is checked before you can publish.
      </TaskHead>
      <div className="admin-split">
        <div className="panel">
          <div className="field">
            <span className="label" id="logo-label">
              Logo
            </span>
            <div className="logo-options" role="group" aria-labelledby="logo-label">
              {LOGOS.map((l, i) => (
                <button
                  key={l}
                  type="button"
                  className="logo-option"
                  aria-pressed={logo === i}
                  aria-label={`Logo option ${i + 1}`}
                  onClick={() => change(setLogo)(i)}
                >
                  <span className="school-crest" style={{ ['--crest' as string]: color }}>
                    {l}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label" id="color-label">
              Primary color
            </span>
            <div className="swatches" role="group" aria-labelledby="color-label">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="swatch"
                  style={{ background: c.value }}
                  aria-pressed={color === c.value}
                  aria-label={c.name}
                  onClick={() => change(setColor)(c.value)}
                />
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label" id="accent-label">
              Accent color
            </span>
            <div className="swatches" role="group" aria-labelledby="accent-label">
              {ACCENTS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="swatch"
                  style={{ background: c.value }}
                  aria-pressed={accent === c.value}
                  aria-label={c.name}
                  onClick={() => change(setAccent)(c.value)}
                />
              ))}
            </div>
          </div>
          {published ? (
            <div className="toast" role="status">
              <Check size={16} /> Published. Families see the new look now.
            </div>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPublished(true)}>
              Publish changes
            </button>
          )}
        </div>
        <div className="portal-preview" aria-label="Family portal preview">
          <div className="portal-preview-head" style={{ background: color }}>
            <span className="school-crest" style={{ ['--crest' as string]: 'rgb(255 255 255 / .18)' }}>
              {LOGOS[logo]}
            </span>
            <strong>Maple Ridge School</strong>
          </div>
          <div className="pp-accent" style={{ background: accent }} />
          <div className="portal-preview-body">
            <div className="pp-block">
              <span>Announcements</span>
              <span className="muted">3 new</span>
            </div>
            <div className="pp-block">
              <span>This week</span>
              <span className="muted">Mass Fri 8:15</span>
            </div>
            <div className="pp-block">
              <span>Forms due</span>
              <span style={{ color, fontWeight: 700 }}>2</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function HomepageTask() {
  const [order, setOrder] = useState(['Announcements', 'This week’s calendar', 'Forms due', 'Lunch menu', 'Quick links']);
  const [msg, setMsg] = useState('');
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
    setMsg(`${order[i]} moved to position ${j + 1} of ${order.length}.`);
  };
  return (
    <>
      <TaskHead title="Homepage sections" feature="familyPortal">
        Put what families need this week at the top. The preview updates as you move sections.
      </TaskHead>
      <div className="admin-split">
        <ol className="order-list" aria-label="Homepage section order">
          {order.map((s, i) => (
            <li key={s} className="order-item">
              <span className="name">{s}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Move ${s} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Move ${s} down`}
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={16} />
              </button>
            </li>
          ))}
        </ol>
        <div className="portal-preview" aria-hidden="true">
          <div className="portal-preview-head" style={{ background: '#1f4b3f' }}>
            <span className="school-crest" style={{ ['--crest' as string]: 'rgb(255 255 255 / .18)' }}>
              M
            </span>
            <strong>Maple Ridge School</strong>
          </div>
          <div className="portal-preview-body">
            {order.map((s, i) => (
              <div key={s} className="pp-block" style={i === 0 ? { borderColor: '#1f4b3f', fontWeight: 700 } : undefined}>
                <span>{s}</span>
                <span className="muted">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {msg}
      </p>
    </>
  );
}

const IMPORTED = [
  { d: 'Tue, Dec 1', t: 'Girls basketball vs. St. Clare', where: 'Home gym · 4:00 PM' },
  { d: 'Thu, Dec 3', t: 'Boys basketball at Holy Cross', where: 'Away · 4:30 PM' },
  { d: 'Sat, Dec 5', t: 'CYO tournament', where: 'All day' },
];

function CalendarTask() {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  return (
    <>
      <TaskHead title="Calendar import" feature="calendarImports">
        Bring in the athletics calendar from an ICS link or a CSV file. Duplicates are matched, not doubled.
      </TaskHead>
      <div className="panel">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <strong>athletics-2026-27.ics</strong>
            <span className="small muted">Source: athletics office calendar feed</span>
          </div>
          {state !== 'done' && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={state === 'working'}
              onClick={() => {
                setState('working');
                window.setTimeout(() => setState('done'), 700);
              }}
            >
              {state === 'working' ? 'Importing…' : 'Import calendar'}
            </button>
          )}
        </div>
        {state === 'done' && (
          <>
            <div className="toast" role="status">
              <Check size={16} /> 48 events imported, 3 updated, 0 duplicates
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Event</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {IMPORTED.map((e) => (
                  <tr key={e.t}>
                    <td>{e.d}</td>
                    <td>{e.t}</td>
                    <td className="muted">{e.where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}

function DocsTask() {
  const [version, setVersion] = useState(1);
  const url = 'mapleridge.famitenly.example/d/family-handbook';
  return (
    <>
      <TaskHead title="Replace the handbook" feature="documents">
        Upload the new year’s handbook. The link families saved keeps working and opens the new file.
      </TaskHead>
      <div className="panel">
        <div style={{ display: 'grid', gap: 4 }}>
          <strong>{version === 1 ? 'Family Handbook 2025–26.pdf' : 'Family Handbook 2026–27.pdf'}</strong>
          <span className="small muted">Version {version} · Published</span>
        </div>
        <div className="field">
          <span className="label">Family link</span>
          <span className="url-chip">{url}</span>
        </div>
        {version === 1 ? (
          <button type="button" className="btn btn-primary btn-sm" style={{ justifySelf: 'start' }} onClick={() => setVersion(2)}>
            Replace with 2026–27 file
          </button>
        ) : (
          <div className="toast" role="status">
            <Check size={16} /> Replaced. Same link, new file. Version 1 kept in history.
          </div>
        )}
      </div>
    </>
  );
}

function PeopleTask() {
  const [scope, setScope] = useState<'grade' | 'all'>('grade');
  const [granted, setGranted] = useState(false);
  return (
    <>
      <TaskHead title="Grant an editor permission" feature="rolesPermissions">
        Teachers can publish for their own grade without seeing or changing anything else.
      </TaskHead>
      <div className="admin-split">
        <div className="panel">
          <div style={{ display: 'grid', gap: 2 }}>
            <strong>Carla Rivera</strong>
            <span className="small muted">Grade 3 teacher · Editor</span>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 2 }}>
            <legend className="label" style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Can publish announcements and events for
            </legend>
            <label className="radio-row">
              <input
                type="radio"
                name="scope"
                checked={scope === 'grade'}
                onChange={() => {
                  setScope('grade');
                  setGranted(false);
                }}
              />
              Grade 3 only
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="scope"
                checked={scope === 'all'}
                onChange={() => {
                  setScope('all');
                  setGranted(false);
                }}
              />
              All grades
            </label>
          </fieldset>
          {granted ? (
            <div className="toast" role="status">
              <Check size={16} /> Permission granted
            </div>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setGranted(true)}>
              Grant permission
            </button>
          )}
        </div>
        <div className="panel">
          <strong>What Carla can do</strong>
          <ul className="check-list">
            <li>
              <span>Publish to Grade 3 families</span>
              <strong>Yes</strong>
            </li>
            <li>
              <span>Publish to other grades</span>
              <strong>{scope === 'all' ? 'Yes' : 'No'}</strong>
            </li>
            <li>
              <span>Change branding or homepage</span>
              <strong>No</strong>
            </li>
            <li>
              <span>See attendance notices</span>
              <strong>No</strong>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}

const MODULE_IDS: FeatureId[] = [
  'calendarImports',
  'documents',
  'absenceNotices',
  'knowledgeAI',
  'forms',
  'familyAssistant',
];

function ModulesTask() {
  const [on, setOn] = useState<Record<string, boolean>>({ calendarImports: true, documents: true });
  return (
    <>
      <div style={{ display: 'grid', gap: 6 }}>
        <h3>Modules</h3>
        <p className="muted">
          Each school turns on what it needs. A module can be switched on only when it is available.
        </p>
      </div>
      <div className="panel" style={{ gap: 0 }}>
        {MODULE_IDS.map((id) => {
          const f = features[id];
          const available = f.status !== 'planned';
          const checked = !!on[id] && available;
          return (
            <div key={id} className="toggle-row">
              <span className="name">
                <strong id={`mod-${id}`}>{f.label}</strong>
                <span>
                  <StatusBadge status={f.status} />
                </span>
              </span>
              <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={checked}
                aria-labelledby={`mod-${id}`}
                disabled={!available}
                onClick={() => setOn((s) => ({ ...s, [id]: !s[id] }))}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
