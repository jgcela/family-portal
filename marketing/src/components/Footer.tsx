import { brand, nav, schoolPhoto } from '@/config/site';
import { Mark } from './Icons';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-row">
          <a className="wordmark" href="#top" aria-label={`${brand.name} home`}>
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
            <a href="#savings">Savings Calculator</a>
            <a href="#faq">FAQ</a>
            <a href="#demo">Book a Demo</a>
            <a href={`mailto:${brand.salesEmail}`}>Email sales</a>
          </nav>
        </div>
        <div className="footer-meta">
          <p>
            © {brand.year} {brand.name}. {brand.descriptor} for {brand.audience}.
          </p>
          <p>
            Product demos use fictional students and sample school content.
            {schoolPhoto ? ` Photo: ${schoolPhoto.credit}.` : ''}
          </p>
        </div>
      </div>
    </footer>
  );
}
