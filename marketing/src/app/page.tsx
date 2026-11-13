import { brand, features, plans, proof, schoolPhoto } from '@/config/site';
import { formatUSD } from '@/lib/savings';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { HeroDemo } from '@/components/HeroDemo';
import { Scenarios } from '@/components/Scenarios';
import { AdminDemo } from '@/components/AdminDemo';
import { Pricing } from '@/components/Pricing';
import { Calculator } from '@/components/Calculator';
import { DemoForm } from '@/components/DemoForm';
import { FeatureBadge, SampleBadge, StatusBadge } from '@/components/Badge';
import { ArrowRight } from '@/components/Icons';

const lowest = plans.reduce((a, b) => (b.annual < a.annual ? b : a));
const sisStatus = features.sisIntegrations.status;
const sisNow =
  sisStatus === 'live'
    ? 'Supported connections are live for schools that authorize them.'
    : sisStatus === 'pilot'
      ? 'Connections are in pilot with selected schools.'
      : 'Direct connections are planned.';

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What does implementation involve?',
    a: (
      <>
        <p>
          We set up your portal with your team: branding, homepage, calendars, handbook and documents, staff roles, and the
          modules you choose. Existing calendar files (ICS or CSV) and PDFs are imported rather than retyped.
        </p>
        <p>
          The one-time fee covers that setup and staff training. We agree on the timeline before you sign; it depends on
          how much content you bring and which modules you turn on.
        </p>
      </>
    ),
  },
  {
    q: 'Who keeps school content up to date?',
    a: (
      <p>
        Your staff. Administrators and editors update the calendar, documents, homepage, and handbook from the school admin.
        Permissions decide who can publish, and for which grades. {brand.name} does not edit your content unless you ask.
      </p>
    ),
  },
  {
    q: 'Is a submitted notice the same as an official attendance update?',
    a: (
      <>
        <p>
          No. When a family submits a notice, the school receives it and the family gets a receipt. The official attendance
          record does not change at that point.
        </p>
        <p>
          It changes when your office reviews the notice and records it, or, with a verified and authorized SIS integration,
          when the office’s approval updates the SIS through the workflow your school configures.
        </p>
      </>
    ),
  },
  {
    q: 'What can the AI access?',
    a: (
      <>
        <p>
          The school knowledge assistant answers only from content your school approves, such as the handbook and published
          documents, and links to the source it used.
        </p>
        <p>
          The authenticated family assistant can use student-specific information only when your school enables that
          feature, only for guardians whose relationship to the student is verified, and only from data your school has
          connected. When it can’t see something, it says so instead of guessing.
        </p>
      </>
    ),
  },
  {
    q: 'Does it work alongside FACTS?',
    a: (
      <>
        <p>
          Yes. {brand.name} runs next to FACTS, and FACTS stays your system of record for attendance, billing, and grades.
          Your office reviews notices in {brand.name} and records them in FACTS as it does today.
        </p>
        <p>
          {sisNow} FACTS and other SIS connections are subject to provider capabilities and school authorization.
        </p>
      </>
    ),
  },
];

export default function Home() {
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1}>
        {/* ---------- Hero ---------- */}
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="wrap">
            <div className="hero-top">
              <div className="hero-copy" data-enter>
                <p className="eyebrow">For {brand.audience}</p>
                <h1 id="hero-title" className="display h1">
                  Less admin. <em>More time</em> for students.
                </h1>
              </div>
              <div className="hero-side" data-enter>
                <p className="lede">
                  Give families one place to get answers, report absences, and complete school forms. Give your front office a
                  clear view of what needs attention.
                </p>
                <div className="hero-actions">
                  <a className="btn btn-primary" href="#demo">
                    Book a Demo
                  </a>
                  <a className="btn btn-secondary" href="#interactive-demo">
                    Try the Interactive Demo
                  </a>
                </div>
                <p className="hero-fact">
                  <strong>
                    Plans from {formatUSD(lowest.annual)} per school per year.
                  </strong>{' '}
                  <a className="text-link" href="#pricing">
                    See pricing
                  </a>
                </p>
              </div>
            </div>
            <HeroDemo />
          </div>
        </section>

        {/* ---------- Scenarios ---------- */}
        <section className="section section-alt" id="how-it-works" aria-labelledby="how-title">
          <div className="wrap">
            <div className="section-head section-head--split">
              <div style={{ display: 'grid', gap: 20 }}>
                <p className="eyebrow">How it works</p>
                <h2 id="how-title" className="display h2">
                  A school day, with fewer back-and-forths
                </h2>
              </div>
              <p className="lede">
                Three requests every front office knows. Pick one to see what the family sees, what reaches the office, and
                whether anyone on staff has to step in.
              </p>
            </div>
            <Scenarios />
          </div>
        </section>

        {/* ---------- Admin ---------- */}
        <section className="section" id="product" aria-labelledby="admin-title">
          <div className="wrap">
            <div className="section-head section-head--split">
              <div style={{ display: 'grid', gap: 20 }}>
                <p className="eyebrow">Product</p>
                <h2 id="admin-title" className="display h2">
                  Your school can run it
                </h2>
              </div>
              <p className="lede">
                Your office changes the portal itself: the logo, the homepage, the calendar, the handbook, and who can
                publish. No ticket to us, no web developer.
              </p>
            </div>
            <AdminDemo />
          </div>
        </section>

        {/* ---------- Family assistant + systems ---------- */}
        <section className="section section-ink" id="assistant" aria-labelledby="assistant-title">
          <div className="wrap">
            <div className="assistant-grid">
              <div style={{ display: 'grid', gap: 24 }}>
                <p className="eyebrow">
                  Family assistant <FeatureBadge id="familyAssistant" />
                </p>
                <h2 id="assistant-title" className="display h2">
                  Answers about <em style={{ color: 'var(--amber)' }}>their</em> children, not just the school
                </h2>
                <p className="lede">
                  Signed-in families can ask about their own students. What the assistant can answer depends on three
                  things:
                </p>
                <ol className="depends">
                  <li>
                    <span className="num">1</span>
                    <strong>Features your school enables</strong>
                    <p>Forms, attendance, or calendar questions only work when that module is on.</p>
                  </li>
                  <li>
                    <span className="num">2</span>
                    <strong>Verified guardian permissions</strong>
                    <p>Each answer covers only students the guardian is verified for.</p>
                  </li>
                  <li>
                    <span className="num">3</span>
                    <strong>Data your school has connected</strong>
                    <p>If the information isn’t connected, the assistant says so instead of guessing.</p>
                  </li>
                </ol>
              </div>
              <div className="assistant-chat ui" aria-label="Family assistant example">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <strong>Ana Alvarez · signed in</strong>
                  <SampleBadge />
                </div>
                <div className="bubble bubble-me">What forms are still due for my children?</div>
                <div className="bubble bubble-bot">
                  Two forms are still due.
                  <div className="due-list">
                    <div className="due-item">
                      <span className="who">Maya · Grade 3</span>
                      <span className="what">Field trip permission slip</span>
                      <span className="when">Due Fri</span>
                    </div>
                    <div className="due-item">
                      <span className="who">Leo · Grade 1</span>
                      <span className="what">Annual health form update</span>
                      <span className="when">Due Dec 11</span>
                    </div>
                  </div>
                </div>
                <div className="answer-basis" aria-label="What this answer used">
                  <span>Forms module: on</span>
                  <span>Guardian verified for Maya and Leo</span>
                  <span>Source: school forms</span>
                </div>
              </div>
            </div>

            <div className="systems" aria-label="Works with the systems you already use">
              <div className="system-card">
                <StatusBadge status={features.calendarImports.status} />
                <h3>Calendars you already keep</h3>
                <p>Import ICS links and CSV files from athletics, parish, or district calendars.</p>
              </div>
              <div className="system-card">
                <StatusBadge status={features.documents.status} />
                <h3>Handbooks and PDFs</h3>
                <p>Upload what you have. Replacing a file keeps the link families saved.</p>
              </div>
              <div className="system-card">
                <StatusBadge status={sisStatus} />
                <h3>FACTS and other SIS</h3>
                <p>
                  Your SIS stays the system of record. Connections are subject to provider capabilities and school
                  authorization.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Pricing ---------- */}
        <section className="section" id="pricing" aria-labelledby="pricing-title">
          <div className="wrap">
            <div className="section-head section-head--split">
              <div style={{ display: 'grid', gap: 20 }}>
                <p className="eyebrow">Pricing</p>
                <h2 id="pricing-title" className="display h2">
                  Pricing per school, per year
                </h2>
              </div>
              <p className="lede">
                Each plan has an annual subscription and a one-time implementation fee, both in USD. Start with Essential
                and move up when your school is ready.
              </p>
            </div>
            <Pricing />
          </div>
        </section>

        {/* ---------- Calculator ---------- */}
        <section className="section section-alt" id="savings" aria-labelledby="savings-title">
          <div className="wrap">
            <div className="section-head section-head--split">
              <div style={{ display: 'grid', gap: 20 }}>
                <p className="eyebrow">For principals and administrators</p>
                <h2 id="savings-title" className="display h2">
                  Potential Savings Calculator
                </h2>
              </div>
              <p className="lede">
                Estimate how much staff time your school could free up by reducing routine work like answering repeat
                questions, handling attendance emails, and following up on missing forms.
              </p>
            </div>
            <Calculator />
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="section" id="faq" aria-labelledby="faq-title">
          <div className="wrap faq-grid">
            <div style={{ display: 'grid', gap: 20 }}>
              <p className="eyebrow">FAQ</p>
              <h2 id="faq-title" className="display h2">
                Questions principals ask
              </h2>
              <p className="muted">
                Something else?{' '}
                <a className="text-link" href={`mailto:${brand.salesEmail}`}>
                  Email our team
                </a>
                .
              </p>
            </div>
            <div className="faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>
                    {f.q}
                    <span className="plus" aria-hidden="true" />
                  </summary>
                  <div className="answer">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Proof (renders only when approved material is supplied) ---------- */}
        {proof.testimonials.length > 0 && (
          <section className="section section-alt" aria-label="What schools say">
            <div className="wrap">
              {proof.testimonials.map((t) => (
                <figure key={t.name}>
                  <blockquote className="display h2">“{t.quote}”</blockquote>
                  <figcaption>
                    {t.name}, {t.role}, {t.school}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Book a demo ---------- */}
        <section className="section section-ink" id="demo" aria-labelledby="demo-book-title">
          <div className="wrap book">
            <div>
              <p className="eyebrow">Book a Demo</p>
              <h2 id="demo-book-title" className="display h2" style={{ marginTop: 20 }}>
                See how this would work at your school
              </h2>
              <p className="lede" style={{ marginTop: 20 }}>
                Tell us who you are and which systems you use. We’ll walk through the portal with your own calendar and
                handbook in mind.
              </p>
              {schoolPhoto ? (
                <figure className="book-photo">
                  <img
                    src={schoolPhoto.src}
                    srcSet={schoolPhoto.srcSet}
                    sizes="(max-width: 960px) 100vw, 50vw"
                    width={schoolPhoto.width}
                    height={schoolPhoto.height}
                    alt={schoolPhoto.alt}
                    loading="lazy"
                    decoding="async"
                  />
                </figure>
              ) : (
                <ol className="expect">
                  <li>
                    <span className="num">1</span>
                    <span>We look at the requests your front office handles most.</span>
                  </li>
                  <li>
                    <span className="num">2</span>
                    <span>You see the family portal and the office inbox side by side.</span>
                  </li>
                  <li>
                    <span className="num">3</span>
                    <span>We map which plan and modules fit, and what an SIS connection would need.</span>
                  </li>
                </ol>
              )}
              <p style={{ marginTop: 28 }}>
                <a className="text-link" href="#pricing" style={{ color: '#fff' }}>
                  Compare plans <ArrowRight size={14} />
                </a>
              </p>
            </div>
            <DemoForm />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
