'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useI18n, useSession } from '@/lib/providers';
import { LOCALE_META, LOCALES } from '@/i18n/config';
import { BrandLogo } from '@/components/layout/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t, locale, setLocale, errorMessage } = useI18n();
  const { signIn, user, loading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only same-site paths are followed after sign-in.
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  useEffect(() => {
    if (!loading && user) router.replace(target);
  }, [loading, user, router, target]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace(target);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — the navy of the logo, with a route drawn across it. */}
      <div className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <svg className="absolute inset-0 h-full w-full opacity-[0.18]" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.5" fill="white" />
            </pattern>
          </defs>
          <rect width="600" height="800" fill="url(#dots)" />
        </svg>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <path d="M90 620 C 190 520, 170 420, 300 390 S 470 300, 480 240" fill="none" stroke="hsl(32 88% 55%)" strokeWidth="2.5" strokeDasharray="2 10" strokeLinecap="round" />
          <circle cx="90" cy="620" r="7" fill="hsl(32 88% 55%)" />
          <circle cx="480" cy="240" r="7" fill="none" stroke="hsl(32 88% 55%)" strokeWidth="2.5" />
        </svg>
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <BrandLogo variant="light" className="h-10 w-auto self-start" priority />
          <div className="max-w-md">
            <p className="text-3xl font-semibold leading-snug">
              {locale === 'ar' ? 'كل حجوزاتك في مكان واحد.' : 'Every booking in one place.'}
            </p>
            <p className="mt-3 text-white/60">
              {locale === 'ar'
                ? 'المبيعات بتسجل، العمليات بتنفذ، والكل شايف نفس الحالة.'
                : 'Sales register, operations deliver, everyone sees the same status.'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex justify-end p-4">
          <div className="flex items-center rounded-lg bg-surface-sunken p-0.5">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                aria-pressed={locale === code}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  locale === code ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {LOCALE_META[code].nativeLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="w-full max-w-sm animate-rise">
            <div className="mb-8 flex justify-center rounded-xl bg-brand-900 px-6 py-6 lg:hidden">
              <BrandLogo variant="light" className="h-9" priority />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{t.auth.signIn}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.auth.welcome}</p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" required>
                  {t.auth.email}
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                  dir="ltr"
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  invalid={Boolean(error)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" required>
                  {t.auth.password}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    dir="ltr"
                    className="h-11 pe-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    invalid={Boolean(error)}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-pressed={show}
                    aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
                    className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error ? (
                <div role="alert" aria-live="polite" className="flex items-start gap-2 rounded-lg bg-danger-subtle px-3 py-2.5 text-sm text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              ) : null}

              <Button type="submit" size="lg" className="w-full" loading={submitting}>
                {submitting ? t.auth.signingIn : t.auth.signIn}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
