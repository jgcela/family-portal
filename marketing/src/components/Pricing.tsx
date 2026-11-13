import { currency, features, plans } from '@/config/site';
import { formatUSD } from '@/lib/savings';
import { FeatureBadge } from './Badge';
import { ArrowRight, Check } from './Icons';

export function Pricing() {
  return (
    <>
      <div className="plans">
        {plans.map((p) => (
          <article
            key={p.id}
            className="plan"
            data-featured={!!p.featured}
            aria-labelledby={`plan-${p.id}`}
          >
            <div>
              {p.featured && <p className="plan-flag">{p.featured}</p>}
              <h3 id={`plan-${p.id}`} className="plan-name" style={p.featured ? { marginTop: 14 } : undefined}>
                {p.name}
              </h3>
              <p className="plan-summary">{p.summary}</p>
            </div>

            <div className="price-pair">
              <div>
                <span className="price-label">Annual subscription</span>
                <span className="price">
                  {p.from && <small>From </small>}
                  {formatUSD(p.annual)}
                </span>
                <span className="price-label">per school / year</span>
              </div>
              <div>
                <span className="price-label">One-time implementation</span>
                <span className="price">
                  {p.from && <small>From </small>}
                  {formatUSD(p.implementation)}
                </span>
                <span className="price-label">first year only</span>
              </div>
            </div>

            {p.note ? <p className="price-note">{p.note}</p> : <span aria-hidden="true" />}

            <ul className="feature-list">
              {p.includesPrevious && <li className="includes">{p.includesPrevious}</li>}
              {p.features.map((f) => (
                <li key={f}>
                  <Check size={18} />
                  <span>
                    {features[f].label}
                    <FeatureBadge id={f} />
                  </span>
                </li>
              ))}
            </ul>

            <a
              className={`btn ${p.featured ? 'btn-primary' : 'btn-secondary'}`}
              href={`#demo`}
              data-plan={p.id}
            >
              {p.cta} <ArrowRight size={16} />
            </a>
          </article>
        ))}
      </div>
      <div className="pricing-foot">
        <span>All prices in {currency}, per school, billed annually.</span>
        <span>Implementation is paid once, in the first year.</span>
        <span>Status labels show what is live today, in pilot, or planned.</span>
      </div>
    </>
  );
}
