import type { ReactNode } from 'react';
import type { FriendlyError } from '../lib/supabase';

/** The centred card the signed-out screens share. */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold text-slate-900">LinkedIn outreach</p>
          <p className="mt-0.5 text-xs text-slate-500">Ontario Digital Academy</p>
        </div>

        <div className="card p-6">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          <div className="mt-5">{children}</div>
        </div>

        {footer ? <div className="mt-4 text-center text-sm text-slate-600">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Form-level error. Shows the actionable sentence, with the raw detail under it. */
export function FormError({ error }: { error: FriendlyError }) {
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
      <p className="text-sm font-medium text-red-900">{error.message}</p>
      {error.hint ? <p className="mt-1 text-xs text-red-800">{error.hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input className="input" {...props} />
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
