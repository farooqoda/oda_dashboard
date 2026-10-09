/**
 * Excel / CSV download with the same columns, in the same order, as the team's
 * "Master Lead Pipeline" Google Sheet. Made in the browser and saved to the user's computer.
 */
import { downloadCsv } from './csv';
import { stageOf } from './format';
import { profileFromLead } from './profile';
import type { Profile } from './profile';
import type { Lead } from './types';

const join = (parts: (string | null | undefined)[], sep: string) => parts.filter((p) => p && p.trim()).join(sep);

function experienceText(p: Profile): string {
  if (!p.experience.length) return p.text.experience;
  return p.experience
    .map((e) =>
      join(
        [
          join([e.title, join([e.company, e.employmentType], ' · ')], ' — '),
          join([e.dates, e.duration], ' · '),
          e.location,
          e.description.join('\n'),
        ],
        '\n',
      ),
    )
    .join('\n\n');
}

function datedText(entries: Profile['projects']): string {
  return entries
    .map((e) => join([join([e.title, e.subtitle], ' — '), e.dates, e.associated && `Associated with ${e.associated}`, e.description.join('\n')], '\n'))
    .join('\n\n');
}

export const MASTER_COLUMNS: { header: string; width: number; get: (lead: Lead, p: Profile) => string }[] = [
  { header: 'Full Name', width: 24, get: (_l, p) => p.name },
  { header: 'Title', width: 40, get: (_l, p) => p.headline ?? '' },
  { header: 'Company Name', width: 26, get: (_l, p) => p.company ?? '' },
  { header: 'Website', width: 24, get: (_l, p) => p.website ?? '' },
  { header: 'University', width: 26, get: (_l, p) => p.university ?? '' },
  { header: 'Department/Subject', width: 22, get: (_l, p) => p.department ?? '' },
  { header: 'LinkedIn URL', width: 36, get: (l, p) => p.linkedinUrl ?? l.linkedin_url ?? '' },
  { header: 'Email', width: 28, get: (_l, p) => p.email ?? '' },
  { header: 'Phone Number', width: 16, get: (_l, p) => p.phone ?? '' },
  { header: 'Location', width: 28, get: (_l, p) => p.location ?? '' },
  { header: 'City', width: 16, get: (_l, p) => p.city ?? '' },
  { header: 'Country', width: 16, get: (_l, p) => p.country ?? '' },
  { header: 'Status', width: 16, get: (l) => stageOf(l) },
  { header: 'About', width: 60, get: (_l, p) => p.about.join('\n\n') },
  { header: 'Skills', width: 40, get: (_l, p) => (p.skills.length ? p.skills.join(', ') : '') },
  { header: 'Languages', width: 30, get: (_l, p) => p.languages.map((x) => join([x.name, x.level && `(${x.level})`], ' ')).join(', ') },
  { header: 'Experience', width: 70, get: (_l, p) => experienceText(p) },
  {
    header: 'Education',
    width: 50,
    get: (_l, p) => p.education.map((e) => join([e.school, e.degree, e.dates], ' — ')).join('\n') || p.text.education,
  },
  {
    header: 'Certifications',
    width: 45,
    get: (_l, p) => p.certifications.map((c) => join([c.name, c.issuer, c.issued && `Issued ${c.issued}`], ' — ')).join('\n'),
  },
  { header: 'Courses', width: 30, get: (_l, p) => p.courses.join('\n') },
  { header: 'Projects', width: 50, get: (_l, p) => datedText(p.projects) },
  { header: 'Volunteering', width: 45, get: (_l, p) => datedText(p.volunteering) },
  { header: 'Honors', width: 40, get: (_l, p) => datedText(p.honors) },
  { header: 'Publications', width: 40, get: (_l, p) => datedText(p.publications) },
];

/** Excel cells hold at most 32,767 characters. */
const cap = (s: string) => (s.length > 32000 ? `${s.slice(0, 32000)}…` : s);

export function masterRows(leads: Lead[]): string[][] {
  return leads.map((lead) => {
    const p = profileFromLead(lead);
    return MASTER_COLUMNS.map((c) => cap(c.get(lead, p) ?? ''));
  });
}

function escapeCell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadMasterCsv(leads: Lead[], fileName: string): void {
  const lines = [MASTER_COLUMNS.map((c) => c.header), ...masterRows(leads)].map((r) => r.map(escapeCell).join(','));
  downloadCsv(fileName, lines.join('\r\n'));
}

export async function downloadMasterXlsx(leads: Lead[], fileName: string): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const header = MASTER_COLUMNS.map((c) => ({
    value: c.header,
    fontWeight: 'bold' as const,
    textColor: '#FFFFFF',
    backgroundColor: '#0E2747',
    alignVertical: 'center' as const,
  }));
  const body = masterRows(leads).map((r) =>
    r.map((v) => (v ? { value: v, wrap: v.includes('\n') || v.length > 60, alignVertical: 'top' as const } : null)),
  );
  await writeXlsxFile([header, ...body], {
    sheet: 'Master Lead Pipeline',
    columns: MASTER_COLUMNS.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
  }).toFile(fileName);
}
