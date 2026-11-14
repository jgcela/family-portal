'use client';
import { useId, useMemo, useState } from 'react';

export type DocItem = { slug: string; title: string; description: string | null; meta: string; category: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Documents grouped by category in cards, with a filter box that narrows them as you type. */
export function DocGroups({ items, base, initialQuery = '' }: { items: DocItem[]; base: string; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const id = useId();
  const groups = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const match = (d: DocItem) => {
      const hay = norm(`${d.title} ${d.description ?? ''} ${d.category}`);
      return words.every((w) => hay.includes(w));
    };
    const map = new Map<string, DocItem[]>();
    for (const d of items) if (match(d)) map.set(d.category, [...(map.get(d.category) ?? []), d]);
    // Named categories first (alphabetical), "Other" last.
    return [...map.entries()].sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
  }, [items, q]);
  const shown = groups.reduce((n, [, l]) => n + l.length, 0);

  return (
    <div className="doc-browser">
      <div className="field doc-filter">
        <label htmlFor={`${id}-q`}>Filter documents</label>
        <input id={`${id}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. uniform, medication" autoComplete="off" />
      </div>
      <p className="visually-hidden" aria-live="polite">
        {q ? `${shown} ${shown === 1 ? 'document' : 'documents'} found` : ''}
      </p>
      {groups.length === 0 ? (
        <p className="empty">{items.length ? `Nothing matches “${q}”.` : 'No documents yet.'}</p>
      ) : (
        <div className="doc-cards">
          {groups.map(([cat, list]) => (
            <section key={cat} className="doc-card" aria-labelledby={`${id}-${cat}`}>
              <div className="doc-card-head">
                <h3 id={`${id}-${cat}`}>{cat}</h3>
                <span className="doc-count">
                  {list.length} {list.length === 1 ? 'document' : 'documents'}
                </span>
              </div>
              <ul className="doc-rows">
                {list.map((d) => (
                  <li key={d.slug}>
                    {/* Plain link: /d/ is a redirect to a short-lived file URL, so it must not be prefetched. */}
                    <a href={`${base}/d/${d.slug}`} target="_blank" rel="noopener" className="doc-row-title">
                      {d.title}
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </a>
                    <span className="doc-row-meta">{d.meta}</span>
                    {d.description && <p className="doc-row-desc">{d.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
