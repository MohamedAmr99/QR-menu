import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' }) {
  const styles = {
    primary: 'bg-stone-900 text-white hover:bg-stone-800',
    soft: 'bg-stone-200 text-stone-900 hover:bg-stone-300',
    ghost: 'text-stone-700 hover:bg-stone-200',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }[variant];
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold transition disabled:opacity-40 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 outline-none focus:border-stone-900 ${props.className ?? ''}`}
    />
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${checked ? 'bg-emerald-600' : 'bg-stone-300'}`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${checked ? 'right-1' : 'right-6'}`} />
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-stone-50 p-5 pb-8 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="size-10 rounded-full text-2xl leading-none text-stone-500 hover:bg-stone-200" aria-label="إغلاق">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ReadOnlyBanner() {
  return (
    <div className="mb-4 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
      الاشتراك موقوف أو منتهي، فاللوحة للقراءة بس والمنيو مقفول للزبائن. كلمنا على واتساب للتجديد.
    </div>
  );
}
