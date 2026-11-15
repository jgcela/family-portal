import { pageMeta } from '@/lib/meta';
import { SimplePage } from '@/components/SimplePage';
import { analytics, brand, legal, legalName, privacyEmail } from '@/config/site';

export const metadata = pageMeta({
  title: 'Privacy Policy',
  description: `How ${brand.name} handles information on this website: demo requests, cookieless analytics and server logs. No advertising cookies, no selling of data.`,
  path: '/privacy',
});

export default function Privacy() {
  const email = privacyEmail();
  const hasAnalytics = !!(analytics.cloudflareToken || analytics.plausibleDomain);
  const provider = analytics.cloudflareToken ? 'Cloudflare Web Analytics' : 'Plausible Analytics';
  return (
    <SimplePage eyebrow={`Last updated ${legal.updated}`} title="Privacy Policy">
      <p>
        This policy covers the {brand.name} website at {brand.domain}, run by {legalName()}
        {legal.address.length > 0 ? `, ${legal.address.join(', ')}` : ''}. Questions or requests:{' '}
        <a href={`mailto:${email}`}>{email}</a>.
      </p>

      <h2 className="h3">What we collect on this website</h2>
      <ul>
        <li>
          <strong>Demo requests.</strong> When you ask for a demo we receive your name, work email, school and, if you
          choose, your student information system. We use them only to reply and arrange the demo.
        </li>
        <li>
          <strong>Usage statistics.</strong>{' '}
          {hasAnalytics
            ? `We use ${provider}, which counts page views, referring sites, country and device type without cookies and without building a profile of you.`
            : 'We do not run analytics on this website at the moment.'}
        </li>
        <li>
          <strong>Server logs.</strong> Our hosting provider records technical data such as IP address, browser type and
          the pages requested, to deliver the site and protect it from abuse.
        </li>
      </ul>

      <h2 className="h3">Cookies</h2>
      <p>
        This website does not set advertising or tracking cookies, which is why there is no cookie banner. If that
        changes, we will ask for your consent first and update this page.
      </p>

      <h2 className="h3">Sharing</h2>
      <p>
        We do not sell or rent personal information and do not share it for advertising. We share it only with the
        service providers that run this website and our email, under contracts that limit their use of it, or when the
        law requires it.
      </p>

      <h2 className="h3">How long we keep it</h2>
      <p>
        We keep demo requests while we are in contact with you and delete them within 24 months of our last exchange,
        unless your school becomes a customer. Server logs are kept for a short period set by our hosting provider.
      </p>

      <h2 className="h3">Your choices</h2>
      <p>
        You can ask to see, correct or delete the information you sent us by writing to{' '}
        <a href={`mailto:${email}`}>{email}</a>. We will answer within 30 days.
      </p>

      <h2 className="h3">Schools that use {brand.name}</h2>
      <p>
        This policy is about the public website only. When a school uses the {brand.name} platform, the school decides
        what family and student information goes into its portal. We process that information only to provide the
        service to the school, under our written agreement with the school, and never for advertising. Families with
        questions about their data should contact their school.
      </p>

      <h2 className="h3">Children</h2>
      <p>This website is for school staff and is not directed to children under 13.</p>

      <h2 className="h3">Changes</h2>
      <p>If we change this policy we will update the date at the top of this page.</p>
    </SimplePage>
  );
}
