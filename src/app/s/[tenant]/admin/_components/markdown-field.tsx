'use client';
import { useState, useTransition } from 'react';
import { previewMarkdown } from './preview-action';

/** Textarea with a Write / Preview switch. Preview HTML comes from the server's safe renderer. */
export function MarkdownField({ name, label, defaultValue, rows = 12, maxLength }: { name: string; label: string; defaultValue: string; rows?: number; maxLength: number }) {
  const [value, setValue] = useState(defaultValue);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [html, setHtml] = useState('');
  const [pending, start] = useTransition();
  const show = (t: 'write' | 'preview') => {
    setTab(t);
    if (t === 'preview') start(async () => setHtml(await previewMarkdown(value)));
  };
  return (
    <div className="field">
      <div className="md-head">
        <label htmlFor={`md-${name}`}>{label}</label>
        <div className="md-tabs" role="tablist" aria-label={`${label} editor`}>
          <button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => show('write')}>
            Write
          </button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => show('preview')}>
            Preview
          </button>
        </div>
      </div>
      <textarea
        id={`md-${name}`}
        name={name}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        hidden={tab !== 'write'}
        className="md-input"
      />
      {tab === 'preview' && (
        <div className="md-preview prose" aria-live="polite">
          {pending ? <p className="muted">Loading preview…</p> : html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <p className="muted">Nothing to preview.</p>}
        </div>
      )}
      <span className="hint">
        Formatting: <code>## Heading</code>, <code>**bold**</code>, <code>- list item</code>, <code>[link text](https://…)</code>. HTML is not allowed.
      </span>
    </div>
  );
}
