import { pageMeta } from '@/lib/meta';
import { SimplePage } from '@/components/SimplePage';

export const metadata = pageMeta({
  title: 'Page not found',
  description: 'This page does not exist. Go back to the FAMITENLY home page or book a demo.',
  index: false,
});

export default function NotFound() {
  return (
    <SimplePage eyebrow="404" title="We couldn’t find that page">
      <p className="lede">The link may be old or mistyped.</p>
      <p className="simple-actions">
        <a className="btn btn-primary" href="/">
          Go to the home page
        </a>
        <a className="btn btn-secondary" href="/#demo">
          Book a Demo
        </a>
      </p>
    </SimplePage>
  );
}
