/**
 * Turns a synced lead into a structured, LinkedIn-like profile.
 *
 * Two sources:
 *  - gab_leads.profile_sections (leads synced with Part 2 ver30+): clean text per section.
 *  - gab_leads.profile_text (older leads): the Google Doc text read back from Drive, with the
 *    template's placeholders and sometimes several copies of the profile. We take the fullest
 *    copy and split it by the template's headings.
 * Each section's text is then parsed into entries (job, school, certificate...).
 */
import { traitString } from './traitsRegistry';
import type { Lead } from './types';

export interface ProfileSections {
  v?: number;
  name?: string;
  headline?: string;
  location?: string;
  city?: string;
  country?: string;
  email?: string;
  phone?: string;
  website?: string;
  company?: string;
  linkedin_url?: string;
  university?: string;
  department?: string;
  about?: string;
  experience?: string;
  education?: string;
  skills?: string;
  languages?: string;
  certifications?: string;
  courses?: string;
  projects?: string;
  volunteering?: string;
  honors?: string;
  publications?: string;
}

export interface ExperienceEntry {
  title: string;
  company: string | null;
  employmentType: string | null;
  dates: string | null;
  duration: string | null;
  location: string | null;
  description: string[];
  skills: string | null;
  /** Several roles at one company: the company's total time, shown once. */
  groupDuration: string | null;
}
export interface EducationEntry { school: string; degree: string | null; dates: string | null; details: string[] }
export interface CertificationEntry { name: string; issuer: string | null; issued: string | null; credentialId: string | null }
export interface LanguageEntry { name: string; level: string | null }
export interface DatedEntry { title: string; subtitle: string | null; dates: string | null; associated: string | null; description: string[] }

export interface Profile {
  source: 'sections' | 'legacy' | 'basic';
  name: string;
  headline: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  company: string | null;
  linkedinUrl: string | null;
  university: string | null;
  department: string | null;
  about: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  languages: LanguageEntry[];
  certifications: CertificationEntry[];
  courses: string[];
  projects: DatedEntry[];
  volunteering: DatedEntry[];
  honors: DatedEntry[];
  publications: DatedEntry[];
  /** Section text as it was scraped (for the Excel export and as a fallback). */
  text: Required<Pick<ProfileSections, 'about' | 'experience' | 'education' | 'skills' | 'languages' | 'certifications' | 'courses' | 'projects' | 'volunteering' | 'honors' | 'publications'>>;
}

// ---------------------------------------------------------------------------
// Line cleaning
// ---------------------------------------------------------------------------
const EMPTY_VALUE = /^(not specified|not publicly available|independent|n\/a|none|unknown lead|professional)$/i;
const HEADING =
  /^(about|summary|experience|education|skills|top skills|languages|licenses & certifications|certifications|honors & awards|honors|awards|courses|projects|volunteering|volunteer experience|publications|contact)(\s*\(\d+\))?$/i;
const NOISE: RegExp[] = [
  /^…\s*more$/i, /^\.\.\.\s*more$/i, /^see more$/i, /^show (all|more|less)\b/i, /^see all\b/i,
  /^endorse$/i, /^endorsed by\b/i, /^\d+\s+endorsements?$/i, /^show (credential|project|publication)$/i,
  /^\((populated if found|mobile|linkedin|company|work|home|other)\b.*\)$/i, /^↳/,
  /^passed linkedin skill assessment$/i, /^[.\-–•·,;:]+$/, /^grade:\s*[.\-–]?\s*$/i,
];

function val(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && !EMPTY_VALUE.test(t) ? t : null;
}

/** Non-empty, meaningful lines of a section. */
export function cleanLines(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const raw of text.replace(/\r/g, '').replace(/\[(add|type) here\]/gi, '').split('\n')) {
    const t = raw.replace(/\s*…\s*more$/i, '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (HEADING.test(t) || NOISE.some((re) => re.test(t))) continue;
    if (out.length && out[out.length - 1] === t) continue;
    out.push(t);
  }
  return out;
}

/** Paragraphs (blank-line separated) for long free text such as About. */
export function paragraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .replace(/\r/g, '')
    .replace(/\[(add|type) here\]/gi, '')
    .split(/\n\s*\n/)
    .map((p) => cleanLines(p).join('\n'))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s+)?\\d{4}`;
const RANGE_RE = new RegExp(`^(${DATE}\\s*[-–—]\\s*(?:Present|${DATE}))(?:\\s*·\\s*(.+))?$`, 'i');
const SINGLE_DATE_RE = new RegExp(`^(?:Issued\\s+)?(${DATE})(?:\\s*·\\s*(.+))?$`, 'i');
const ISSUED_BY_RE = new RegExp(`^Issued by (.+?) · (${DATE})$`, 'i');
const DURATION_RE = /^(\d+\s+yrs?(\s+\d+\s+mos?)?|\d+\s+mos?|less than a year)$/i;
const EMP_TYPE_RE =
  /^((permanent|fixed-term|seasonal)\s+)?(full-time|part-time|self-employed|freelance|contract|contractor|internship|apprenticeship|seasonal|permanent|temporary|volunteer)$/i;
const SKILLS_LINE_RE = /(\band \+\d+ skills?$)|^skills?:\s/i;
const WORK_MODE_RE = /\s·\s(hybrid|remote|on-site)$/i;
const DEGREE_RE =
  /\b(bachelor|master|mba|ph\.?d|doctor|diploma|degree|certificate|associate|b\.?sc|m\.?sc|b\.?a\b|m\.?a\b|b\.?s\b|m\.?s\b|bs\b|ms\b|ba\b|ma\b|bba|llb|llm|md\b|high school|a levels?|o levels?|matric|intermediate)\b/i;
const PROFICIENCY_RE = /(proficiency|native|bilingual|fluent|elementary|limited working|full professional)/i;

function isLocationLine(t: string | undefined): boolean {
  if (!t || t.length > 90) return false;
  if (WORK_MODE_RE.test(t) || /^(remote|hybrid|on-site|online)$/i.test(t)) return true;
  return /,/.test(t) && !/[.!?:]$/.test(t) && t.split(/\s+/).length <= 8 && !/\d{4}/.test(t) && !/^associated with/i.test(t);
}

function companyLine(t: string | undefined): { company: string; type: string } | null {
  if (!t) return null;
  const i = t.lastIndexOf(' · ');
  if (i <= 0) return null;
  const type = t.slice(i + 3).trim();
  return EMP_TYPE_RE.test(type) ? { company: t.slice(0, i).trim(), type } : null;
}

// ---------------------------------------------------------------------------
// Section parsers
// ---------------------------------------------------------------------------
export function parseExperience(text: string | null | undefined): ExperienceEntry[] {
  const L = cleanLines(text);
  const dates = L.map((t, i) => (RANGE_RE.test(t) ? i : -1)).filter((i) => i >= 0);
  if (!dates.length) return [];

  type Head = ExperienceEntry & { start: number; date: number; bodyFrom: number };
  const heads: Head[] = [];
  let group: { company: string; duration: string } | null = null;
  dates.forEach((d, k) => {
    const floor = k > 0 ? dates[k - 1] + 1 : 0; // header lines cannot reach into the previous entry's date line
    const prevEnd = k > 0 ? heads[k - 1].bodyFrom : 0;
    const lo = Math.max(floor, prevEnd);
    const h1 = d - 1 >= lo ? L[d - 1] : undefined;
    let title = '';
    let company: string | null = null;
    let type: string | null = null;
    let start = d;
    const cl = companyLine(h1);
    if (h1 && cl) {
      company = cl.company;
      type = cl.type;
      title = d - 2 >= lo ? L[d - 2] : company;
      start = d - 2 >= lo ? d - 2 : d - 1;
      group = null;
    } else if (h1 && EMP_TYPE_RE.test(h1)) {
      type = h1;
      title = d - 2 >= lo ? L[d - 2] : '';
      start = d - 2 >= lo ? d - 2 : d - 1;
    } else if (h1) {
      if (group || d - 2 < lo) {
        title = h1;
        start = d - 1;
      } else {
        title = L[d - 2];
        company = h1;
        start = d - 2;
      }
    }
    // A company with several roles: "Company / 10 yrs 10 mos" above the first role.
    let groupDuration: string | null = null;
    if (start - 2 >= lo && DURATION_RE.test(L[start - 1]) && !RANGE_RE.test(L[start - 2])) {
      group = { company: L[start - 2], duration: L[start - 1] };
      groupDuration = group.duration;
      start -= 2;
    }
    if (!company && group) company = group.company;
    const m = L[d].match(RANGE_RE);
    let bodyFrom = d + 1;
    let location: string | null = null;
    if (isLocationLine(L[bodyFrom])) {
      location = L[bodyFrom];
      bodyFrom += 1;
    }
    heads.push({
      title: title || company || 'Role', company, employmentType: type,
      dates: m ? m[1].replace(/\s*[-–—]\s*/, ' – ') : L[d], duration: m && m[2] ? m[2] : null,
      location, description: [], skills: null, groupDuration, start, date: d, bodyFrom,
    });
  });
  heads.forEach((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].start : L.length;
    for (const line of L.slice(h.bodyFrom, Math.max(h.bodyFrom, end))) {
      if (SKILLS_LINE_RE.test(line)) h.skills = line.replace(/^skills?:\s*/i, '');
      else h.description.push(line);
    }
  });
  return heads.map(({ start: _s, date: _d, bodyFrom: _b, ...e }) => e);
}

export function parseEducation(text: string | null | undefined): EducationEntry[] {
  const L = cleanLines(text);
  const dates = L.map((t, i) => (RANGE_RE.test(t) || /^\d{4}$/.test(t) ? i : -1)).filter((i) => i >= 0);
  if (!dates.length) {
    return L.length ? [{ school: L[0], degree: L[1] ?? null, dates: null, details: L.slice(2) }] : [];
  }
  type Head = EducationEntry & { start: number; bodyFrom: number };
  const heads: Head[] = [];
  dates.forEach((d, k) => {
    const lo = k > 0 ? heads[k - 1].bodyFrom : 0;
    const h1 = d - 1 >= lo ? L[d - 1] : undefined;
    let school = h1 ?? 'School';
    let degree: string | null = null;
    let start = d - 1 >= lo ? d - 1 : d;
    if (h1 && d - 2 >= lo && (DEGREE_RE.test(h1) || h1.includes(','))) {
      school = L[d - 2];
      degree = h1;
      start = d - 2;
    }
    heads.push({ school, degree, dates: L[d].replace(/\s*[-–—]\s*/, ' – '), details: [], start, bodyFrom: d + 1 });
  });
  heads.forEach((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].start : L.length;
    h.details = L.slice(h.bodyFrom, Math.max(h.bodyFrom, end)).filter((l) => !SKILLS_LINE_RE.test(l));
  });
  return heads.map(({ start: _s, bodyFrom: _b, ...e }) => e);
}

export function parseCertifications(text: string | null | undefined): CertificationEntry[] {
  const L = cleanLines(text);
  const anchors = L.map((t, i) => (/^issued\b/i.test(t) ? i : -1)).filter((i) => i >= 0);
  if (!anchors.length) return L.filter((l) => !/^credential id/i.test(l)).map((name) => ({ name, issuer: null, issued: null, credentialId: null }));
  const out: CertificationEntry[] = [];
  let lo = 0;
  anchors.forEach((d) => {
    const hasIssuer = d - 2 >= lo;
    const name = hasIssuer ? L[d - 2] : L[d - 1] ?? 'Certificate';
    const issuer = hasIssuer ? L[d - 1] : null;
    let credentialId: string | null = null;
    let next = d + 1;
    const cm = L[next]?.match(/^credential id\s*(.*)$/i);
    if (cm) {
      credentialId = cm[1] && !/^n\/?a$/i.test(cm[1].trim()) ? cm[1].trim() : null;
      next += 1;
    }
    while (next < L.length && SKILLS_LINE_RE.test(L[next])) next += 1;
    out.push({ name, issuer, issued: L[d].replace(/^issued\s+/i, ''), credentialId });
    lo = next;
  });
  return out;
}

export function parseLanguages(text: string | null | undefined): LanguageEntry[] {
  const out: LanguageEntry[] = [];
  for (const t of cleanLines(text)) {
    if (PROFICIENCY_RE.test(t) && out.length && !out[out.length - 1].level) out[out.length - 1].level = t;
    else if (!PROFICIENCY_RE.test(t)) out.push({ name: t, level: null });
  }
  return out;
}

export function parseSkills(text: string | null | undefined, roleTitles: string[] = []): string[] {
  const roles = roleTitles.map((r) => r.toLowerCase());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of cleanLines(text)) {
    for (const part of line.split(/\s+•\s+/)) {
      const t = part.trim();
      if (!t || t.length > 80) continue;
      // "Executive Director at Ontario Digital Academy" = where the skill was used, not a skill
      const at = t.match(/^(.+?) at (.+)$/i);
      if (at && (roles.includes(at[1].toLowerCase()) || /[A-Z]/.test(at[2][0]))) continue;
      if (/^\d+\s+(experiences?|educations?|licenses?)/i.test(t) || /endorse|skill assessment|experiences? (at|across)/i.test(t)) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/** Projects, honors, publications: a title line, then a date line, then text. */
function parseDated(text: string | null | undefined, opts: { subtitle?: boolean } = {}): DatedEntry[] {
  const L = cleanLines(text);
  const isDate = (t: string) => RANGE_RE.test(t) || SINGLE_DATE_RE.test(t) || ISSUED_BY_RE.test(t);
  const anchors = L.map((t, i) => (isDate(t) ? i : -1)).filter((i) => i >= 0);
  if (!anchors.length) return L.length ? [{ title: L[0], subtitle: null, dates: null, associated: null, description: L.slice(1) }] : [];
  type Head = DatedEntry & { start: number; bodyFrom: number };
  const heads: Head[] = [];
  anchors.forEach((d, k) => {
    const lo = k > 0 ? heads[k - 1].bodyFrom : 0;
    let title = d - 1 >= lo ? L[d - 1] : 'Untitled';
    let subtitle: string | null = null;
    let start = d - 1 >= lo ? d - 1 : d;
    if (opts.subtitle && d - 2 >= lo) {
      title = L[d - 2];
      subtitle = L[d - 1];
      start = d - 2;
    }
    const ib = L[d].match(ISSUED_BY_RE);
    const rg = L[d].match(RANGE_RE);
    const sg = L[d].match(SINGLE_DATE_RE);
    const dates = ib ? ib[2] : rg ? rg[1].replace(/\s*[-–—]\s*/, ' – ') + (rg[2] ? ` · ${rg[2]}` : '') : sg ? sg[1] : L[d];
    if (ib) subtitle = ib[1];
    heads.push({ title, subtitle, dates, associated: null, description: [], start, bodyFrom: d + 1 });
  });
  heads.forEach((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].start : L.length;
    for (const line of L.slice(h.bodyFrom, Math.max(h.bodyFrom, end))) {
      const a = line.match(/^associated with (.+)$/i);
      if (a) h.associated = a[1];
      else if (!SKILLS_LINE_RE.test(line)) h.description.push(line);
    }
  });
  return heads.map(({ start: _s, bodyFrom: _b, ...e }) => e);
}
export const parseProjects = (t: string | null | undefined) => parseDated(t);
export const parseHonors = (t: string | null | undefined) => parseDated(t);
export const parsePublications = (t: string | null | undefined) => parseDated(t);
export const parseVolunteering = (t: string | null | undefined) => {
  // Role / Organisation / dates / cause
  return parseDated(t, { subtitle: true }).map((e) => {
    const cause = e.description[0];
    if (cause && cause.length <= 40 && !/[.!?]$/.test(cause)) {
      return { ...e, dates: e.dates ? `${e.dates} · ${cause}` : cause, description: e.description.slice(1) };
    }
    return e;
  });
};
export function parseCourses(text: string | null | undefined): string[] {
  return cleanLines(text).filter((l) => !/^associated with/i.test(l) && !/^course number/i.test(l));
}

// ---------------------------------------------------------------------------
// Older leads: the Google Doc text
// ---------------------------------------------------------------------------
const LEGACY_LEFT = ['Contact', 'Top Skills', 'Languages', 'Certifications', 'Courses', 'Honors & Awards', 'Publications'];
const LEGACY_RIGHT = ['Summary', 'Experience', 'Education', 'Projects', 'Volunteering'];
const LEGACY_KEY: Record<string, keyof ProfileSections> = {
  'Top Skills': 'skills', Languages: 'languages', Certifications: 'certifications', Courses: 'courses',
  'Honors & Awards': 'honors', Publications: 'publications', Summary: 'about', Experience: 'experience',
  Education: 'education', Projects: 'projects', Volunteering: 'volunteering',
};

/** Splits the Drive/Google Doc text of an older lead into sections (fullest copy only). */
export function sectionsFromLegacyText(text: string): ProfileSections | null {
  const lines = text.replace(/\r/g, '').split('\n');
  const starts = lines.map((l, i) => (l.trim() === 'Contact' ? i : -1)).filter((i) => i >= 0);
  if (!starts.length) return null;
  const copies = starts.map((s, k) => lines.slice(s, k + 1 < starts.length ? starts[k + 1] : lines.length));
  const fullness = (c: string[]) => c.filter((l) => l.trim() && !/^\[(add|type) here\]$/i.test(l.trim())).join('').length;
  const copy = copies.reduce((best, c) => (fullness(c) > fullness(best) ? c : best));

  const s: ProfileSections = {};
  const nameAt = copy.findIndex((l) => /^\t\S/.test(l));
  let current: string | null = null;
  const buf: Record<string, string[]> = {};
  copy.forEach((line, i) => {
    const t = line.trim();
    if (i === nameAt) {
      s.name = t;
      s.headline = copy[i + 1]?.trim() || undefined;
      s.location = copy[i + 2]?.trim() || undefined;
      current = null;
      return;
    }
    if (nameAt >= 0 && (i === nameAt + 1 || i === nameAt + 2)) return;
    const isLeft = LEGACY_LEFT.includes(t) && (nameAt < 0 || i < nameAt);
    const isRight = LEGACY_RIGHT.includes(t) && (nameAt < 0 || i > nameAt) && current !== t;
    if (isLeft || isRight) {
      current = t;
      buf[t] = buf[t] ?? [];
      return;
    }
    if (current) buf[current].push(line);
  });

  const contact = (buf.Contact ?? []).map((l) => l.trim()).filter(Boolean);
  contact.forEach((l, i) => {
    const next = contact[i + 1] ?? '';
    if (/^\(mobile\)$|^\(work\)$|^\(home\)$/i.test(next) && !s.phone) s.phone = l;
    else if (/^\(linkedin\)$/i.test(next)) s.linkedin_url = l;
    else if (/^\(company\)$/i.test(next)) {
      const m = l.match(/^(.*?)\s*\(([^)]+)\)$/);
      s.company = (m ? m[1] : l).trim();
      if (m && !/plus\.google|linkedin/i.test(m[2])) s.website = m[2].trim();
    } else if (/^\S+@\S+\.\S+$/.test(l)) s.email = l;
  });
  for (const [heading, key] of Object.entries(LEGACY_KEY)) {
    const body = (buf[heading] ?? []).join('\n');
    if (body.trim()) (s as Record<string, string>)[key] = body;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Lead -> Profile
// ---------------------------------------------------------------------------
function sectionsOf(lead: Lead): { s: ProfileSections; source: Profile['source'] } {
  const raw = (lead as Lead & { profile_sections?: unknown }).profile_sections;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { s: raw as ProfileSections, source: 'sections' };
  if (lead.profile_text) {
    const legacy = sectionsFromLegacyText(lead.profile_text);
    if (legacy) return { s: legacy, source: 'legacy' };
  }
  return { s: {}, source: 'basic' };
}

export function profileFromLead(lead: Lead): Profile {
  const { s, source } = sectionsOf(lead);
  const email = val(s.email) ?? (lead.email && !/@no-email-linkedin\.com$/i.test(lead.email) ? val(lead.email) : null);
  const location = val(s.location) ?? val(lead.location);
  const parts = (location ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const experience = parseExperience(s.experience);
  const text = {
    about: s.about ?? '', experience: s.experience ?? '', education: s.education ?? '', skills: s.skills ?? '',
    languages: s.languages ?? '', certifications: s.certifications ?? '', courses: s.courses ?? '',
    projects: s.projects ?? '', volunteering: s.volunteering ?? '', honors: s.honors ?? '', publications: s.publications ?? '',
  };
  return {
    source,
    name: val(lead.full_name) ?? val(s.name) ?? 'Unknown',
    headline: val(s.headline) ?? val(lead.title),
    location,
    city: val(s.city) ?? (parts.length > 1 ? parts[0] : null),
    country: val(s.country) ?? (parts.length > 1 ? parts[parts.length - 1] : null),
    email,
    phone: val(s.phone) ?? val(lead.phone),
    website: val(s.website) ?? traitString(lead.traits, 'website') ?? traitString(lead.traits, 'company_website'),
    company: val(s.company) ?? val(lead.company),
    linkedinUrl: val(lead.linkedin_url) ?? val(s.linkedin_url),
    university: traitString(lead.traits, 'university') ?? val(s.university),
    department: traitString(lead.traits, 'department_subject') ?? val(s.department),
    about: paragraphs(s.about),
    experience,
    education: parseEducation(s.education),
    skills: parseSkills(s.skills, experience.map((e) => e.title)),
    languages: parseLanguages(s.languages),
    certifications: parseCertifications(s.certifications),
    courses: parseCourses(s.courses),
    projects: parseProjects(s.projects),
    volunteering: parseVolunteering(s.volunteering),
    honors: parseHonors(s.honors),
    publications: parsePublications(s.publications),
    text,
  };
}

export function initials(name: string): string {
  const p = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

export function hrefFor(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
