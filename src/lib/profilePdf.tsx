/**
 * "Download PDF": the lead's profile in the same layout as the team's Google Doc template
 * (LinkedIn's own "Save to PDF" look): a dark sidebar with Contact, Top Skills, Languages,
 * Certifications, Courses, Honors and Publications, and the main column with name, headline,
 * location, Summary, Experience, Education, Projects and Volunteering.
 * Made in the browser and saved straight to the user's computer — nothing goes to Google Drive.
 * Loaded only when the button is pressed (it is a large library).
 */
import { Document, Font, Link, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import regularUrl from '../assets/fonts/Arimo_400Regular.ttf?url';
import boldUrl from '../assets/fonts/Arimo_700Bold.ttf?url';
import italicUrl from '../assets/fonts/Arimo_400Regular_Italic.ttf?url';
import type { DatedEntry, ExperienceEntry, Profile } from './profile';
import { hrefFor } from './profile';

let fontsReady = false;
export function registerPdfFonts(urls = { regular: regularUrl, bold: boldUrl, italic: italicUrl }) {
  if (fontsReady) return;
  // Arimo has the same measurements as Arial, the template's font.
  Font.register({
    family: 'Arimo',
    fonts: [
      { src: urls.regular },
      { src: urls.bold, fontWeight: 700 },
      { src: urls.italic, fontStyle: 'italic' },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]); // no hyphens inside names and words
  fontsReady = true;
}

/** Emoji and scripts the font cannot draw would print as boxes. */
export function pdfText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/[^\u0000-֏Ḁ-῿ -⅏←-⇿−─-◿☀-⛿]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const SIDEBAR = '#2e3f4f';
const s = StyleSheet.create({
  page: { fontFamily: 'Arimo', fontSize: 9.5, color: '#222222', flexDirection: 'row', paddingTop: 36, paddingBottom: 36 },
  sideBg: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 205, backgroundColor: SIDEBAR },
  side: { width: 205, paddingLeft: 22, paddingRight: 16, color: '#ffffff' },
  main: { flex: 1, paddingLeft: 26, paddingRight: 34 },
  sideHead: { fontSize: 12.5, fontWeight: 700, color: '#ffffff', marginTop: 16, marginBottom: 5 },
  sideText: { fontSize: 9, color: '#ffffff', marginBottom: 2, lineHeight: 1.35 },
  sideMuted: { fontSize: 8.5, color: '#aab4bd', marginBottom: 4, lineHeight: 1.35 },
  sideBold: { fontSize: 9, color: '#ffffff', fontWeight: 700, marginTop: 4, lineHeight: 1.35 },
  name: { fontSize: 28, color: '#222222', marginBottom: 6 },
  headline: { fontSize: 11, color: '#222222', lineHeight: 1.35 },
  location: { fontSize: 9.5, color: '#999999', marginTop: 4 },
  head: { fontSize: 14, color: '#222222', marginTop: 18, paddingBottom: 4, marginBottom: 8, borderBottomWidth: 0.75, borderBottomColor: '#cccccc' },
  para: { fontSize: 9.5, lineHeight: 1.4, marginBottom: 5 },
  entry: { marginBottom: 12 },
  company: { fontSize: 11, fontWeight: 700, color: '#222222', marginBottom: 1 },
  role: { fontSize: 10, color: '#222222', marginTop: 2 },
  muted: { fontSize: 9, color: '#999999', marginTop: 1 },
  desc: { fontSize: 9, lineHeight: 1.4, color: '#444444', marginTop: 3 },
  footer: { position: 'absolute', bottom: 16, right: 34, width: 120, textAlign: 'right', fontSize: 8, color: '#999999' },
});

function SideBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View wrap={false}>
      <Text style={s.sideHead}>{title}</Text>
      {children}
    </View>
  );
}

function Desc({ lines }: { lines: string[] }) {
  const text = lines.map(pdfText).filter(Boolean);
  if (!text.length) return null;
  return (
    <View>
      {text.map((l, i) => (
        <Text key={i} style={s.desc}>
          {l}
        </Text>
      ))}
    </View>
  );
}

/** Same grouping as LinkedIn: consecutive roles at one company under one heading. */
function groups(entries: ExperienceEntry[]) {
  const out: { company: string | null; total: string | null; roles: ExperienceEntry[] }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && e.company && last.company === e.company && (last.total || e.groupDuration)) last.roles.push(e);
    else out.push({ company: e.company, total: e.groupDuration, roles: [e] });
  }
  return out;
}

function Dated({ title, entries }: { title: string; entries: DatedEntry[] }) {
  if (!entries.length) return null;
  return (
    <View>
      <Text style={s.head} minPresenceAhead={40}>
        {title}
      </Text>
      {entries.map((e, i) => (
        <View key={i} style={s.entry}>
          <Text wrap={false} style={{ lineHeight: 1.45 }}>
            <Text style={s.company}>{pdfText(e.title)}</Text>
            {e.subtitle ? <Text style={s.role}>{'\n' + pdfText(e.subtitle)}</Text> : null}
            {e.dates ? <Text style={s.muted}>{'\n' + pdfText(e.dates)}</Text> : null}
            {e.associated ? <Text style={s.muted}>{'\nAssociated with ' + pdfText(e.associated)}</Text> : null}
          </Text>
          <Desc lines={e.description} />
        </View>
      ))}
    </View>
  );
}

export function ProfileDocument({ p }: { p: Profile }) {
  const contact: [string, string | null, string | null][] = [
    [p.phone ?? '', p.phone ? 'Mobile' : null, null],
    [p.email ?? '', p.email ? 'Email' : null, p.email ? `mailto:${p.email}` : null],
    [p.linkedinUrl?.replace(/^https?:\/\//, '') ?? '', p.linkedinUrl ? 'LinkedIn' : null, p.linkedinUrl],
    [[p.company, p.website ? `(${p.website})` : ''].filter(Boolean).join(' '), p.company || p.website ? 'Company' : null, hrefFor(p.website)],
  ];
  return (
    <Document title={`${pdfText(p.name)} - Profile`} author="GAB" creator="GAB LinkedIn Outreach" producer="GAB">
      <Page size="LETTER" style={s.page}>
        <View style={s.sideBg} fixed />
        <View style={s.side}>
          <Text style={[s.sideHead, { marginTop: 0 }]}>Contact</Text>
          {contact
            .filter(([v, label]) => v && label)
            .map(([v, label, href]) => (
              <View key={label as string} style={{ marginBottom: 3 }}>
                {href ? (
                  <Link src={href} style={[s.sideText, { textDecoration: 'none' }]}>
                    {pdfText(v)}
                  </Link>
                ) : (
                  <Text style={s.sideText}>{pdfText(v)}</Text>
                )}
                <Text style={s.sideMuted}>({label})</Text>
              </View>
            ))}

          {p.skills.length ? (
            <SideBlock title="Top Skills">
              {p.skills.slice(0, 12).map((sk) => (
                <Text key={sk} style={s.sideText}>
                  {pdfText(sk)}
                </Text>
              ))}
            </SideBlock>
          ) : null}

          {p.languages.length ? (
            <SideBlock title="Languages">
              {p.languages.map((l) => (
                <View key={l.name}>
                  <Text style={s.sideText}>{pdfText(l.name)}</Text>
                  {l.level ? <Text style={s.sideMuted}>({pdfText(l.level)})</Text> : null}
                </View>
              ))}
            </SideBlock>
          ) : null}

          {p.certifications.length ? (
            <View>
              <Text style={s.sideHead}>Certifications</Text>
              {p.certifications.map((c, i) => (
                <View key={i} wrap={false} style={{ marginBottom: 3 }}>
                  <Text style={s.sideText}>{pdfText(c.name)}</Text>
                  {c.issuer || c.issued ? (
                    <Text style={s.sideMuted}>{pdfText([c.issuer, c.issued].filter(Boolean).join(' · '))}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {p.courses.length ? (
            <SideBlock title="Courses">
              {p.courses.map((c) => (
                <Text key={c} style={s.sideText}>
                  {pdfText(c)}
                </Text>
              ))}
            </SideBlock>
          ) : null}

          {p.honors.length ? (
            <View>
              <Text style={s.sideHead}>Honors-Awards</Text>
              {p.honors.map((h, i) => (
                <View key={i} wrap={false} style={{ marginBottom: 3 }}>
                  <Text style={s.sideText}>{pdfText(h.title)}</Text>
                  {h.dates ? <Text style={s.sideMuted}>{pdfText(h.dates)}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}

          {p.publications.length ? (
            <View>
              <Text style={s.sideHead}>Publications</Text>
              {p.publications.map((h, i) => (
                <Text key={i} style={s.sideText}>
                  {pdfText(h.title)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <View style={s.main}>
          <Text style={s.name}>{pdfText(p.name)}</Text>
          {p.headline ? <Text style={s.headline}>{pdfText(p.headline)}</Text> : null}
          {p.location ? <Text style={s.location}>{pdfText(p.location)}</Text> : null}

          {p.about.length ? (
            <View>
              <Text style={s.head} minPresenceAhead={40}>
                Summary
              </Text>
              {p.about.map((para, i) => (
                <Text key={i} style={s.para}>
                  {pdfText(para)}
                </Text>
              ))}
            </View>
          ) : null}

          {p.experience.length ? (
            <View>
              <Text style={s.head} minPresenceAhead={40}>
                Experience
              </Text>
              {groups(p.experience).map((g, gi) => (
                <View key={gi} style={s.entry}>
                  {g.roles.map((r, ri) => (
                    <View key={ri} style={{ marginTop: ri ? 8 : 0 }}>
                      {/* one unbreakable block: the heading never sits alone at the bottom of a page */}
                      <Text wrap={false} style={{ lineHeight: 1.45 }}>
                        {ri === 0 ? <Text style={s.company}>{pdfText(g.company ?? g.roles[0].title) + '\n'}</Text> : null}
                        {ri === 0 && g.total ? <Text style={s.muted}>{pdfText(g.total) + '\n'}</Text> : null}
                        <Text style={s.role}>{pdfText(r.title) + '\n'}</Text>
                        <Text style={s.muted}>
                          {pdfText([r.dates, r.duration ? `(${r.duration})` : ''].filter(Boolean).join(' '))}
                          {r.location ? '\n' + pdfText(r.location) : ''}
                        </Text>
                      </Text>
                      <Desc lines={r.description} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : null}

          {p.education.length ? (
            <View>
              <Text style={s.head} minPresenceAhead={40}>
                Education
              </Text>
              {p.education.map((e, i) => (
                <View key={i} style={s.entry} wrap={false}>
                  <Text style={s.company}>{pdfText(e.school)}</Text>
                  {e.degree || e.dates ? (
                    <Text style={s.role}>{pdfText([e.degree, e.dates ? `(${e.dates})` : ''].filter(Boolean).join(' · '))}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          <Dated title="Projects" entries={p.projects} />
          <Dated title="Volunteering" entries={p.volunteering} />
        </View>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export function pdfFileName(p: Profile): string {
  const base = pdfText(p.name).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Profile';
  return `${base} - Profile.pdf`;
}

export async function downloadProfilePdf(p: Profile): Promise<void> {
  registerPdfFonts();
  const blob = await pdf(<ProfileDocument p={p} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfFileName(p);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
