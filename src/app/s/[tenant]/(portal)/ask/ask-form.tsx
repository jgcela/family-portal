'use client';
import { useActionState, useState } from 'react';
import { askAction, feedbackAction } from './actions';
import { AnswerView } from '@/app/_ai/answer-view';

export function AskForm({ tenantKey, base, examples, canEscalate = false }: { tenantKey: string; base: string; examples: string[]; canEscalate?: boolean }) {
  const [state, action, pending] = useActionState(askAction.bind(null, tenantKey), undefined);
  const [q, setQ] = useState('');
  const [voted, setVoted] = useState<string | null>(null);
  const qid = state?.result && 'questionId' in state.result ? state.result.questionId : null;
  return (
    <>
      <form action={action} className="ai-form">
        <div className="field">
          <label htmlFor="question">Your question</label>
          <textarea id="question" name="question" rows={3} maxLength={500} required value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What time does drop-off start?" />
          <span className="hint">Answers come from the school&apos;s approved information. Don&apos;t include private details such as medical information.</span>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? 'Looking it up…' : 'Ask'}
          </button>
          {examples.map((x) => (
            <button key={x} type="button" className="chip" onClick={() => setQ(x)}>
              {x}
            </button>
          ))}
        </div>
      </form>
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      {state?.result && (
        <section className="ai-result" aria-label="Answer">
          {state.question && <p className="muted">You asked: {state.question}</p>}
          <AnswerView result={state.result} base={base} />
          {canEscalate && state.question && state.result.outcome !== 'answered' && (
            <p>
              <a
                className="btn btn-quiet"
                href={`${base}/requests?new=1&kind=question&subject=${encodeURIComponent(state.question.slice(0, 120))}&body=${encodeURIComponent(state.question)}`}
              >
                Send this question to the office
              </a>
            </p>
          )}
          {qid && state.result.outcome === 'answered' && (
            <div className="btn-row">
              {voted === qid ? (
                <span className="muted">Thanks for the feedback.</span>
              ) : (
                <>
                  <span className="muted">Was this helpful?</span>
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={async () => {
                        await feedbackAction(tenantKey, qid, v);
                        setVoted(qid);
                      }}
                    >
                      {v ? 'Yes' : 'No'}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
