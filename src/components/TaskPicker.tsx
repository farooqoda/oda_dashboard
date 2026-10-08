import { ENABLED_TASKS, useExtensionTask, type Task } from '../lib/extensionBridge';

const TASK_INFO: Record<Task, { title: string; description: string; nextStep: string }> = {
  post_scraper: {
    title: 'Post Scraper',
    description: 'Collect posts from a LinkedIn search or feed: name, profile, post link, headline and text.',
    nextStep:
      'Open LinkedIn, search and apply the filters you want, let the posts load, then press "Scrape Posts". Results appear under Posts.',
  },
  comment_poster: {
    title: 'Comment Poster',
    description: 'Post the AI comments you approved on the Comments page, one at a time with safe pauses.',
    nextStep: 'Approve comments on the Comments page, then open LinkedIn and press "Start" in the Comment Poster panel.',
  },
  lead_scraper: {
    title: 'Lead Scraper',
    description: 'Sync a LinkedIn profile as a lead and get a personalized message. If you are already connected, it is typed into the chat for you — you press Send.',
    nextStep: 'Open any LinkedIn profile and press "Sync Full Lead". Leads you don\'t message right away wait on the Outreach page.',
  },
  message_sender: {
    title: 'Message Sender',
    description: 'Send your approved outreach to selected leads: connection requests with a note, or chat messages to people you are already connected with.',
    nextStep: 'Select leads on the Outreach page and press Send, then open LinkedIn and press "Start" in the Message Sender panel.',
  },
};

// Each task keeps one colour everywhere on its card, so the four are told apart at a glance.
const TASK_TONE: Record<Task, { bar: string; ring: string; badge: string; button: string; note: string }> = {
  post_scraper: {
    bar: 'border-t-teal-500', ring: 'border-teal-500 ring-1 ring-teal-500', badge: 'bg-teal-50 text-teal-800',
    button: 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700', note: 'bg-teal-50 text-teal-900',
  },
  comment_poster: {
    bar: 'border-t-violet-500', ring: 'border-violet-500 ring-1 ring-violet-500', badge: 'bg-violet-50 text-violet-800',
    button: 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700', note: 'bg-violet-50 text-violet-900',
  },
  lead_scraper: {
    bar: 'border-t-brand-500', ring: 'border-brand-500 ring-1 ring-brand-500', badge: 'bg-brand-50 text-brand-800',
    button: 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700', note: 'bg-brand-50 text-brand-900',
  },
  message_sender: {
    bar: 'border-t-orange-500', ring: 'border-orange-500 ring-1 ring-orange-500', badge: 'bg-orange-50 text-orange-800',
    button: 'border-orange-600 bg-orange-600 text-white hover:bg-orange-700', note: 'bg-orange-50 text-orange-900',
  },
};

const ORDER: Task[] = ['post_scraper', 'comment_poster', 'lead_scraper', 'message_sender'];

export function TaskPicker() {
  const { status, task, pending, refused, chooseTask, recheck } = useExtensionTask();
  const active = status === 'connected' ? task : null;

  return (
    <section className="mb-8" aria-labelledby="task-picker-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="task-picker-title" className="text-sm font-semibold text-slate-900">
          Choose your task
        </h2>
        <p className="text-xs text-slate-500">
          {status === 'checking' && 'Looking for the extension…'}
          {status === 'connected' && 'Extension connected in this browser.'}
          {status === 'missing' && (
            <>
              Extension not detected.{' '}
              <button type="button" className="font-medium text-brand-700 hover:underline" onClick={recheck}>
                Check again
              </button>
            </>
          )}
        </p>
      </div>

      {status === 'missing' ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          The GAB extension (v4.16 or newer) is not running in this browser. Install or enable it in
          Tampermonkey, then reload this page. Tasks are saved in the extension, so pick them in the
          same browser you use for LinkedIn.
        </p>
      ) : null}

      {refused ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          Your extension did not accept "{TASK_INFO[refused].title}". It is probably an older version —
          install the latest GAB LinkedIn Assistant in Tampermonkey, then reload this page.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((key) => {
          const info = TASK_INFO[key];
          const enabled = ENABLED_TASKS.includes(key);
          const isActive = active === key;
          const isPending = pending === key;
          const tone = TASK_TONE[key];
          return (
            <div
              key={key}
              className={`card flex flex-col border-t-4 p-4 ${tone.bar} ${isActive ? tone.ring : ''} ${
                enabled ? '' : 'opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-ink">{info.title}</h3>
                {isActive ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
                    Active
                  </span>
                ) : !enabled ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    Coming soon
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-600">{info.description}</p>
              {isActive && info.nextStep ? (
                <p className={`mt-3 rounded-md px-3 py-2 text-xs leading-relaxed ${tone.note}`}>
                  {info.nextStep}
                </p>
              ) : null}
              <div className="mt-3">
                {isActive ? (
                  <span className="text-xs font-medium text-ink">Selected ✓</span>
                ) : (
                  <button
                    type="button"
                    className={`btn w-full ${tone.button}`}
                    disabled={!enabled || status !== 'connected' || isPending}
                    onClick={() => chooseTask(key)}
                    title={
                      !enabled
                        ? 'Coming soon'
                        : status !== 'connected'
                          ? 'The extension is not detected in this browser'
                          : undefined
                    }
                  >
                    {isPending ? 'Switching…' : enabled ? 'Use this task' : 'Coming soon'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
