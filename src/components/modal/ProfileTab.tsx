import { useState } from 'react';
import { traitString } from '../../lib/traitsRegistry';
import type { Lead } from '../../lib/types';
import { NotCaptured } from '../ui';

/** First non-empty trait among several possible key spellings. */
function firstTrait(lead: Lead, keys: string[]): string | null {
  for (const key of keys) {
    const value = traitString(lead.traits, key);
    if (value) return value;
  }
  return null;
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="label">{label}</p>
      <div className="mt-1">
        {value ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="break-words text-sm text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              {value}
            </a>
          ) : (
            <p className="break-words text-sm text-slate-800">{value}</p>
          )
        ) : (
          // Rendered rather than hidden, so the user knows the field exists.
          <NotCaptured />
        )}
      </div>
    </div>
  );
}

export function ProfileTab({ lead }: { lead: Lead }) {
  const [expanded, setExpanded] = useState(false);

  const website = firstTrait(lead, ['website', 'company_website', 'company_url', 'organisation_website']);
  const university = traitString(lead.traits, 'university');
  const department = traitString(lead.traits, 'department_subject');
  const jobTitle = traitString(lead.traits, 'linkedin_job_title');
  const experience = traitString(lead.traits, 'linkedin_experience');

  const profileText = lead.profile_text?.trim() ?? '';
  const isLong = profileText.length > 700;
  const shown = expanded || !isLong ? profileText : `${profileText.slice(0, 700)}…`;

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Contact information</h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Email"
            value={lead.email?.trim() || null}
            href={lead.email?.trim() ? `mailto:${lead.email.trim()}` : null}
          />
          <Field
            label="Phone"
            value={lead.phone?.trim() || null}
            href={lead.phone?.trim() ? `tel:${lead.phone.replace(/\s+/g, '')}` : null}
          />
          <Field
            label="LinkedIn"
            value={lead.linkedin_url?.trim() || null}
            href={lead.linkedin_url?.trim() || null}
          />
          <Field
            label="Website"
            value={website}
            href={website && /^https?:\/\//i.test(website) ? website : null}
          />
          <Field label="Location" value={lead.location?.trim() || null} />
          <Field label="Company" value={lead.company?.trim() || null} />
          <Field label="University" value={university} />
          <Field label="Department or subject" value={department} />
          <Field label="Job title" value={jobTitle ?? lead.title?.trim() ?? null} />
        </div>
      </section>

      {experience ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Experience</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
            {experience}
          </p>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Raw profile text</h3>
          {isLong ? (
            <button type="button" className="btn-ghost text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          ) : null}
        </div>
        {profileText ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-700">
              {shown}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No profile text was captured for this lead, so the profiling step had nothing to read.
          </p>
        )}
      </section>
    </div>
  );
}
