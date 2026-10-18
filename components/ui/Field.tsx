import type { ComponentProps, ReactNode } from 'react';

type Look = 'boxed' | 'line';

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[12px] text-muted-2">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const cls = (look: Look) => (look === 'line' ? 'input-line' : 'input');

export function Input({
  name,
  error,
  look = 'boxed',
  ...props
}: ComponentProps<'input'> & { name: string; error?: string; look?: Look }) {
  return (
    <input
      id={props.id ?? name}
      name={name}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${name}-error` : undefined}
      className={cls(look)}
      {...props}
    />
  );
}

export function TextArea({
  name,
  error,
  look = 'boxed',
  ...props
}: ComponentProps<'textarea'> & { name: string; error?: string; look?: Look }) {
  return (
    <textarea
      id={props.id ?? name}
      name={name}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${name}-error` : undefined}
      className={`${cls(look)} min-h-[96px]`}
      {...props}
    />
  );
}

export function Select({
  name,
  error,
  children,
  ...props
}: ComponentProps<'select'> & { name: string; error?: string }) {
  return (
    <select
      id={props.id ?? name}
      name={name}
      aria-invalid={error ? true : undefined}
      className="input bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23111111%22 stroke-width=%221.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] appearance-none bg-[right_0.75rem_center] bg-no-repeat pr-9"
      {...props}
    >
      {children}
    </select>
  );
}

export function FormAlert({
  message,
  tone = 'error',
}: {
  message?: string;
  tone?: 'error' | 'success';
}) {
  if (!message) return null;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`px-3 py-2.5 text-[13px] ${tone === 'error' ? 'bg-error-bg text-error' : 'bg-stone-light text-ink'}`}
    >
      {message}
    </p>
  );
}
