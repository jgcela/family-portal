'use client';
import { useEffect, useRef } from 'react';

/**
 * Shows a newsletter in a frame that cannot run scripts. The frame shares the
 * portal's origin only so this page can read its height and avoid a second
 * scroll bar; with scripts blocked (sandbox and the response's CSP) the email
 * cannot use that access.
 */
export function IssueFrame({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const fit = () => {
      const doc = f.contentDocument;
      if (doc?.documentElement) f.style.height = `${Math.max(400, doc.documentElement.scrollHeight)}px`;
    };
    f.addEventListener('load', fit);
    const timer = window.setInterval(fit, 1000);
    window.addEventListener('resize', fit);
    fit();
    return () => {
      f.removeEventListener('load', fit);
      window.clearInterval(timer);
      window.removeEventListener('resize', fit);
    };
  }, [src]);
  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      className="issue-frame"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      referrerPolicy="no-referrer"
      loading="lazy"
    />
  );
}
