// Shows an assistant result: the answer with its sources, an honest "not
// found", or matching sources when AI answers are off. Used by the family
// portal and the admin sandbox.
import type { AskResult } from '@/server/services/assistant';

export type AskState = { result?: AskResult; error?: string; question?: string } | undefined;

export function AnswerView({ result, base }: { result: AskResult; base: string }) {
  const href = (url: string | null) => (url ? (url.startsWith('/') ? `${base}${url}` : url) : null);
  if (result.outcome === 'answered') {
    return (
      <div className="ai-answer" aria-live="polite">
        <p className="ai-answer-text">{result.answer}</p>
        <h3 className="ai-sources-title">Sources</h3>
        <ol className="ai-sources">
          {result.citations.map((c, i) => {
            const h = href(c.url);
            return (
              <li key={i}>
                <div>
                  {h ? <a href={h}>{c.title}</a> : <strong>{c.title}</strong>}
                  {c.section && <span className="muted"> · {c.section}</span>}
                  {c.effectiveDate && <span className="muted"> · effective {c.effectiveDate}</span>}
                </div>
                <blockquote>&ldquo;{c.quote}&rdquo;</blockquote>
              </li>
            );
          })}
        </ol>
        <p className="hint">Answers come only from information the school approved. Check the source if something matters.</p>
      </div>
    );
  }
  if (result.outcome === 'search_only') {
    return (
      <div className="ai-answer" aria-live="polite">
        <p>{result.message}</p>
        <ol className="ai-sources">
          {result.hits.map((h, i) => {
            const link = href(h.url);
            return (
              <li key={i}>
                <div>
                  {link ? <a href={link}>{h.title}</a> : <strong>{h.title}</strong>}
                  {h.section && <span className="muted"> · {h.section}</span>}
                </div>
                <p className="muted">{h.excerpt}…</p>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }
  return (
    <div className="ai-answer" aria-live="polite">
      <p>{result.message}</p>
      {result.escalation ? (
        <p>
          You can ask {result.escalation.name}: <a href={`mailto:${result.escalation.email}`}>{result.escalation.email}</a>
        </p>
      ) : (
        <p className="muted">Please contact the school office.</p>
      )}
    </div>
  );
}
