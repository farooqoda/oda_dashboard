import { useMemo, useState } from 'react';
import { hrefFor, initials, profileFromLead } from '../../lib/profile';
import type { DatedEntry, ExperienceEntry, Profile } from '../../lib/profile';
import type { Lead } from '../../lib/types';

/* LinkedIn-like look: warm grey page, white cards, LinkedIn blue for links. */
const CARD = 'rounded-lg border border-[#e0dfdc] bg-white';
const MUTED = 'text-[rgba(0,0,0,0.6)]';
const LOGO_TONES = ['#0a66c2', '#057642', '#915907', '#8f5849', '#5f4b8b', '#0e7490', '#b24020', '#44712e'];

function tone(text: string): string {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LOGO_TONES[h % LOGO_TONES.length];
}

function Logo({ label }: { label: string | null }) {
  const text = label || '?';
  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded text-base font-semibold text-white"
      style={{ background: tone(text) }}
    >
      {initials(text).slice(0, 2)}
    </span>
  );
}

/** Long text clamped like LinkedIn's "…see more". */
function Clamped({ lines, max = 3 }: { lines: string[]; max?: number }) {
  const [open, setOpen] = useState(false);
  if (!lines.length) return null;
  const long = lines.length > max || lines.join(' ').length > 320;
  const shown = open || !long ? lines : lines.slice(0, max);
  return (
    <div className="mt-2 text-sm leading-relaxed text-[rgba(0,0,0,0.9)]">
      <div className={open || !long ? '' : 'line-clamp-3'}>
        {shown.map((l, i) => (
          <p key={i} className="whitespace-pre-wrap break-words [&:not(:first-child)]:mt-1.5">
            {l}
          </p>
        ))}
      </div>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`mt-1 text-sm font-semibold ${MUTED} hover:text-[#0a66c2] hover:underline`}
        >
          {open ? 'Show less' : '…see more'}
        </button>
      ) : null}
    </div>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={`${CARD} px-5 py-4`}>
      <h3 className="text-xl font-semibold text-[rgba(0,0,0,0.9)]">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Rows<T>({ items, render }: { items: T[]; render: (item: T, i: number) => React.ReactNode }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 border-t border-[#e8e8e8] py-3 first:border-t-0 first:pt-1">
          {render(item, i)}
        </li>
      ))}
    </ul>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className={`text-sm ${MUTED}`}>{children}</p>;
}

/** Consecutive roles at the same company are shown under one company heading, like LinkedIn. */
function groupExperience(entries: ExperienceEntry[]) {
  const groups: { company: string | null; total: string | null; roles: ExperienceEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && e.company && last.company === e.company && (last.total || e.groupDuration)) last.roles.push(e);
    else groups.push({ company: e.company, total: e.groupDuration, roles: [e] });
  }
  return groups;
}

function ExperienceSection({ entries }: { entries: ExperienceEntry[] }) {
  const groups = groupExperience(entries);
  return (
    <Section title="Experience">
      <Rows
        items={groups}
        render={(g) =>
          g.roles.length > 1 ? (
            <>
              <Logo label={g.company} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[rgba(0,0,0,0.9)]">{g.company}</p>
                {g.total ? <Meta>{g.total}</Meta> : null}
                <ol className="mt-2 space-y-4 border-l-2 border-[#e0dfdc] pl-4">
                  {g.roles.map((r, i) => (
                    <li key={i}>
                      <p className="font-semibold text-[rgba(0,0,0,0.9)]">{r.title}</p>
                      {r.employmentType ? <p className="text-sm text-[rgba(0,0,0,0.9)]">{r.employmentType}</p> : null}
                      <Meta>{[r.dates, r.duration].filter(Boolean).join(' · ')}</Meta>
                      <Meta>{r.location}</Meta>
                      <Clamped lines={r.description} />
                      {r.skills ? <p className="mt-2 text-sm font-semibold text-[rgba(0,0,0,0.9)]">◆ {r.skills}</p> : null}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : (
            <>
              <Logo label={g.roles[0].company ?? g.roles[0].title} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[rgba(0,0,0,0.9)]">{g.roles[0].title}</p>
                <p className="text-sm text-[rgba(0,0,0,0.9)]">
                  {[g.roles[0].company, g.roles[0].employmentType].filter(Boolean).join(' · ')}
                </p>
                <Meta>{[g.roles[0].dates, g.roles[0].duration].filter(Boolean).join(' · ')}</Meta>
                <Meta>{g.roles[0].location}</Meta>
                <Clamped lines={g.roles[0].description} />
                {g.roles[0].skills ? (
                  <p className="mt-2 text-sm font-semibold text-[rgba(0,0,0,0.9)]">◆ {g.roles[0].skills}</p>
                ) : null}
              </div>
            </>
          )
        }
      />
    </Section>
  );
}

function DatedSection({ title, entries, logo = true }: { title: string; entries: DatedEntry[]; logo?: boolean }) {
  if (!entries.length) return null;
  return (
    <Section title={title}>
      <Rows
        items={entries}
        render={(e) => (
          <>
            {logo ? <Logo label={e.subtitle ?? e.associated ?? e.title} /> : null}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[rgba(0,0,0,0.9)]">{e.title}</p>
              {e.subtitle ? <p className="text-sm text-[rgba(0,0,0,0.9)]">{e.subtitle}</p> : null}
              <Meta>{e.dates}</Meta>
              {e.associated ? <Meta>Associated with {e.associated}</Meta> : null}
              <Clamped lines={e.description} />
            </div>
          </>
        )}
      />
    </Section>
  );
}

function ContactCard({ p }: { p: Profile }) {
  const rows = [
    { label: 'LinkedIn', value: p.linkedinUrl?.replace(/^https?:\/\/(www\.)?/, ''), href: p.linkedinUrl },
    { label: 'Email', value: p.email, href: p.email ? `mailto:${p.email}` : null },
    { label: 'Phone', value: p.phone, href: p.phone ? `tel:${p.phone.replace(/\s+/g, '')}` : null },
    { label: 'Website', value: p.website, href: hrefFor(p.website) },
  ];
  return (
    <section id="gab-contact-info" className={`${CARD} px-4 py-4`}>
      <h3 className="text-base font-semibold text-[rgba(0,0,0,0.9)]">Contact info</h3>
      <dl className="mt-2 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <dt className="text-xs font-semibold text-[rgba(0,0,0,0.9)]">{r.label}</dt>
            <dd className="break-words text-sm">
              {r.value ? (
                r.href ? (
                  <a href={r.href} target="_blank" rel="noreferrer noopener" className="font-semibold text-[#0a66c2] hover:underline">
                    {r.value}
                  </a>
                ) : (
                  r.value
                )
              ) : (
                <span className={`italic ${MUTED}`}>Not captured</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ProfileTab({ lead }: { lead: Lead }) {
  const p = useMemo(() => profileFromLead(lead), [lead]);
  const [showRaw, setShowRaw] = useState(false);
  const [pdfState, setPdfState] = useState<'idle' | 'working' | 'error'>('idle');
  const school = p.education[0]?.school ?? null;
  const currentCompany = p.experience[0]?.company ?? p.company;

  const downloadPdf = async () => {
    setPdfState('working');
    try {
      const { downloadProfilePdf } = await import('../../lib/profilePdf');
      await downloadProfilePdf(p);
      setPdfState('idle');
    } catch (err) {
      console.error('PDF failed', err);
      setPdfState('error');
    }
  };

  const nothing =
    !p.about.length && !p.experience.length && !p.education.length && !p.skills.length && !p.text.experience;

  return (
    <div className="-mx-5 -my-6 bg-[#f4f2ee] px-3 py-4 sm:-mx-6 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={() => void downloadPdf()} disabled={pdfState === 'working'}>
          {pdfState === 'working' ? 'Making PDF…' : '⬇ Download PDF'}
        </button>
        {pdfState === 'error' ? <span className="text-sm text-critical">Could not make the PDF. Try again.</span> : null}
        {p.source === 'legacy' ? (
          <span className={`text-xs ${MUTED}`}>
            Rebuilt from this lead's older Google Doc text. Sync the profile again on LinkedIn for the cleanest version.
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-3">
          {/* Top card */}
          <section className={`${CARD} overflow-hidden`}>
            <div className="h-24 bg-gradient-to-r from-[#a0b4b7] via-[#b9c7cb] to-[#dbe2e4]" />
            <div className="px-5 pb-5">
              <span
                aria-hidden="true"
                className="-mt-14 flex h-28 w-28 items-center justify-center rounded-full border-4 border-white bg-[#5e7b8a] text-3xl font-semibold text-white"
              >
                {initials(p.name)}
              </span>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-2xl font-semibold text-[rgba(0,0,0,0.9)]">{p.name}</h3>
                  {p.headline ? <p className="mt-0.5 text-base text-[rgba(0,0,0,0.9)]">{p.headline}</p> : null}
                  <p className={`mt-1 text-sm ${MUTED}`}>
                    {p.location ? `${p.location} · ` : ''}
                    <a href="#gab-contact-info" className="font-semibold text-[#0a66c2] hover:underline">
                      Contact info
                    </a>
                  </p>
                  {p.linkedinUrl ? (
                    <a
                      href={p.linkedinUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-3 inline-flex rounded-full border border-[#0a66c2] px-4 py-1 text-sm font-semibold text-[#0a66c2] hover:bg-[#ebf4fd]"
                    >
                      View on LinkedIn
                    </a>
                  ) : null}
                </div>
                <ul className="shrink-0 space-y-2 sm:max-w-[220px]">
                  {[currentCompany, school].filter(Boolean).map((label) => (
                    <li key={label} className="flex items-center gap-2 text-sm font-semibold text-[rgba(0,0,0,0.9)]">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[11px] font-semibold text-white"
                        style={{ background: tone(label as string) }}
                      >
                        {initials(label as string).slice(0, 2)}
                      </span>
                      <span className="line-clamp-2">{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {nothing ? (
            <section className={`${CARD} px-5 py-4 text-sm ${MUTED}`}>
              Only the basic details were captured for this lead. Open the profile on LinkedIn and press “Sync Full Lead”
              to get the full profile here.
            </section>
          ) : null}

          {p.about.length ? (
            <Section title="About">
              <Clamped lines={p.about} max={2} />
            </Section>
          ) : null}
          {p.experience.length ? (
            <ExperienceSection entries={p.experience} />
          ) : p.text.experience ? (
            <Section title="Experience">
              <Clamped lines={p.text.experience.split('\n').filter((l) => l.trim())} max={6} />
            </Section>
          ) : null}
          {p.education.length ? (
            <Section title="Education">
              <Rows
                items={p.education}
                render={(e) => (
                  <>
                    <Logo label={e.school} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[rgba(0,0,0,0.9)]">{e.school}</p>
                      {e.degree ? <p className="text-sm text-[rgba(0,0,0,0.9)]">{e.degree}</p> : null}
                      <Meta>{e.dates}</Meta>
                      <Clamped lines={e.details} />
                    </div>
                  </>
                )}
              />
            </Section>
          ) : null}
          {p.certifications.length ? (
            <Section title="Licenses & certifications">
              <Rows
                items={p.certifications}
                render={(c) => (
                  <>
                    <Logo label={c.issuer ?? c.name} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[rgba(0,0,0,0.9)]">{c.name}</p>
                      {c.issuer ? <p className="text-sm text-[rgba(0,0,0,0.9)]">{c.issuer}</p> : null}
                      <Meta>{c.issued ? `Issued ${c.issued}` : null}</Meta>
                      <Meta>{c.credentialId ? `Credential ID ${c.credentialId}` : null}</Meta>
                    </div>
                  </>
                )}
              />
            </Section>
          ) : null}
          <DatedSection title="Projects" entries={p.projects} logo={false} />
          <DatedSection title="Volunteering" entries={p.volunteering} />
          <DatedSection title="Honors & awards" entries={p.honors} logo={false} />
          <DatedSection title="Publications" entries={p.publications} logo={false} />
          {p.courses.length ? (
            <Section title="Courses">
              <Rows items={p.courses} render={(c) => <p className="text-sm font-semibold text-[rgba(0,0,0,0.9)]">{c}</p>} />
            </Section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-3">
          <ContactCard p={p} />
          <section className={`${CARD} px-4 py-4`}>
            <h3 className="text-base font-semibold text-[rgba(0,0,0,0.9)]">Lead details</h3>
            <dl className="mt-2 space-y-2 text-sm">
              {[
                ['Company', p.company],
                ['University', p.university],
                ['Department / subject', p.department],
                ['City', p.city],
                ['Country', p.country],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold text-[rgba(0,0,0,0.9)]">{k}</dt>
                  <dd className={v ? 'break-words' : `italic ${MUTED}`}>{v || 'Not captured'}</dd>
                </div>
              ))}
            </dl>
          </section>
          {p.skills.length ? (
            <section className={`${CARD} px-4 py-4`}>
              <h3 className="text-base font-semibold text-[rgba(0,0,0,0.9)]">Skills</h3>
              <ul className="mt-1">
                {p.skills.map((s) => (
                  <li key={s} className="border-t border-[#e8e8e8] py-2 text-sm font-semibold text-[rgba(0,0,0,0.9)] first:border-t-0">
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {p.languages.length ? (
            <section className={`${CARD} px-4 py-4`}>
              <h3 className="text-base font-semibold text-[rgba(0,0,0,0.9)]">Languages</h3>
              <ul className="mt-1">
                {p.languages.map((l) => (
                  <li key={l.name} className="border-t border-[#e8e8e8] py-2 first:border-t-0">
                    <p className="text-sm font-semibold text-[rgba(0,0,0,0.9)]">{l.name}</p>
                    {l.level ? <p className={`text-xs ${MUTED}`}>{l.level}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      {lead.profile_text?.trim() ? (
        <div className="mt-3">
          <button type="button" className={`text-xs font-semibold ${MUTED} hover:underline`} onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? 'Hide the scraped text' : 'Show the scraped text (what the AI read)'}
          </button>
          {showRaw ? (
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#e0dfdc] bg-white p-3 text-xs text-slate-700">
              {lead.profile_text}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
