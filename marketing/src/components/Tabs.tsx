'use client';
import { useRef } from 'react';

/** Accessible tablist with arrow-key navigation (manual activation on click/Enter, automatic on arrows). */
export function TabList({
  label,
  idBase,
  items,
  value,
  onChange,
  className = 'tabs',
  tabClassName = 'tab',
  vertical = false,
  render,
}: {
  label: string;
  idBase: string;
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  tabClassName?: string;
  vertical?: boolean;
  render?: (item: { id: string; label: string }) => React.ReactNode;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next = ['ArrowRight', 'ArrowDown'];
    const prev = ['ArrowLeft', 'ArrowUp'];
    let j = -1;
    if (next.includes(e.key)) j = (i + 1) % items.length;
    else if (prev.includes(e.key)) j = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = items.length - 1;
    if (j < 0) return;
    e.preventDefault();
    onChange(items[j]!.id);
    refs.current[j]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={className} aria-orientation={vertical ? 'vertical' : 'horizontal'}>
      {items.map((it, i) => (
        <button
          key={it.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${idBase}-tab-${it.id}`}
          aria-selected={value === it.id}
          aria-controls={`${idBase}-panel`}
          tabIndex={value === it.id ? 0 : -1}
          className={tabClassName}
          onClick={() => onChange(it.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {render ? render(it) : it.label}
        </button>
      ))}
    </div>
  );
}
