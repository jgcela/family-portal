'use client';
import { useEffect, useState } from 'react';
import { brand, nav } from '@/config/site';
import { Close, Mark, Menu } from './Icons';

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="site-header" data-scrolled={scrolled}>
      <div className="wrap header-row">
        <a className="wordmark" href="#top" aria-label={`${brand.name} home`} onClick={close}>
          <Mark />
          <span className="wordmark-name">{brand.name}</span>
          <span className="wordmark-desc">{brand.descriptor}</span>
        </a>
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <Close /> : <Menu />}
          {open ? 'Close' : 'Menu'}
        </button>
        <nav id="main-nav" className="main-nav" aria-label="Main" data-open={open}>
          {nav.map((n) => (
            <a key={n.href} className="nav-link" href={n.href} onClick={close}>
              {n.label}
            </a>
          ))}
          <a className="btn btn-primary btn-sm" href="#demo" onClick={close}>
            Book a Demo
          </a>
        </nav>
      </div>
    </header>
  );
}
