'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useI18n, useSession } from '@/lib/providers';
import { api } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LOCALE_META, LOCALES, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

export default function AccountPage() {
  const { t, locale, setLocale, errorMessage } = useI18n();
  const { user, signOut } = useSession();

  const changePassword = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', body),
    onSuccess: async () => {
      // Changing a password revokes every other session, so this one ends too.
      toast.success(t.auth.changePassword);
      await signOut();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!user) return null;

  return (
    <>
      <PageHeader title={t.auth.myAccount} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t.auth.profile}</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {t.users.fullName}
                </dt>
                <dd className="mt-0.5 text-sm font-medium">{user.fullName}</dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {t.auth.email}
                </dt>
                <dd className="mt-0.5" dir="ltr">{user.email}</dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {t.users.roles}
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {user.roles.map((r) => (
                    <Badge key={r} variant="brand">{r}</Badge>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {t.users.permissions}
                </dt>
                <dd className="mt-1 max-h-40 overflow-y-auto">
                  <span className="flex flex-wrap gap-1">
                    {user.permissions.map((p) => (
                      <Badge key={p} variant="outline" className="font-mono">{p}</Badge>
                    ))}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t pt-3">
              <p className="mb-2 text-2xs uppercase tracking-wide text-muted-foreground">
                {LOCALE_META[locale].label}
              </p>
              <div className="flex items-center rounded-md border bg-surface p-0.5">
                {LOCALES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLocale(code as Locale)}
                    className={cn(
                      'rounded px-3 py-1.5 text-xs font-medium transition-colors',
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t.auth.changePassword}</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                changePassword.mutate({
                  currentPassword: String(form.get('currentPassword')),
                  newPassword: String(form.get('newPassword')),
                });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword" required>{t.auth.currentPassword}</Label>
                <Input id="currentPassword" name="currentPassword" type="password" required dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword" required>{t.auth.newPassword}</Label>
                <Input
                  id="newPassword" name="newPassword" type="password"
                  required minLength={12} dir="ltr"
                />
                <p className="text-2xs text-muted-foreground">
                  At least 12 characters. Changing it signs you out everywhere.
                </p>
              </div>
              <Button type="submit" loading={changePassword.isPending}>
                {t.auth.changePassword}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
