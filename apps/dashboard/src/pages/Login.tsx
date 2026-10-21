import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { auth } from '../firebase';
import { Button, Field, Input } from '../components/ui';

const messages: Record<string, string> = {
  'auth/invalid-credential': 'الإيميل أو كلمة السر غلط',
  'auth/invalid-email': 'الإيميل مش مكتوب صح',
  'auth/too-many-requests': 'محاولات كتير. استنى شوية وجرب تاني',
  'auth/network-request-failed': 'مفيش إنترنت',
};

export function Login({ notice }: { notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(notice ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(messages[(err as { code?: string }).code ?? ''] ?? 'حصلت مشكلة، جرب تاني');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!email) return setError('اكتب الإيميل الأول');
    await sendPasswordResetEmail(auth, email.trim()).catch(() => undefined);
    setError('لو الإيميل مسجل هيوصلك لينك تغيير كلمة السر');
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="text-center text-2xl font-bold">دخول لوحة المطعم</h1>
        <Field label="الإيميل">
          <Input type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="كلمة السر">
          <Input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button className="w-full" disabled={busy}>{busy ? 'جاري الدخول…' : 'دخول'}</Button>
        <button type="button" onClick={reset} className="w-full text-sm text-stone-500 underline">
          نسيت كلمة السر
        </button>
      </form>
    </div>
  );
}
