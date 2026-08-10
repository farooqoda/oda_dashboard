import { fitScore, odaBucket, personalityType } from './traitsRegistry';
import { stageOf } from './format';
import type { Lead } from './types';

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS: Array<{ header: string; get: (lead: Lead) => unknown }> = [
  { header: 'id', get: (l) => l.id },
  { header: 'full_name', get: (l) => l.full_name },
  { header: 'title', get: (l) => l.title },
  { header: 'company', get: (l) => l.company },
  { header: 'email', get: (l) => l.email },
  { header: 'phone', get: (l) => l.phone },
  { header: 'location', get: (l) => l.location },
  { header: 'linkedin_url', get: (l) => l.linkedin_url },
  { header: 'oda_bucket', get: (l) => odaBucket(l.traits) },
  { header: 'fit_score', get: (l) => fitScore(l.traits) },
  { header: 'personality_type', get: (l) => personalityType(l.traits) },
  { header: 'stage', get: (l) => stageOf(l) },
  { header: 'connection_status', get: (l) => l.connection_status },
  { header: 'review_status', get: (l) => l.review_status },
  { header: 'invite_message', get: (l) => l.invite_message },
  { header: 'created_at', get: (l) => l.created_at },
];

/** CSV of the rows currently on screen, flattening the traits we have columns for. */
export function leadsToCsv(leads: Lead[]): string {
  const header = COLUMNS.map((c) => c.header).join(',');
  const rows = leads.map((lead) =>
    COLUMNS.map((c) => escapeCell(c.get(lead))).join(','),
  );
  return [header, ...rows].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // Prepend a BOM so Excel reads UTF-8 names correctly.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
