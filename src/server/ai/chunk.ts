// Splits sections into chunks sized for retrieval: whole paragraphs where
// possible, about 1,200 characters each, never across a section boundary.
import type { Section } from './extract';

export type Chunk = { heading: string | null; content: string };

export const CHUNK_TARGET = 1200;
const CHUNK_MAX = 1800;

function splitLong(p: string): string[] {
  if (p.length <= CHUNK_MAX) return [p];
  const sentences = p.match(/[^.!?\n]+[.!?]*\s*/g) ?? [p];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length > CHUNK_TARGET) {
      out.push(cur.trim());
      cur = '';
    }
    if (s.length > CHUNK_MAX) {
      for (let i = 0; i < s.length; i += CHUNK_TARGET) out.push(s.slice(i, i + CHUNK_TARGET).trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function chunkSections(sections: Section[]): Chunk[] {
  const out: Chunk[] = [];
  for (const sec of sections) {
    const paras = sec.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap(splitLong);
    let cur: string[] = [];
    let len = 0;
    for (const p of paras) {
      if (len && len + p.length > CHUNK_TARGET) {
        out.push({ heading: sec.heading, content: cur.join('\n\n') });
        // Keep a short last paragraph as overlap so an answer split across chunks stays findable.
        const last = cur[cur.length - 1]!;
        cur = last.length < 300 ? [last] : [];
        len = cur.reduce((n, x) => n + x.length, 0);
      }
      cur.push(p);
      len += p.length;
    }
    if (cur.length) out.push({ heading: sec.heading, content: cur.join('\n\n') });
  }
  return out;
}
