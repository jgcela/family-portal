'use client';
import { useState } from 'react';
import { FeatureBadge, SampleBadge } from './Badge';
import { Check, Doc, Link as LinkIcon } from './Icons';
import { TabList } from './Tabs';
import type { FeatureId } from '@/config/site';

const ITEMS = [
  { id: 'answer', label: 'Find an answer' },
  { id: 'late', label: 'Report a late arrival' },
  { id: 'slips', label: 'Collect permission slips' },
];

const WAITING = [
  'Bennett family · Lucas',
  'Chen family · Ava',
  'Okafor family · Grace',
  'Romero family · Mateo',
  'Walsh family · Nora',
  'Kim family · Daniel',
];

export function Scenarios() {
  const [tab, setTab] = useState('answer');
  return (
    <div>
      <TabList label="Everyday school tasks" idBase="scn" items={ITEMS} value={tab} onChange={setTab} />
      <div id="scn-panel" role="tabpanel" aria-labelledby={`scn-tab-${tab}`} tabIndex={0}>
        {tab === 'answer' && <AnswerScenario />}
        {tab === 'late' && <LateScenario />}
        {tab === 'slips' && <SlipsScenario />}
      </div>
    </div>
  );
}

function Lane({
  label,
  feature,
  children,
}: {
  label: string;
  feature?: FeatureId;
  children: React.ReactNode;
}) {
  return (
    <article className="lane ui">
      <h3 className="lane-label">
        {label}
        {feature ? <FeatureBadge id={feature} /> : <SampleBadge />}
      </h3>
      {children}
    </article>
  );
}

function Verdict({ needed, title, children }: { needed: boolean; title: string; children: React.ReactNode }) {
  return (
    <article className={`lane verdict ${needed ? 'yes' : 'no'}`}>
      <h3 className="lane-label">Staff action required?</h3>
      <p className="lane-verdict">{title}</p>
      <div style={{ display: 'grid', gap: 8, fontSize: 15 }}>
        {children}
      </div>
    </article>
  );
}

function AnswerScenario() {
  return (
    <div className="scenario">
      <Lane label="What the family sees" feature="knowledgeAI">
        <div className="bubble bubble-me" style={{ maxWidth: '100%' }}>
          Can my son wear his PE uniform all day on gym days?
        </div>
        <div className="mini-card">
          <p>
            Yes. On scheduled PE days, students in grades 3–8 may wear the PE uniform for the full school day.
            Outerwear must be the navy school fleece.
          </p>
          <span className="source-link">
            <Doc size={16} /> Family Handbook 2026–27, §4.2 Uniform Policy
          </span>
        </div>
        <p className="small muted">
          If the approved handbook does not cover a question, the assistant says so and offers to send it to the office.
        </p>
      </Lane>
      <Lane label="What the office receives" feature="analytics">
        <div className="mini-card">
          <strong>Nothing in the inbox</strong>
          <p className="small muted">The question is counted in this week’s topics.</p>
        </div>
        <ul className="check-list" aria-label="Top questions this week">
          <li>
            <span>Uniform policy</span>
            <strong>12</strong>
          </li>
          <li>
            <span>Early dismissal times</span>
            <strong>8</strong>
          </li>
          <li>
            <span>Hot lunch ordering</span>
            <strong>5</strong>
          </li>
        </ul>
      </Lane>
      <Verdict needed={false} title="None">
        <p>The answer comes from the handbook your school approved, with a link to the exact section.</p>
      </Verdict>
    </div>
  );
}

function LateScenario() {
  return (
    <div className="scenario">
      <Lane label="What the family sees" feature="familyReceipts">
        <div className="notice-card receipt">
          <div className="receipt-title">
            <Check size={18} /> Notice received by the school
          </div>
          <dl className="kv">
            <dt>Student</dt>
            <dd>Maya Alvarez, Grade 3</dd>
            <dt>Arriving</dt>
            <dd>Tomorrow, 10:30 AM</dd>
            <dt>Status</dt>
            <dd>Ready for office review</dd>
          </dl>
        </div>
        <p className="small muted">The status updates on the family’s receipt when the office reviews it.</p>
      </Lane>
      <Lane label="What the office receives" feature="officeInbox">
        <div className="mini-card">
          <span className="tag">Late arrival · LA-2041</span>
          <dl className="kv">
            <dt>Student</dt>
            <dd>Maya Alvarez, Grade 3</dd>
            <dt>Arrival</dt>
            <dd>10:30 AM</dd>
            <dt>Reason</dt>
            <dd>Medical appointment</dd>
            <dt>From</dt>
            <dd>Verified guardian</dd>
          </dl>
        </div>
        <p className="small muted">One structured record in the queue instead of an email to read and retype.</p>
      </Lane>
      <Verdict needed title="One review">
        <p>
          The office confirms the notice and updates official attendance in its own system. With a verified,
          authorized SIS integration, that update can follow the office’s approval.
        </p>
      </Verdict>
    </div>
  );
}

function SlipsScenario() {
  const [scheduled, setScheduled] = useState(false);
  const signed = 18;
  const total = 24;
  return (
    <div className="scenario">
      <Lane label="What the family sees" feature="forms">
        <div className="mini-card">
          <span className="tag">Permission slip · due Fri</span>
          <strong>Grade 5 field trip: City Science Center</strong>
          <p className="small muted">Bus leaves 8:45 AM, returns 2:30 PM. Packed lunch needed.</p>
          <span className="radio-row">
            <Check size={16} /> I give permission for Lucas to attend
          </span>
          <span className="btn btn-primary btn-sm" aria-hidden="true">
            Sign permission slip
          </span>
        </div>
      </Lane>
      <Lane label="What the office receives" feature="reminders">
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>
              {signed} of {total} returned
            </strong>
            <span className="small muted">{total - signed} waiting</span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label="Permission slips returned"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={signed}
          >
            <span style={{ width: `${(signed / total) * 100}%` }} />
          </div>
        </div>
        <ul className="check-list" aria-label="Families still to respond">
          {WAITING.map((w) => (
            <li key={w}>
              <span>{w}</span>
              <span className="muted">Not yet</span>
            </li>
          ))}
        </ul>
        {scheduled ? (
          <div className="toast" role="status">
            <Check size={16} /> Reminder scheduled for Wed, 7:00 AM to 6 families
          </div>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setScheduled(true)}>
            Schedule reminder
          </button>
        )}
      </Lane>
      <Verdict needed={false} title="Publish once">
        <p>Staff publish the form and pick a reminder time. Only families who have not responded get the reminder.</p>
        <p style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <LinkIcon size={16} /> Signed slips are filed with the trip.
        </p>
      </Verdict>
    </div>
  );
}
