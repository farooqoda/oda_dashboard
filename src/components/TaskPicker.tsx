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
    description: 'Post AI-drafted comments on the posts you scraped.',
    nextStep: '',
  },
  lead_scraper: {
    title: 'Lead Scraper',
    description: 'Sync a LinkedIn profile as a lead and get a personalized invite message.',
    nextStep: 'Open any LinkedIn profile and press "Sync Full Lead".',
  },
  message_sender: {
    title: 'Message Sender',
    description: 'Send your messages to a list of selected leads.',
    nextStep: '',
  },
};

const ORDER: Task[] = ['post_scraper', 'comment_poster', 'lead_scraper', 'message_sender'];

export function TaskPicker() {
  const { status, task, pending, chooseTask, recheck } = useExtensionTask();
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((key) => {
          const info = TASK_INFO[key];
          const enabled = ENABLED_TASKS.includes(key);
          const isActive = active === key;
          const isPending = pending === key;
          return (
            <div
              key={key}
              className={`card flex flex-col p-4 ${
                isActive ? 'border-brand-500 ring-1 ring-brand-500' : ''
              } ${enabled ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{info.title}</h3>
                {isActive ? (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800">
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
                <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                  {info.nextStep}
                </p>
              ) : null}
              <div className="mt-3">
                {isActive ? (
                  <span className="text-xs font-medium text-brand-700">Selected ✓</span>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary w-full"
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
