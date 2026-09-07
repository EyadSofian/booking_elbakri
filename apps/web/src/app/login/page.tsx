'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useI18n, useSession } from '@/lib/providers';
import { LOCALE_META, LOCALES, type Locale } from '@/i18n/config';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `next` carries the page the user was trying to reach before being bounced
  // here, so a shared deep link survives the sign-in.
  const nextPath = params.get('next');

  useEffect(() => {
    if (!loading && user) router.replace(nextPath || '/dashboard');
  }, [loading, user, router, nextPath]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace(nextPath || '/dashboard');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex items-center justify-end p-4">
        <div className="flex items-center rounded-md border bg-surface p-0.5">
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code as Locale)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                locale === code
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={locale === code}
            >
              {LOCALE_META[code as Locale].nativeLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          {/*
            The mark sits on a navy panel here. Where the artwork needs a dark
            ground, the surface behind it changes — the logo file never does.
          */}
          <div className="mb-6 flex items-center justify-center rounded-lg bg-brand-900 px-6 py-8">
            <BrandLogo variant="light" className="h-10 max-w-[220px]" priority />
          </div>

          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <h1 className="text-base font-semibold">{t.auth.signIn}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.auth.welcomeBack}</p>

            <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" required>
                  {t.auth.email}
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                  // Email and password are always Latin, so they stay LTR even
                  // when the interface is in Arabic.
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  invalid={Boolean(error)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" required>
                  {t.auth.password}
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  invalid={Boolean(error)}
                />
              </div>

              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger"
                >
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              ) : null}

              <Button type="submit" className="w-full" loading={submitting}>
                {submitting ? t.auth.signingIn : t.auth.signIn}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-2xs text-muted-foreground">
            {t.common.appName} · {t.common.appSubtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
