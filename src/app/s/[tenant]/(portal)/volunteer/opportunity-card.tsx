import type { VolunteerRow } from '@/server/services/volunteer';
import { renderMarkdown } from '@/server/content/markdown';

const kindOf = (url: string) => (url.startsWith('mailto:') ? 'email' : url.startsWith('tel:') ? 'phone' : 'web');

/** One opportunity. `compact` (homepage) shows the summary and the first button only. */
export function OpportunityCard({ o, compact = false, href }: { o: VolunteerRow; compact?: boolean; href?: string }) {
  const facts = [
    ['When', o.schedule],
    ['Where', o.location],
    ['Who', o.commitment],
  ].filter((f): f is [string, string] => !!f[1]);
  const actions = compact ? o.actions.slice(0, 1) : o.actions;
  return (
    <article className="vol-card" id={`v-${o.id}`} aria-labelledby={`vt-${o.id}`}>
      <div className="vol-head">
        {o.category && <span className="vol-kind">{o.category}</span>}
        <h3 id={`vt-${o.id}`}>{href ? <a href={href}>{o.title}</a> : o.title}</h3>
        {o.organizer && <p className="muted">{o.organizer}</p>}
      </div>
      {facts.length > 0 && (
        <dl className="vol-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {o.summary && <p>{o.summary}</p>}
      {!compact && o.body.trim() && (
        // renderMarkdown disables raw HTML and filters link schemes.
        <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(o.body).html }} />
      )}
      {actions.length > 0 && (
        <div className="btn-row">
          {actions.map((a, i) => {
            const k = kindOf(a.url);
            return (
              <a
                key={i}
                className={i === 0 ? 'btn btn-primary btn-sm' : 'btn btn-quiet btn-sm'}
                href={a.url}
                {...(k === 'web' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {a.label}
                {k === 'web' && <span className="visually-hidden"> (opens in a new tab)</span>}
              </a>
            );
          })}
        </div>
      )}
    </article>
  );
}
