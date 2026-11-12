// St. Mary Catholic Virtue School: the first real tenant.
// Every value below is DATA for the seed, not platform logic. Source of each
// fact is recorded in docs/01-auditoria.md.
import type { ThemeTokens } from '../theme/tokens';
import type { ProvisionInput } from './provision';
import { PK8_GRADES } from './provision';

// Verified against assets/css/portal-2627.css of the current portal:
// --navy #16335B, --gold #FCBC40, --cerulean #006D8F (links), --jet #333333
// (text), --tint #F4F8FA; headings in Inter, body text in Open Sans.
export const ST_MARY_THEME: ThemeTokens = {
  colors: {
    primary: '#16335B',
    secondary: '#006D8F',
    accent: '#FCBC40',
    background: '#F4F8FA',
    surface: '#FFFFFF',
    text: '#333333',
  },
  fonts: { heading: 'inter', body: 'open-sans' },
  radius: 'soft',
  header: 'solid',
  appearance: 'light',
  logo: {
    // Hosted on the school's Squarespace site; to be copied into our own
    // storage once the Media Library ships (Phase 3).
    primary:
      'https://images.squarespace-cdn.com/content/v1/644ab63a008317652793377f/5bbc2901-ca52-4b8a-96e9-205d8376edd7/St.MarySchool_Horizontal.png',
    onDark: 'https://stmarycommunication.javiercela.me/portal/assets/logo_white.png',
    favicon: null,
  },
};

export const ST_MARY: Omit<ProvisionInput, 'planId'> = {
  slug: 'stmary',
  name: 'St. Mary Catholic Virtue School',
  timezone: 'America/Denver',
  status: 'active',
  grades: PK8_GRADES,
  academicYear: { label: '2026–27', startsOn: '2026-08-17', endsOn: '2027-05-28' },
  theme: ST_MARY_THEME,
  enabledModules: ['home', 'calendar', 'announcements', 'pages'],
  profile: {
    displayName: 'St. Mary Catholic Virtue School',
    shortName: 'St. Mary',
    tagline: 'Everything your family needs, in one place.',
    addressLine1: '6833 S Prince St.',
    city: 'Littleton',
    region: 'CO',
    postalCode: '80120',
    phone: '(303) 798-2375',
    email: 'officemanager@stmarylittleton.com',
    websiteUrl: 'https://www.littletoncatholicschool.com/',
    officeHours: 'Monday–Friday, 7:30 a.m.–4:00 p.m.',
    footerText: 'St. Mary Catholic Virtue School · Littleton, Colorado',
    affiliation: {
      parish: { name: 'St. Mary Catholic Parish', url: 'https://stmarylittleton.org' },
      diocese: { name: 'Archdiocese of Denver', url: 'https://archden.org' },
    },
    socialLinks: [
      { network: 'instagram', url: 'https://www.instagram.com/stmarycatholicvirtueschool/' },
      { network: 'facebook', url: 'https://www.facebook.com/profile.php?id=100064244336751' },
    ],
  },
};
