import { brand, legal, legalName, nav, schoolPhoto } from '@/config/site';
import { Mark } from './Icons';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-row">
          <a className="wordmark" href="/" aria-label={`${brand.name} home`}>
            <Mark />
            <span className="wordmark-name">{brand.name}</span>
            <span className="wordmark-desc">{brand.descriptor}</span>
          </a>
          <nav className="footer-links" aria-label="Footer">
            {nav.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
            <a href="/#savings">Savings Calculator</a>
            <a href="/#faq">FAQ</a>
            <a href="/#demo">Book a Demo</a>
            <a href={`mailto:${brand.salesEmail}`}>Email sales</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
        </div>
        <p className="footer-wordmark" aria-hidden="true">
          {brand.name}
        </p>
        <div className="footer-meta">
          <p>
            © {brand.year} {legalName()}. {brand.descriptor} for {brand.audience}.
          </p>
          {legal.address.length > 0 && (
            <address>
              {legalName()}, {legal.address.join(', ')} · <a href={`mailto:${brand.salesEmail}`}>{brand.salesEmail}</a>
            </address>
          )}
          <p>
            Product demos use fictional students and sample school content.
            {schoolPhoto ? ` Photo: ${schoolPhoto.credit}.` : ''}
          </p>
        </div>
      </div>
    </footer>
  );
}
