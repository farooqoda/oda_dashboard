import ReactMarkdown, { type Components } from 'react-markdown';
import { structureAnalysis } from '../lib/analysisText';

/**
 * MARKDOWN FOR MODEL-AUTHORED TEXT
 * ================================
 * `detailed_response` is written by whichever prompt the client is running, so
 * its shape is not ours to fix: one row is three bullet points, the next is
 * headed sections with bold labels. Rendering it as a plain string put literal
 * `###` and `**` on the screen, which is what this replaces.
 *
 * Every element is styled explicitly below rather than left to a typography
 * plugin, so the headings carry real hierarchy — larger, bolder, darker — and
 * hold their contrast against the card they sit on.
 *
 * react-markdown builds React elements; it never hands a string to
 * `dangerouslySetInnerHTML` and it does not pass raw HTML through unless a
 * plugin asks it to, so prompt-authored text cannot inject markup into the
 * dashboard. Its default URL filter leaves only safe schemes in an `href`.
 */

const COMPONENTS: Components = {
  // Headings stand apart from the body by size, weight, colour and a rule or accent bar,
  // so a section title never reads like the text under it.
  h1: (props) => <h1 className="mb-3 mt-6 border-b-2 border-brand-200 pb-2 text-xl font-bold text-ink first:mt-0" {...props} />,
  h2: (props) => <h2 className="mb-3 mt-6 border-b-2 border-brand-200 pb-2 text-lg font-bold text-ink first:mt-0" {...props} />,
  h3: (props) => (
    <h3 className="mb-2 mt-6 rounded-r-md border-l-4 border-brand-500 bg-brand-50 py-1.5 pl-3 text-[15px] font-bold text-brand-800 first:mt-0" {...props} />
  ),
  h4: (props) => <h4 className="mb-1.5 mt-4 text-sm font-bold uppercase tracking-wide text-brand-700 first:mt-0" {...props} />,
  h5: (props) => (
    <h5 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600" {...props} />
  ),
  h6: (props) => (
    <h6 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500" {...props} />
  ),
  p: (props) => <p className="mb-2 leading-relaxed text-slate-700" {...props} />,
  strong: (props) => <strong className="font-semibold text-slate-900" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-slate-400" {...props} />,
  ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-slate-400" {...props} />,
  li: (props) => <li className="text-slate-700" {...props} />,
  a: ({ children, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
    >
      {children}
    </a>
  ),
  blockquote: (props) => (
    <blockquote
      className="my-2 border-l-2 border-slate-300 pl-3 italic leading-relaxed text-slate-600"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="my-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800"
      {...props}
    />
  ),
  hr: (props) => <hr className="my-4 border-slate-200" {...props} />,
};

export function Markdown({ text, className = '', structure = false }: { text: string; className?: string; structure?: boolean }) {
  if (!text.trim()) return null;

  return (
    <div className={`prose prose-sm max-w-none text-sm ${className}`.trim()} data-testid="markdown">
      <ReactMarkdown components={COMPONENTS}>{structure ? structureAnalysis(text) : text}</ReactMarkdown>
    </div>
  );
}
