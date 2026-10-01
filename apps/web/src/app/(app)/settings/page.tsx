'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, FileSpreadsheet, Hotel, Settings, UserRound, Users } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { LOCALE_META, LOCALES } from '@/i18n/config';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared/field';
import { TeamTab } from '@/components/settings/team';
import { ListTab } from '@/components/settings/lists';
import { ImportTab } from '@/components/settings/import';

type Tab = 'team' | 'agencies' | 'hotels' | 'import' | 'account';

function SettingsInner() {
  const { t } = useI18n();
  const { is } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const tabs: Array<{ key: Tab; label: string; icon: typeof Users; show: boolean }> = [
    { key: 'team', label: t.settings.users, icon: Users, show: is() },
    { key: 'agencies', label: t.settings.agencies, icon: Building2, show: is('OPERATIONS') },
    { key: 'hotels', label: t.settings.hotels, icon: Hotel, show: is('OPERATIONS') },
    { key: 'import', label: t.settings.import, icon: FileSpreadsheet, show: is('OPERATIONS') },
    { key: 'account', label: t.settings.account, icon: UserRound, show: true },
  ];
  const visible = tabs.filter((x) => x.show);
  const requested = params.get('tab') as Tab | null;
  const tab = visible.find((x) => x.key === requested)?.key ?? visible[0].key;

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader icon={Settings} title={t.settings.title} />
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b">
        {visible.map((x) => (
          <button
            key={x.key}
            role="tab"
            type="button"
            aria-selected={tab === x.key}
            onClick={() => router.replace(`${pathname}?tab=${x.key}`, { scroll: false })}
            className={cn(
              '-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
              tab === x.key ? 'border-sun font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <x.icon className="size-4" />
            {x.label}
          </button>
        ))}
      </div>
      <div className="animate-rise" key={tab}>
        {tab === 'team' ? <TeamTab /> : null}
        {tab === 'agencies' ? <ListTab kind="agencies" /> : null}
        {tab === 'hotels' ? <ListTab kind="hotels" /> : null}
        {tab === 'import' ? <ImportTab /> : null}
        {tab === 'account' ? <AccountTab /> : null}
      </div>
    </div>
  );
}

function AccountTab() {
  const { t, locale, setLocale, errorMessage } = useI18n();
  const { user } = useSession();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [error, setError] = React.useState('');
  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success(t.settings.passwordChanged);
      setCurrent('');
      setNext('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-xl border bg-card p-5 shadow-xs">
        <p className="font-semibold">{user?.name}</p>
        <p className="ltr text-sm text-muted-foreground">{user?.email}</p>
        <p className="mt-1 text-sm">{user ? t.roles[user.role] : ''}</p>
        <div className="mt-5">
          <p className="mb-2 text-sm font-medium">{t.settings.language}</p>
          <div className="flex gap-2">
            {LOCALES.map((code) => (
              <Button key={code} variant={locale === code ? 'default' : 'outline'} onClick={() => setLocale(code)}>
                {LOCALE_META[code].nativeLabel}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <form
        noValidate
        className="space-y-3 rounded-xl border bg-card p-5 shadow-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (next.length < 8) return setError(t.settings.passwordHint);
          change.mutate();
        }}
      >
        <p className="font-semibold">{t.settings.changePassword}</p>
        <Field label={t.settings.currentPassword} htmlFor="a-current" required>
          <Input id="a-current" type="password" dir="ltr" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t.settings.newPassword} htmlFor="a-next" required error={error} hint={t.settings.passwordHint}>
          <Input id="a-next" type="password" dir="ltr" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setError(''); }} invalid={Boolean(error)} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={change.isPending} disabled={!current}>
            {t.settings.changePassword}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsInner />
    </Suspense>
  );
}
