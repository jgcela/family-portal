import { Header } from './Header';
import { Footer } from './Footer';

/** Layout for the short pages (legal, thank-you, 404): header, one column, footer. */
export function SimplePage({ eyebrow, title, children }: { eyebrow?: string; title: string; children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1} className="simple-page">
        <div className="wrap simple-wrap">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="h2">{title}</h1>
          <div className="simple-body">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}
