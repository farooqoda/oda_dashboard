import { Fragment, type ReactNode } from 'react';

/**
 * A SMALL MARKDOWN RENDERER
 * =========================
 * `detailed_response` is written by whichever prompt the client is running, so
 * its shape is not ours to fix: one row is three bullet points, the next is
 * headed sections with bold labels. It has to render as markdown, and it has
 * to degrade to readable text when it is not markdown at all.
 *
 * This is deliberately hand-written rather than a dependency. The app carries
 * no UI libraries, the subset that matters here is small — headings, bold,
 * italics, inline code, bullet and numbered lists, links, quotes, rules — and
 * every node below is a React element. Nothing is ever handed to
 * `dangerouslySetInnerHTML`, so model-authored text cannot inject markup into
 * the dashboard no matter what the prompt returns.
 *
 * Anything it does not recognise falls through as plain text with its line
 * breaks intact, which is the same thing the old `whitespace-pre-wrap` display
 * did — so the worst case is no worse than before.
 */

// ---------------------------------------------------------------------------
// Inline spans
// ---------------------------------------------------------------------------

/** Only these schemes are ever put in an href. */
function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : null;
}

interface InlineRule {
  re: RegExp;
  node: (match: RegExpExecArray, key: string) => ReactNode;
}

/**
 * Order matters twice over: code first so markers inside it stay literal, and
 * bold before italics so `**x**` is not read as an empty italic.
 *
 * Two guards keep ordinary prose intact, both of them CommonMark's own rules.
 * Emphasis may not open or close against whitespace, so `3 * 4 * 5` stays
 * arithmetic rather than turning "4" italic; and `_` needs a non-word
 * character on each side, so `detailed_response` stays a key rather than
 * becoming "detailed" plus an italic.
 */
/** Content that neither starts nor ends with a space. */
const TIGHT = String.raw`\S|\S[^\n]*?\S`;
const INLINE_RULES: InlineRule[] = [
  {
    re: /`([^`\n]+)`/,
    node: (m, key) => (
      <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">
        {m[1]}
      </code>
    ),
  },
  {
    // The URL may carry one level of balanced parens — Wikipedia links do, and
    // stopping at the first ")" would leave the rest stranded in the prose.
    re: new RegExp(String.raw`\[([^\]\n]+)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)`),
    node: (m, key) => {
      const href = safeHref(m[2]);
      if (!href) return <Fragment key={key}>{m[1]}</Fragment>;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
        >
          {renderInline(m[1], `${key}-t`)}
        </a>
      );
    },
  },
  {
    re: new RegExp(String.raw`\*\*(${TIGHT})\*\*`),
    node: (m, key) => (
      <strong key={key} className="font-semibold text-slate-900">
        {renderInline(m[1], `${key}-b`)}
      </strong>
    ),
  },
  {
    re: new RegExp(String.raw`(?<![A-Za-z0-9_])__(${TIGHT})__(?![A-Za-z0-9_])`),
    node: (m, key) => (
      <strong key={key} className="font-semibold text-slate-900">
        {renderInline(m[1], `${key}-b`)}
      </strong>
    ),
  },
  {
    re: new RegExp(String.raw`\*(\S|\S[^*\n]*?\S)\*`),
    node: (m, key) => <em key={key}>{renderInline(m[1], `${key}-i`)}</em>,
  },
  {
    re: new RegExp(String.raw`(?<![A-Za-z0-9_])_(\S|\S[^_\n]*?\S)_(?![A-Za-z0-9_])`),
    node: (m, key) => <em key={key}>{renderInline(m[1], `${key}-i`)}</em>,
  },
];

/** Emphasis, code and links within one line of text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  if (!text) return [];

  let earliest: { index: number; rule: InlineRule; match: RegExpExecArray } | null = null;

  for (const rule of INLINE_RULES) {
    const match = rule.re.exec(text);
    if (!match) continue;
    // A tie goes to the rule listed first — bold before italics.
    if (!earliest || match.index < earliest.index) {
      earliest = { index: match.index, rule, match };
    }
  }

  if (!earliest) return [text];

  const { index, rule, match } = earliest;
  const before = text.slice(0, index);
  const after = text.slice(index + match[0].length);

  return [
    ...(before ? [before] : []),
    rule.node(match, `${keyPrefix}-n${index}`),
    ...renderInline(after, `${keyPrefix}-a${index}`),
  ];
}

/** One line, with its soft line break preserved. */
function renderLines(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, i) => [
    ...(i > 0 ? [<br key={`${keyPrefix}-br${i}`} />] : []),
    ...renderInline(line, `${keyPrefix}-l${i}`),
  ]);
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])\1{2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;

const HEADING_CLASS = [
  'mt-5 text-base font-semibold text-slate-900 first:mt-0',
  'mt-5 text-sm font-semibold text-slate-900 first:mt-0',
  'mt-4 text-sm font-semibold text-slate-900 first:mt-0',
  'mt-4 text-sm font-semibold text-slate-800 first:mt-0',
  'mt-3 text-xs font-semibold uppercase tracking-wide text-slate-600 first:mt-0',
  'mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 first:mt-0',
];

interface ListItem {
  indent: number;
  lines: string[];
}

/** Items at this level, with anything more indented nested underneath. */
function renderListItems(items: ListItem[], ordered: boolean, keyPrefix: string): ReactNode {
  const base = items[0].indent;
  const blocks: ReactNode[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const children: ListItem[] = [];
    while (i + 1 < items.length && items[i + 1].indent > base) {
      children.push(items[i + 1]);
      i += 1;
    }

    blocks.push(
      <li key={`${keyPrefix}-i${blocks.length}`} className="leading-relaxed">
        {renderLines(item.lines, `${keyPrefix}-i${blocks.length}`)}
        {children.length > 0 ? (
          <div className="mt-1">{renderListItems(children, ordered, `${keyPrefix}-i${blocks.length}-c`)}</div>
        ) : null}
      </li>,
    );
  }

  const className = ordered
    ? 'list-decimal space-y-1 pl-5 marker:text-slate-400'
    : 'list-disc space-y-1 pl-5 marker:text-slate-400';

  return ordered ? (
    <ol className={className}>{blocks}</ol>
  ) : (
    <ul className={className}>{blocks}</ul>
  );
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const source = text.replace(/\r\n?/g, '\n');
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];

  let paragraph: string[] = [];
  const key = () => `b${blocks.length}`;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const own = paragraph;
    paragraph = [];
    blocks.push(
      <p key={key()} className="text-sm leading-relaxed text-slate-700">
        {renderLines(own, key())}
      </p>,
    );
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (FENCE.test(line)) {
      flushParagraph();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <pre
          key={key()}
          className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800"
        >
          {code.join('\n')}
        </pre>,
      );
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      blocks.push(<hr key={key()} className="my-4 border-slate-200" />);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const Tag = `h${Math.min(level + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6';
      blocks.push(
        <Tag key={key()} className={HEADING_CLASS[level - 1]}>
          {renderInline(heading[2], key())}
        </Tag>,
      );
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      flushParagraph();
      const quoted: string[] = [quote[1]];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1])) {
        quoted.push((QUOTE.exec(lines[i + 1]) as RegExpExecArray)[1]);
        i += 1;
      }
      blocks.push(
        <blockquote
          key={key()}
          className="border-l-2 border-slate-300 pl-3 text-sm italic leading-relaxed text-slate-600"
        >
          {renderLines(quoted, key())}
        </blockquote>,
      );
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = !!ordered;
      const items: ListItem[] = [];

      const push = (match: RegExpExecArray) =>
        items.push({ indent: match[1].replace(/\t/g, '  ').length, lines: [match[2]] });

      push((bullet ?? ordered) as RegExpExecArray);

      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        const nextMatch = isOrdered
          ? ORDERED.exec(next) ?? BULLET.exec(next)
          : BULLET.exec(next) ?? ORDERED.exec(next);
        if (nextMatch) {
          push(nextMatch);
          i += 1;
          continue;
        }
        // A plain indented line continues the item it sits under.
        if (next.trim() && /^\s{2,}/.test(next)) {
          items[items.length - 1].lines.push(next.trim());
          i += 1;
          continue;
        }
        break;
      }

      blocks.push(
        <div key={key()} className="text-sm text-slate-700">
          {renderListItems(items, isOrdered, key())}
        </div>,
      );
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();

  if (blocks.length === 0) return null;

  return <div className={`space-y-3 ${className}`.trim()}>{blocks}</div>;
}
