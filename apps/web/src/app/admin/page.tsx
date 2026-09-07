'use client';

import Link from 'next/link';
import { ChevronRight, ClipboardList, KeyRound, Settings, ShieldCheck } from 'lucide-react';
import { PERMISSIONS } from '@elbakri/shared';
import { useI18n, useSession } from '@/lib/providers';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';

export default function AdminIndexPage() {
  const { t } = useI18n();
  const { canAny } = useSession();

  const sections = [
    { href: '/admin/users', icon: ShieldCheck, label: t.nav.users, perms: [PERMISSIONS.USERS_READ] },
    { href: '/admin/audit', icon: ClipboardList, label: t.nav.auditLog, perms: [PERMISSIONS.AUDIT_READ] },
    { href: '/admin/api-keys', icon: KeyRound, label: t.nav.apiIntegrations, perms: [PERMISSIONS.API_KEYS_CREATE, PERMISSIONS.API_KEYS_MANAGE] },
    { href: '/admin/settings', icon: Settings, label: t.nav.settings, perms: [PERMISSIONS.SETTINGS_MANAGE] },
  ].filter((s) => canAny(...s.perms));

  return (
    <>
      <PageHeader title={t.nav.administration} />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="transition-colors hover:border-brand-300 hover:bg-accent/30">
                <CardContent className="flex items-center gap-3 py-3.5">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex-1 text-sm font-medium">{section.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground flip-rtl" aria-hidden />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
