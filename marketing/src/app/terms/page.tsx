import { pageMeta } from '@/lib/meta';
import { SimplePage } from '@/components/SimplePage';
import { brand, legal, legalName } from '@/config/site';

export const metadata = pageMeta({
  title: 'Terms of Use',
  description: `Terms for using the ${brand.name} website. Use of the ${brand.name} platform by schools is governed by a separate written agreement.`,
  path: '/terms',
});

export default function Terms() {
  return (
    <SimplePage eyebrow={`Last updated ${legal.updated}`} title="Terms of Use">
      <p>
        These terms apply to the {brand.name} website at {brand.domain}, run by {legalName()}
        {legal.address.length > 0 ? `, ${legal.address.join(', ')}` : ''}. By using the website you accept them.
      </p>

      <h2 className="h3">The website and the platform</h2>
      <p>
        This website describes the {brand.name} platform. A school’s use of the platform is governed by a separate
        written agreement, which takes precedence over anything on this website.
      </p>

      <h2 className="h3">Prices and features</h2>
      <p>
        Prices are in US dollars and exclude taxes. Features marked “Planned” or “In pilot” are not yet generally
        available and may change. Product demos on this website use fictional students and sample content. The savings
        calculator gives an estimate based on the numbers you enter, not a promise of results. A quote or signed
        agreement is binding; this website is not an offer.
      </p>

      <h2 className="h3">Acceptable use</h2>
      <p>
        Do not try to disrupt the website, access it by automated means that put an unreasonable load on it, or probe it
        for security weaknesses without our written permission. To report a security issue, write to{' '}
        <a href={`mailto:${brand.salesEmail}`}>{brand.salesEmail}</a>.
      </p>

      <h2 className="h3">Content</h2>
      <p>
        The text, design and graphics of this website belong to {legalName()} or its licensors. You may share links to
        it and quote it with attribution. School names and trademarks belong to their owners.
      </p>

      <h2 className="h3">No warranty and limits of liability</h2>
      <p>
        The website is provided “as is”. To the extent the law allows, {legalName()} is not liable for indirect or
        consequential losses arising from use of the website.
      </p>

      {legal.governingState && (
        <>
          <h2 className="h3">Governing law</h2>
          <p>These terms are governed by the laws of the State of {legal.governingState}, USA.</p>
        </>
      )}

      <h2 className="h3">Changes and contact</h2>
      <p>
        We may update these terms and will change the date at the top when we do. Questions:{' '}
        <a href={`mailto:${brand.salesEmail}`}>{brand.salesEmail}</a>.
      </p>
    </SimplePage>
  );
}
