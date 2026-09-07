'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, ChevronRight, Hotel, MapPin, Sparkles, Ship, Truck,
  UserCog, UtensilsCrossed,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function MasterDataIndexPage() {
  const { t, dir } = useI18n();

  // Values the importer could not resolve are the reason to visit this section,
  // so the count is surfaced here rather than buried in a sub-page.
  const pending = useQuery({
    queryKey: ['alias-suggestions', 'count'],
    queryFn: () => api.get<{ total: number }>('/alias-suggestions', { pageSize: 1 })
      .then((r) => ({ total: (r as unknown as { meta?: { total: number } }).meta?.total ?? 0 }))
      .catch(() => ({ total: 0 })),
  });

  const sections = [
    { href: '/travelers', icon: UserCog, label: t.nav.travelers },
    { href: '/master-data/hotels', icon: Building2, label: t.nav.hotels },
    { href: '/master-data/partners', icon: Sparkles, label: t.nav.partners },
    { href: '/master-data/excursions', icon: Ship, label: t.nav.excursionCatalog },
    { href: '/master-data/locations', icon: MapPin, label: t.nav.locations },
    { href: '/master-data/room-types', icon: Hotel, label: t.nav.roomTypes },
    { href: '/master-data/meal-plans', icon: UtensilsCrossed, label: t.nav.mealPlans },
    { href: '/master-data/drivers', icon: UserCog, label: t.nav.drivers },
    { href: '/master-data/vehicles', icon: Truck, label: t.nav.vehicles },
  ];

  const Chevron = ChevronRight;

  return (
    <>
      <PageHeader title={t.masterData.title} description={t.masterData.aliasSuggestionsHint} />

      {pending.data && pending.data.total > 0 ? (
        <Link
          href="/data-quality?category=UNKNOWN_ALIAS"
          className="mb-4 flex items-center justify-between gap-2 rounded-md bg-warning-subtle px-3 py-2.5 text-xs text-warning transition-colors hover:brightness-95"
        >
          <span>{t.masterData.aliasSuggestions}</span>
          <Badge variant="warning">{pending.data.total}</Badge>
        </Link>
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="transition-colors hover:border-brand-300 hover:bg-accent/30">
                <CardContent className="flex items-center gap-3 py-3.5">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex-1 text-sm font-medium">{section.label}</span>
                  <Chevron className="size-4 shrink-0 text-muted-foreground flip-rtl" aria-hidden />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
