# School administrator guide

For the people who run a school's portal day to day. Everything here happens in the school panel: `https://<portal address>/admin` (for St. Mary today, `https://family-portal-brown.vercel.app/s/stmary/admin`).

What you see in the menu depends on your role. If a section is missing, ask your School Owner to give you a role that includes it (People → Roles & Permissions).

## 1. Signing in

1. Open the panel address and sign in with your email and password.
2. Forgot your password? There is no reset by email yet. Ask the platform team.

## 2. The menu

| Menu | What it is for |
|---|---|
| Dashboard | What needs attention: items waiting for review, families waiting for approval, support requests |
| School life | Announcements, Calendar & Events, School pages, Documents, Volunteer, Community |
| Portal design | Theme (colors and fonts), Homepage (blocks), Links (header button, menu, Quick access) |
| People | Staff, Families, Roles & Permissions |
| Module Manager | Turn portal sections on or off |
| Settings | Domains, Support access |

The search box at the top ("Go to…", or ⌘K) jumps to any section.

## 3. Who sees what

Almost everything has a **"Who can see it"** choice:

- **Everyone (public):** anyone with the link, without signing in.
- **Families:** signed-in families. You can limit some items to one grade or group.
- **Staff:** only staff signed in to the school.

Anything that is not "Everyone" never shows to visitors, and its files are never reachable through a public link.

## 4. Announcements

1. School life → Announcements → **New announcement**.
2. Write the title and text. Mark **Urgent** to show it first and highlighted, or **Pin to the top**.
3. Choose who can see it.
4. **Save and publish** puts it live now. If your role needs approval, the button is **Save and send for review**, and someone with publishing rights publishes it from the Dashboard.

## 5. Calendar & Events

- **New event:** title, date and time (or all day), calendar, category, who can see it.
- **Import events:** upload a `.ics` file (Google Calendar, Outlook) or a `.csv`. Choose the calendar and time zone, press **Check file**, review the summary, then import. Importing the same file again updates events instead of duplicating them.
- **Calendars:** each calendar has a subscription link families can add to their phone.

The **Calendar alert** homepage block warns families about upcoming days with a chosen category (by default "No school", 14 days ahead).

## 6. Documents

1. School life → Documents → **Upload document** (one file) or **Upload several** (a batch, same category and audience).
2. Accepted: PDF, Word, Excel, PowerPoint and images, up to 25 MB.
3. Each document gets a **Link name**, for example `/d/student-handbook-2026-27`. That link always opens the current version.
4. **Upload new version** replaces the file and keeps the link.

## 7. School pages

Free pages such as "Uniform policy" or "Before & after care". **New page**, write it, choose who can see it, **Save and publish**. Earlier published versions are kept: open one and press **Use this version** to go back.

## 8. Volunteer and Community

- **Volunteer:** opportunities with a description, contact and sign-up link. **Import** loads a file prepared by the platform.
- **Community:** teacher wishlists (a secure https link is required) and staff "favorite things" cards. **Show it** turns an item on or off without deleting it.

## 9. Portal design

- **Theme:** colors, fonts and corner style. **Save draft** and **Preview draft on the portal** let you check it before **Save and publish**. If a color makes text hard to read, publishing is blocked and the message says which pair to fix.
- **Homepage:** **Add a block** (welcome, announcements, this week, calendar alert, quick access, text…), reorder, **Show**/hide, then **Save and publish**.
- **Links:** the header button (for example "FACTS Login"), extra menu links and Quick access tiles. A link is either a portal path (`/documents`, `/d/…`) or a secure web address. Up to 12 per menu.

## 10. People

**Staff**

1. People → Staff → **Invite someone**: name, email, role.
2. **Create invitation link** and send the link to the person yourself. Links work once and expire after 7 days.
3. To change what someone can do, add or remove roles on their row. **Remove from school** ends their access.

**Families**

1. People → Families → **How families join**: **Open joining** creates a school code. Share the code with families (newsletter, back-to-school night).
2. Families create an account with the code and the grades of their children.
3. They wait in **Waiting for you** until a staff member **Approves** or **Declines** them. Approved families see "Families" content for their grades.
4. **Replace code** if the code leaked. **Close joining** stops new requests.

**Roles & Permissions**

Ready-made roles (School Owner, Principal, Communications manager, Teacher, Volunteer coordinator…) and the table of what each can do. You can create your own role. There is always at least one School Owner.

## 11. Module Manager

Turns sections of the portal on or off (Calendar, Documents, Volunteer, Community, Quick links…). Turning one off hides it from families but keeps its content. Modules your plan does not include show their plan; "Coming later" ones do not exist yet.

## 12. Settings

- **Domains:** connect your own address (for example `portal.yourschool.org`). Add it, create the two DNS records shown (TXT and CNAME) with whoever manages your domain, then **Check DNS now**. The platform team also has to add the domain on their side.
- **Support access:** the platform team can ask to look at your panel to help you. You see the request, the reason, the areas and how long it lasts, and you **Approve** or **Decline**. Support access is read-only, and you can **End access now** at any time. Every step is recorded.

## 13. What the portal does not do yet

- No email or text notifications: share links yourself.
- No payments, grades, attendance or student records. Use FACTS for those.
- No School Messenger archive yet.
- No sign-in with FACTS: families have their own portal account.
- No password reset by email and no two-step sign-in setup for school accounts yet.
