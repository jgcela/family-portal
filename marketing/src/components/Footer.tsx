import { brand, legal, legalName, nav, schoolLoginUrl, schoolPhoto } from '@/config/site';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-row">
          <a className="wordmark" href="/" aria-label={`${brand.name} home`}>
            <img className="wordmark-logo" src="/logo.svg" alt="" width={1188} height={216} />
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
            <a href={schoolLoginUrl}>School login</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
        </div>
        <img className="footer-wordmark" src="/logo.svg" alt="" aria-hidden="true" width={1188} height={216} />
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
