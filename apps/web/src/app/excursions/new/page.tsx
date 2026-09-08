'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { EntityPicker } from '@/components/data/entity-picker';
import { Field, FormSection, Repeatable } from '@/components/forms/repeatable';

interface ItemInput {
  catalogItemId: string | null;
  catalogLabel: string | null;
  serviceDate: string;
  paxOverride: string;
  transferRequired: boolean;
  guideRequired: boolean;
  notes: string;
}

const emptyItem = (): ItemInput => ({
  catalogItemId: null, catalogLabel: null, serviceDate: '',
  paxOverride: '', transferRequired: false, guideRequired: false, notes: '',
});

interface TripSummary {
  id: string;
  reference: string;
  leadTraveler: { id: string; fullName: string } | null;
  partner: { id: string; name: string } | null;
  paxCount: number | null;
  childCount: number | null;
}

/**
 * Create an excursion order.
 *
 * One customer's several activities stay together as one order — the same
 * relationship the old sheet encoded with blank-name rows beneath the customer.
 */
function NewExcursionForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t, errorMessage } = useI18n();
  const { can } = useSession();

  const [tripFileId, setTripFileId] = useState<string | null>(params.get('tripFileId'));
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [hotelLabel, setHotelLabel] = useState<string | null>(null);
  const [paxCount, setPaxCount] = useState('');
  const [childCount, setChildCount] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemInput[]>([emptyItem()]);

  const trip = useQuery({
    queryKey: ['trip', 'summary', tripFileId],
    queryFn: () => api.get<TripSummary>(`/trips/${tripFileId}`),
    enabled: Boolean(tripFileId),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ id: string; tripFileId: string }>('/excursion-bookings', body),
    onSuccess: (booking) => {
      toast.success(t.excursions.newOrder);
      router.push(`/trips/${booking.tripFileId ?? tripFileId}?tab=excursions`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!can(PERMISSIONS.EXCURSIONS_CREATE)) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">{t.errors.FORBIDDEN}</p>
      </div>
    );
  }

  const blocking = !tripFileId
    ? t.trips.tripFileRequired
    : items.every((i) => !i.catalogItemId)
      ? t.excursions.activityRequired
      : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocking) return;
    create.mutate({
      tripFileId,
      partnerId: partnerId ?? undefined,
      hotelId: hotelId ?? undefined,
      paxCount: paxCount ? Number(paxCount) : undefined,
      childCount: childCount ? Number(childCount) : undefined,
      notes: notes || undefined,
      items: items
        .filter((i) => i.catalogItemId)
        .map((i) => ({
          catalogItemId: i.catalogItemId ?? undefined,
          serviceDate: i.serviceDate || undefined,
          paxOverride: i.paxOverride ? Number(i.paxOverride) : undefined,
          transferRequired: i.transferRequired,
          guideRequired: i.guideRequired,
          notes: i.notes || undefined,
        })),
    });
  };

  return (
    <>
      <PageHeader
        guideKey="page.excursions"
        breadcrumb={
          tripFileId && trip.data ? (
            <Link href={`/trips/${tripFileId}?tab=excursions`} className="hover:text-foreground">
              {trip.data.reference}
            </Link>
          ) : (
            <Link href="/excursions" className="hover:text-foreground">
              {t.excursions.title}
            </Link>
          )
        }
        title={t.excursions.newOrder}
        description={trip.data?.leadTraveler?.fullName ?? undefined}
      />

      <form onSubmit={submit} className="max-w-3xl space-y-4">
        <FormSection title={t.hotels.guestAndTrip}>
          <Field label={t.trips.tripFile} htmlFor="tripFileId" required>
            <EntityPicker
              id="tripFileId"
              resource="/trips"
              value={tripFileId}
              currentLabel={trip.data?.reference}
              onChange={(id) => setTripFileId(id)}
              placeholder={t.trips.searchTripFile}
              required
            />
          </Field>

          <Field label={t.hotels.hotel} htmlFor="hotelId">
            <EntityPicker
              id="hotelId"
              resource="/hotels"
              value={hotelId}
              currentLabel={hotelLabel}
              onChange={(id, record) => {
                setHotelId(id);
                setHotelLabel((record?.name as string | undefined) ?? null);
              }}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t.trips.agency} htmlFor="partnerId">
              <EntityPicker
                id="partnerId"
                resource="/partners"
                value={partnerId}
                currentLabel={trip.data?.partner?.name}
                onChange={(id) => setPartnerId(id)}
                placeholder={t.common.none}
              />
            </Field>
            <Field label={t.trips.pax} htmlFor="paxCount">
              <Input
                id="paxCount" type="number" min={0} max={999}
                value={paxCount} onChange={(e) => setPaxCount(e.target.value)}
                placeholder={trip.data?.paxCount ? String(trip.data.paxCount) : undefined}
              />
            </Field>
            <Field label={t.trips.children} htmlFor="childCount">
              <Input
                id="childCount" type="number" min={0} max={999}
                value={childCount} onChange={(e) => setChildCount(e.target.value)}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title={t.excursions.activities} description={t.excursions.activitiesHint}>
          <Repeatable
            items={items}
            onChange={setItems}
            makeEmpty={emptyItem}
            addLabel={t.excursions.addActivity}
            itemLabel={(i) => `${t.excursions.activity} ${i + 1}`}
            renderItem={(item, index, update) => (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field
                    label={t.excursions.activity}
                    htmlFor={`activity-${index}`}
                    className="sm:col-span-2"
                    required
                  >
                    <EntityPicker
                      id={`activity-${index}`}
                      resource="/excursions"
                      value={item.catalogItemId}
                      currentLabel={item.catalogLabel}
                      onChange={(id, record) =>
                        update({
                          catalogItemId: id,
                          catalogLabel: (record?.name as string | undefined) ?? null,
                        })
                      }
                      required
                    />
                  </Field>
                  <Field label={t.excursions.serviceDate} htmlFor={`itemDate-${index}`}>
                    <Input
                      id={`itemDate-${index}`}
                      type="date"
                      value={item.serviceDate}
                      onChange={(e) => update({ serviceDate: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox" className="size-3.5 accent-brand-700"
                      checked={item.transferRequired}
                      onChange={(e) => update({ transferRequired: e.target.checked })}
                    />
                    {t.excursions.transferRequired}
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox" className="size-3.5 accent-brand-700"
                      checked={item.guideRequired}
                      onChange={(e) => update({ guideRequired: e.target.checked })}
                    />
                    {t.excursions.guideRequired}
                  </label>
                  <Field label={t.trips.pax} htmlFor={`itemPax-${index}`} className="w-24">
                    <Input
                      id={`itemPax-${index}`} type="number" min={0} max={999}
                      value={item.paxOverride}
                      onChange={(e) => update({ paxOverride: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label={t.common.notes} htmlFor={`itemNotes-${index}`}>
                  <Textarea
                    id={`itemNotes-${index}`} rows={2} maxLength={2000}
                    value={item.notes}
                    onChange={(e) => update({ notes: e.target.value })}
                  />
                </Field>
              </div>
            )}
          />
        </FormSection>

        <FormSection title={t.common.notes}>
          <Field label={t.common.notes} htmlFor="notes">
            <Textarea
              id="notes" rows={3} maxLength={4000}
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </FormSection>

        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          {blocking ? (
            <span className="flex items-center gap-1.5 text-2xs text-muted-foreground sm:me-auto">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              {blocking}
            </span>
          ) : null}
          <Button type="button" variant="outline" asChild>
            <Link href={tripFileId ? `/trips/${tripFileId}?tab=excursions` : '/excursions'}>
              {t.common.cancel}
            </Link>
          </Button>
          <Button type="submit" disabled={Boolean(blocking)} loading={create.isPending}>
            {t.common.create}
          </Button>
        </div>
      </form>
    </>
  );
}

export default function NewExcursionPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <NewExcursionForm />
    </Suspense>
  );
}
