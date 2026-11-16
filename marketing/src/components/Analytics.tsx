import { analytics } from '@/config/site';

/**
 * Cookieless page analytics, only when configured at build time (see
 * `analytics` in config/site.ts). Nothing loads otherwise.
 */
export function Analytics() {
  if (analytics.cloudflareToken) {
    return (
      <script
        defer
        src="https://static.cloudflareinsights.com/beacon.min.js"
        data-cf-beacon={JSON.stringify({ token: analytics.cloudflareToken })}
      />
    );
  }
  if (analytics.plausibleDomain) {
    return <script defer data-domain={analytics.plausibleDomain} src="https://plausible.io/js/script.js" />;
  }
  return null;
}
