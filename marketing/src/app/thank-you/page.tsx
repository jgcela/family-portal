import { pageMeta } from '@/lib/meta';
import { SimplePage } from '@/components/SimplePage';
import { brand, demo } from '@/config/site';

// Shown after a demo request is accepted. Its page view is the conversion to
// count in analytics. Not for search engines.
export const metadata = pageMeta({
  title: 'Thanks for your demo request',
  description: `We received your request and will reply to your work email to set a time for a ${brand.name} demo.`,
  path: '/thank-you',
  index: false,
});

export default function ThankYou() {
  return (
    <SimplePage eyebrow="Request received" title="Thanks. We’ll be in touch.">
      <p className="lede">
        We’ll reply to your work email to set a time for your demo. If you need us sooner, write to{' '}
        <a href={`mailto:${brand.salesEmail}`}>{brand.salesEmail}</a>.
      </p>
      <p className="simple-actions">
        {demo.bookingUrl && (
          <a className="btn btn-primary" href={demo.bookingUrl}>
            Pick a time now
          </a>
        )}
        <a className={demo.bookingUrl ? 'btn btn-secondary' : 'btn btn-primary'} href="/#pricing">
          Review pricing
        </a>
      </p>
    </SimplePage>
  );
}
