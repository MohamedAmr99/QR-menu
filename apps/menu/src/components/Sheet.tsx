import type { ReactNode } from 'react';

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="size-10 rounded-full bg-stone-100 text-xl font-bold" aria-label="-">−</button>
      <span className="w-6 text-center text-lg font-bold">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(50, value + 1))} className="size-10 rounded-full bg-stone-100 text-xl font-bold" aria-label="+">+</button>
    </div>
  );
}
