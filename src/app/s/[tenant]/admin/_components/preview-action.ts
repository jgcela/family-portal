'use server';
import { renderMarkdown } from '@/server/content/markdown';
import { getSession } from '@/server/request';

/** Renders Markdown for the editor preview. Signed-in users only; output is the same safe HTML families get. */
export async function previewMarkdown(src: string): Promise<string> {
  if (!(await getSession())) return '';
  return renderMarkdown(String(src).slice(0, 400_000)).html;
}
