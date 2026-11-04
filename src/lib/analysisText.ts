/**
 * GIVE A PROFILING WRITE-UP VISIBLE STRUCTURE
 * ===========================================
 * `detailed_response` comes from whatever prompt the client runs, and models
 * often write section titles as plain lines or as items of a numbered list
 * ("1. Executive summary", "2. Observable profile facts:") instead of Markdown
 * headings. Rendered as written, those titles look exactly like the body text.
 *
 * This turns such lines into real headings before rendering, for any prompt:
 * - the first line, when it is a short title ("LinkedIn Relationship Analysis: Name") → title
 * - "1. Short title" / "1. Short title:" with content under it → section heading (number kept)
 * - a line that is only bold ("**Leverage analysis**") or a short "Label:" alone → sub-heading
 * - "Label: value" at the start of a line or list item → the label in bold
 * Sentences ("… .") and questions ("…?") are never turned into headings, so real
 * numbered lists (discovery questions, steps) stay lists. Text inside code fences is left alone.
 */

const NUM_ITEM = /^(\s*)(\d{1,2})[.)]\s+(.+?)\s*$/;
const LIST_START = /^([-*+]|\d{1,2}[.)])\s/;

function plain(text: string): string {
  return text.replace(/\*\*/g, '').replace(/__/g, '').trim();
}

/** Short, title-like: no closing full stop / question mark, at most 10 words. */
function titleLike(text: string, maxLen = 80): boolean {
  const s = plain(text).replace(/:$/, '').trim();
  if (s.length < 2 || s.length > maxLen) return false;
  if (/[.?!;,]$/.test(s)) return false;
  return s.split(/\s+/).length <= 10;
}

export function structureAnalysis(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;
  let dedent = 0; // content indent of a numbered item we turned into a heading
  let sawContent = false;

  const nextContent = (from: number): string | null => {
    for (let j = from + 1; j < lines.length; j += 1) if (lines[j].trim()) return lines[j];
    return null;
  };
  const heading = (level: number, text: string) => {
    if (out.length && out[out.length - 1].trim()) out.push('');
    out.push(`${'#'.repeat(level)} ${text}`);
    out.push('');
  };

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    // Body text indented under a numbered title we made a heading: bring it back to the margin,
    // so it is not read as part of a list (or, at 4+ spaces, as a code block).
    if (dedent && line.trim()) {
      const indent = (line.match(/^\s*/) ?? [''])[0].length;
      if (indent >= dedent) line = line.slice(dedent);
      else dedent = 0;
    }

    const t = line.trim();
    if (!t) {
      out.push(line);
      continue;
    }

    if (/^#{1,6}\s/.test(t) || /^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      sawContent = true;
      out.push(line);
      continue;
    }

    // The very first line, when it reads as a title
    if (!sawContent) {
      sawContent = true;
      if (!LIST_START.test(t) && titleLike(t, 100) && nextContent(i) !== null) {
        heading(2, plain(t).replace(/:$/, ''));
        continue;
      }
    }

    // "1. Executive summary" / "2. Observable profile facts:" with content under it
    const m = line.match(NUM_ITEM);
    if (m && m[1].length <= 1 && titleLike(m[3])) {
      const next = nextContent(i);
      const nm = next ? next.match(NUM_ITEM) : null;
      const endsWithColon = /:$/.test(plain(m[3]));
      // content under it: anything but a sibling item. A list that restarts at 1 under it, or
      // sentences/questions under a short title, are its content too ("7. Best questions" → "1. What…?").
      const sibling = !!nm && nm[1].length === m[1].length && Number(nm[2]) > Number(m[2]) && titleLike(nm[3]);
      const hasBody = next !== null && !sibling;
      if (endsWithColon || hasBody) {
        heading(3, `${m[2]}. ${plain(m[3]).replace(/:$/, '')}`);
        dedent = m[1].length + m[2].length + 2;
        continue;
      }
    }

    // A line that is only bold, or a short "Label:" on its own
    const bold = t.match(/^\*\*([^*]{2,80})\*\*:?$/);
    if (bold && titleLike(bold[1])) {
      heading(4, bold[1].replace(/:$/, '').trim());
      continue;
    }
    if (!LIST_START.test(t) && /:$/.test(t) && titleLike(t, 60)) {
      heading(4, plain(t).replace(/:$/, ''));
      continue;
    }

    // "Label: value" → bold label (also inside a list item)
    line = line.replace(
      /^(\s*(?:[-*+]\s+|\d{1,2}[.)]\s+)?)([A-Z][A-Za-z0-9 /&()'’-]{1,40}):[ \t]+(?=\S)/,
      (_all, pre: string, label: string) => `${pre}**${label.trim()}:** `,
    );
    // One fact per line, as models write them: keep the line break (Markdown would join the lines)
    const next = lines[i + 1];
    if (next !== undefined && next.trim() && !LIST_START.test(t) && !LIST_START.test(next.trim()) && !/^#{1,6}\s/.test(next.trim())) {
      line = line.replace(/\s*$/, '') + '  ';
    }
    out.push(line);
  }
  return out.join('\n');
}
