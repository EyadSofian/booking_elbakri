'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, TripFileStatus, type PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { debounce } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { HelpNotice, HelpTip } from '@/components/help/help-tip';
import { useMemo } from 'react';

interface TravelerOption {
  id: string;
  fullName: string;
  phoneRaw: string | null;
  phoneNormalized: string | null;
  nationalityRaw: string | null;
  nationality: { name: string } | null;
}

interface PartnerOption {
  id: string;
  name: string;
}

/**
 * Create a trip file.
 *
 * The traveller picker searches existing records first, deliberately: creating
 * a second file for a customer who already has one is the most common way this
 * data gets fragmented.
 */
export default function NewTripPage() {
  const router = useRouter();
  const { t, errorMessage } = useI18n();
  const { can } = useSession();

  const [travelerQuery, setTravelerQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState<TravelerOption | null>(null);

  const setQueryDebounced = useMemo(
    () => debounce((v: string) => setDebouncedQuery(v), 250),
    [],
  );

  const travelers = useQuery({
    queryKey: ['travelers', 'picker', debouncedQuery],
    queryFn: () =>
      api.get<PaginatedResponse<TravelerOption>>('/travelers', {
        q: debouncedQuery, pageSize: 8,
      }),
    enabled: debouncedQuery.trim().length >= 2,
  });

  const partners = useQuery({
    queryKey: ['partners', 'options'],
    queryFn: async () => {
      const r = await api.get<PaginatedResponse<PartnerOption> | PartnerOption[]>('/partners', {
        pageSize: 200,
      });
      return Array.isArray(r) ? r : r.data;
    },
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ id: string }>('/trips', body),
    onSuccess: (trip) => {
      toast.success(t.trips.newTripFile);
      router.push(`/trips/${trip.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!can(PERMISSIONS.TRIPS_CREATE)) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">{t.errors.FORBIDDEN}</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        guideKey="page.trips"
        breadcrumb={
          <Link href="/trips" className="hover:text-foreground">
            {t.trips.title}
          </Link>
        }
        title={t.trips.newTripFile}
        description={t.trips.newTripFileHint}
      />

      <form
        className="max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          create.mutate({
            leadTravelerId: selected?.id,
            partnerId: String(form.get('partnerId')) || undefined,
            status: String(form.get('status')),
            paxCount: form.get('paxCount') ? Number(form.get('paxCount')) : undefined,
            childCount: form.get('childCount') ? Number(form.get('childCount')) : undefined,
            travelStartDate: String(form.get('travelStartDate')) || undefined,
            travelEndDate: String(form.get('travelEndDate')) || undefined,
            notes: String(form.get('notes')) || undefined,
          });
        }}
      >
        <Card className="mb-4">
          <CardHeader className="border-b">
            <CardTitle>{t.trips.leadTraveler}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            <HelpNotice text={t.trips.searchBeforeCreating} />

            {selected ? (
              <div className="flex items-center justify-between gap-3 rounded-md border bg-surface-muted px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selected.fullName}</p>
                  <p className="truncate text-2xs text-muted-foreground" dir="ltr">
                    {selected.phoneNormalized ?? selected.phoneRaw ?? '—'}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  {t.common.edit}
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="travelerSearch">{t.common.search}</Label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="travelerSearch"
                      value={travelerQuery}
                      onChange={(e) => {
                        setTravelerQuery(e.target.value);
                        setQueryDebounced(e.target.value);
                      }}
                      placeholder={`${t.common.name}, ${t.common.phone}`}
                      className="ps-8"
                      autoComplete="off"
                    />
                  </div>
                </div>

                {debouncedQuery.trim().length >= 2 ? (
                  <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
                    {travelers.isFetching ? (
                      <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                        {t.common.loading}
                      </li>
                    ) : (travelers.data?.data.length ?? 0) === 0 ? (
                      <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                        {t.trips.noTravelerMatch}
                      </li>
                    ) : (
                      travelers.data!.data.map((tr) => (
                        <li key={tr.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(tr)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start transition-colors hover:bg-accent/40"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{tr.fullName}</span>
                              <span className="block truncate text-2xs text-muted-foreground" dir="ltr">
                                {tr.phoneNormalized ?? tr.phoneRaw ?? '—'}
                              </span>
                            </span>
                            {tr.nationality ? (
                              <Badge variant="outline">{tr.nationality.name}</Badge>
                            ) : null}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}

                <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <UserPlus className="size-3.5 shrink-0" aria-hidden />
                  {t.trips.travelerOptional}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader className="border-b">
            <CardTitle>{t.trips.tripFile}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="partnerId">{t.trips.agency}</Label>
              <select
                id="partnerId"
                name="partnerId"
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
              >
                <option value="">{t.common.none}</option>
                {(partners.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="paxCount">{t.trips.pax}</Label>
                <Input id="paxCount" name="paxCount" type="number" min="0" max="999" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="childCount">{t.trips.children}</Label>
                <Input id="childCount" name="childCount" type="number" min="0" max="999" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="travelStartDate" className="flex items-center gap-1">
                  {t.trips.travelStart}
                  <HelpTip helpKey="field.derivedTravelDates" label={t.trips.travelDates} />
                </Label>
                <Input id="travelStartDate" name="travelStartDate" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="travelEndDate">{t.trips.travelEnd}</Label>
                <Input id="travelEndDate" name="travelEndDate" type="date" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">{t.common.status}</Label>
              <select
                id="status"
                name="status"
                defaultValue={TripFileStatus.DRAFT}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
              >
                {Object.values(TripFileStatus)
                  .filter((s) => s !== 'COMPLETED' && s !== 'CANCELLED')
                  .map((s) => (
                    <option key={s} value={s}>
                      {t.status[s as keyof typeof t.status] ?? s}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">{t.common.notes}</Label>
              <Textarea id="notes" name="notes" rows={3} maxLength={4000} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/trips">{t.common.cancel}</Link>
          </Button>
          <Button type="submit" loading={create.isPending}>
            {t.common.create}
          </Button>
        </div>
      </form>
    </>
  );
}
