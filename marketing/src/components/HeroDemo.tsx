'use client';
// "From parent message to office inbox": a local, scripted walkthrough.
// Nothing is sent anywhere; every name and record is fictional.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { brand, features } from '@/config/site';
import { FeatureBadge, SampleBadge } from './Badge';
import { Check, Replay, Send } from './Icons';
import { usePrefersReducedMotion } from './useReducedMotion';

const MESSAGE = "My daughter has a doctor's appointment tomorrow. She'll be in at 10:30.";

const STUDENTS = [
  { id: 'maya', name: 'Maya Alvarez', grade: 'Grade 3', pronoun: 'daughter' },
  { id: 'leo', name: 'Leo Alvarez', grade: 'Grade 1', pronoun: 'son' },
];

const REASONS = ['Medical appointment', 'Family matter', 'Transportation', 'Other'];

type Phase = 'typing' | 'ready' | 'thinking' | 'review' | 'sent';

type Draft = { student: string; date: string; time: string; reason: string };

const OTHER_ROWS = [
  { id: 'r1', tag: 'Absence', title: 'Owen Park · Grade 6', sub: 'Today · Illness', status: 'Reviewed', time: '7:42 AM' },
  { id: 'r2', tag: 'Question', title: 'Bus route change', sub: 'Grade 2 family', status: 'Needs reply', time: '7:15 AM' },
  { id: 'r3', tag: 'Early pickup', title: 'Sofia Reyes · Grade 4', sub: 'Today · 1:15 PM', status: 'Reviewed', time: 'Yesterday' },
];

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date(2000, 0, 1, h ?? 0, m ?? 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function HeroDemo() {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>('typing');
  const [typed, setTyped] = useState(0);
  const [draft, setDraft] = useState<Draft>({ student: 'maya', date: '', time: '10:30', reason: REASONS[0]! });
  const [view, setView] = useState<'family' | 'office'>('family');
  const [selected, setSelected] = useState<string>('r1');
  const [showSis, setShowSis] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [run, setRun] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  // Set the date on the client so it always reads "tomorrow" for the viewer.
  useEffect(() => {
    setDraft((d) => ({ ...d, date: d.date || tomorrowISO() }));
  }, []);

  // Typing animation for the parent's message (instant with reduced motion).
  useEffect(() => {
    if (phase !== 'typing') return;
    if (reduced) {
      setTyped(MESSAGE.length);
      setPhase('ready');
      return;
    }
    const id = window.setInterval(() => {
      setTyped((n) => {
        if (n >= MESSAGE.length) {
          window.clearInterval(id);
          setPhase('ready');
          return n;
        }
        return n + 1;
      });
    }, 28);
    return () => window.clearInterval(id);
  }, [phase, reduced, run]);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [phase, reduced]);

  const sendMessage = () => {
    if (phase !== 'ready') return;
    setPhase('thinking');
    later(() => setPhase('review'), reduced ? 0 : 900);
  };

  const sendNotice = () => {
    setPulse(true);
    setPhase('sent');
    setSelected('new');
    later(() => setPulse(false), 1000);
    // On small screens, move to the office view after the family sees the receipt.
    later(() => setView('office'), reduced ? 1200 : 2200);
  };

  const replay = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    setTyped(0);
    setDraft({ student: 'maya', date: tomorrowISO(), time: '10:30', reason: REASONS[0]! });
    setView('family');
    setSelected('r1');
    setShowSis(false);
    setPulse(false);
    setPhase('typing');
    setRun((r) => r + 1);
  };

  const student = STUDENTS.find((s) => s.id === draft.student) ?? STUDENTS[0]!;
  const step = phase === 'sent' ? 3 : phase === 'review' || phase === 'thinking' ? 2 : 1;
  const sentAfterMessage = phase === 'thinking' || phase === 'review' || phase === 'sent';
  const dateText = formatDate(draft.date);
  const timeText = formatTime(draft.time);
  const ref = 'LA-2041';

  const rows = useMemo(() => {
    const list = [...OTHER_ROWS];
    return phase === 'sent'
      ? [
          {
            id: 'new',
            tag: 'Late arrival',
            title: `${student.name} · ${student.grade}`,
            sub: `${dateText} · Arriving ${timeText}`,
            status: 'Ready for review',
            time: 'Just now',
          },
          ...list,
        ]
      : list;
  }, [phase, student, dateText, timeText]);

  const steps = [
    { n: 1, label: 'Parent message' },
    { n: 2, label: 'Review notice' },
    { n: 3, label: 'Office inbox' },
  ];

  const statusLine =
    step === 1
      ? 'Step 1 of 3: the parent writes in plain words.'
      : step === 2
        ? 'Step 2 of 3: the parent checks the notice before sending.'
        : 'Step 3 of 3: the office receives one structured notice.';

  return (
    <div className="demo frame" id="interactive-demo" tabIndex={-1} aria-labelledby="demo-title">
      <div className="frame-bar">
        <h2 id="demo-title" className="frame-title">
          From parent message to office inbox
        </h2>
        <SampleBadge />
        <span className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Late-arrival notices <FeatureBadge id="absenceNotices" />
        </span>
        <span className="spacer" />
        <ol className="demo-steps" aria-label="Demo progress">
          {steps.map((s) => (
            <li key={s.n} aria-current={s.n === step ? 'step' : undefined} data-done={s.n < step}>
              <span className="step-num">{s.n < step ? <Check size={12} /> : s.n}</span>
              {s.label}
            </li>
          ))}
        </ol>
      </div>

      <p className="sr-only" aria-live="polite">
        {statusLine}
      </p>

      <div className="demo-stage" data-view={view}>
        <div className="demo-view-switch" role="group" aria-label="Choose a view">
          <button type="button" aria-pressed={view === 'family'} onClick={() => setView('family')}>
            Family phone
          </button>
          <button type="button" aria-pressed={view === 'office'} onClick={() => setView('office')}>
            Office inbox {phase === 'sent' ? '(1 new)' : ''}
          </button>
        </div>

        {/* Family phone */}
        <div className="phone ui" aria-label="Family view">
          <div className="phone-screen">
            <div className="phone-head">
              <span className="school-crest" aria-hidden="true">
                M
              </span>
              <span className="who">
                <strong>Maple Ridge School</strong>
                <span>School assistant · {brand.name}</span>
              </span>
            </div>

            <div className="chat" ref={chatRef}>
              <div className="bubble bubble-bot">Hi Ana. How can I help today?</div>
              {sentAfterMessage && <div className="bubble bubble-me bubble-in">{MESSAGE}</div>}
              {phase === 'thinking' && (
                <div className="bubble bubble-bot" aria-label="Assistant is preparing a notice">
                  <span className="typing-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              )}
              {(phase === 'review' || phase === 'sent') && (
                <div className="bubble bubble-bot bubble-in">
                  I prepared a late-arrival notice. Check the details, then send it to the office.
                </div>
              )}
              {phase === 'review' && (
                <form
                  className="notice-card bubble-in"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendNotice();
                  }}
                  aria-label="Late-arrival notice draft"
                >
                  <h4>
                    Late-arrival notice <span className="tag">Draft</span>
                  </h4>
                  <div className="notice-grid">
                    <div className="field full">
                      <label htmlFor="n-student">Student</label>
                      <select
                        id="n-student"
                        className="select"
                        value={draft.student}
                        onChange={(e) => setDraft({ ...draft, student: e.target.value })}
                      >
                        {STUDENTS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.grade}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="n-date">Date</label>
                      <input
                        id="n-date"
                        className="input"
                        type="date"
                        required
                        value={draft.date}
                        onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="n-time">Expected arrival</label>
                      <input
                        id="n-time"
                        className="input"
                        type="time"
                        required
                        value={draft.time}
                        onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="n-reason">General reason</label>
                      <select
                        id="n-reason"
                        className="select"
                        value={draft.reason}
                        onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                      >
                        {REASONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.date || !draft.time}>
                    Send notice
                  </button>
                </form>
              )}
              {phase === 'sent' && (
                <div className="notice-card receipt bubble-in" role="status">
                  <div className="receipt-title">
                    <Check size={18} /> Notice received by the school
                  </div>
                  <dl className="kv">
                    <dt>Student</dt>
                    <dd>{student.name}</dd>
                    <dt>Arriving</dt>
                    <dd>
                      {dateText}, {timeText}
                    </dd>
                    <dt>Reason</dt>
                    <dd>{draft.reason}</dd>
                    <dt>Status</dt>
                    <dd>Ready for office review</dd>
                    <dt>Receipt</dt>
                    <dd>{ref}</dd>
                  </dl>
                </div>
              )}
            </div>

            <div className="composer">
              <div className="composer-text" aria-label="Parent's message">
                {phase === 'typing' || phase === 'ready' ? (
                  <>
                    {MESSAGE.slice(0, typed)}
                    {phase === 'typing' && <span className="caret" aria-hidden="true" />}
                  </>
                ) : (
                  <span className="placeholder">Message the school…</span>
                )}
              </div>
              <button
                type="button"
                className="send-btn"
                onClick={sendMessage}
                disabled={phase !== 'ready'}
                aria-label="Send message"
              >
                <Send />
              </button>
            </div>
          </div>
        </div>

        <div className="connector" data-active={pulse} aria-hidden="true" key={`c-${run}-${pulse}`} />

        {/* Office inbox */}
        <section className="inbox ui" aria-label="Office inbox">
          <div className="inbox-head">
            <h3>Front office inbox</h3>
            <span className="count">{phase === 'sent' ? 2 : 1} open</span>
            <span className="spacer" style={{ flex: 1 }} />
            <FeatureBadge id="officeInbox" />
          </div>
          <div className="inbox-body">
            <div className="inbox-list">
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`inbox-row${r.id === 'new' ? ' is-new' : ''}`}
                  aria-current={selected === r.id}
                  onClick={() => setSelected(r.id)}
                >
                  <span className="row-top">
                    <span className="tag">{r.tag}</span>
                    <span>{r.time}</span>
                  </span>
                  <span className="row-title">{r.title}</span>
                  <span className="row-sub">
                    {r.sub} · {r.status}
                  </span>
                </button>
              ))}
            </div>
            <div className="inbox-detail">
              {selected === 'new' && phase === 'sent' ? (
                <>
                  <span className="tag">Late arrival · {ref}</span>
                  <h4>
                    {student.name}, {student.grade}
                  </h4>
                  <dl className="kv">
                    <dt>Date</dt>
                    <dd>{dateText}</dd>
                    <dt>Expected arrival</dt>
                    <dd>{timeText}</dd>
                    <dt>Reason</dt>
                    <dd>{draft.reason}</dd>
                    <dt>Submitted by</dt>
                    <dd>Ana Alvarez, verified guardian</dd>
                  </dl>
                  <div className="status-pair">
                    <div className="status-box">
                      <span className="label">Family notice</span>
                      <strong>Received</strong>
                      <span className="muted">Receipt sent to family</span>
                    </div>
                    <div className="status-box">
                      <span className="label">Official attendance</span>
                      <strong>Ready for office review</strong>
                      <span className="muted">Not yet changed</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-expanded={showSis}
                    aria-controls="sis-example"
                    onClick={() => setShowSis((s) => !s)}
                  >
                    {showSis ? 'Hide SIS sync example' : 'Show SIS sync example'}
                  </button>
                  {showSis && (
                    <div className="sis-example" id="sis-example">
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong>Separate example: SIS sync</strong>
                        <FeatureBadge id="sisIntegrations" />
                      </span>
                      <div className="sis-flow">
                        <span>Office approves</span>→<span>Tardy recorded in SIS</span>→<span>Family sees update</span>
                      </div>
                      <p className="muted">
                        Available only with a verified, authorized integration. {features.sisIntegrations.label}{' '}
                        depend on provider capabilities and school authorization.
                      </p>
                    </div>
                  )}
                </>
              ) : selected === 'new' ? null : (
                <OtherDetail id={selected} />
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="demo-footer">
        <span aria-hidden="true">{statusLine}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={replay}>
          <Replay size={16} /> Replay demo
        </button>
      </div>
    </div>
  );
}

function OtherDetail({ id }: { id: string }) {
  const r = OTHER_ROWS.find((x) => x.id === id);
  if (!r) return <div className="empty-detail">Select an item to see its details.</div>;
  return (
    <>
      <span className="tag">{r.tag}</span>
      <h4>{r.title}</h4>
      <dl className="kv">
        <dt>Details</dt>
        <dd>{r.sub}</dd>
        <dt>Status</dt>
        <dd>{r.status}</dd>
        <dt>Received</dt>
        <dd>{r.time}</dd>
      </dl>
    </>
  );
}
