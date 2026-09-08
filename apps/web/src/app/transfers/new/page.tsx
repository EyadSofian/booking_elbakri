'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, TransferDirection } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { EntityPicker } from '@/components/data/entity-picker';
import { Field, FormSection, Repeatable } from '@/components/forms/repeatable';
import { HelpTip } from '@/components/help/help-tip';

interface LegInput {
  direction: string;
  fromLocationId: string | null;
  fromLabel: string | null;
  toLocationId: string | null;
  toLabel: string | null;
  serviceDate: string;
  pickupTime: string;
  flightNumber: string;
  paxCount: string;
  meetAndGreet: boolean;
  notes: string;
}

const emptyLeg = (direction: string = TransferDirection.ARRIVAL): LegInput => ({
  direction,
  fromLocationId: null, fromLabel: null,
  toLocationId: null, toLabel: null,
  serviceDate: '', pickupTime: '', flightNumber: '', paxCount: '',
  meetAndGreet: false, notes: '',
});

/** "HH:mm" to minutes since midnight, which is how the API stores a pickup. */
function toMinutes(value: string): number | undefined {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= 0 && minutes < 1440 ? minutes : undefined;
}

interface TripSummary {
  id: string;
  reference: string;
  leadTraveler: { id: string; fullName: string } | null;
  partner: { id: string; name: string } | null;
  paxCount: number | null;
}

/**
 * Create a transfer booking.
 *
 * A journey and its return belong to the same booking — that is why the old
 * spreadsheet left the name blank on the return row, and why this form starts
 * with an arrival and a departure rather than one leg.
 */
function NewTransferForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t, errorMessage } = useI18n();
  const { can } = useSession();

  const [tripFileId, setTripFileId] = useState<string | null>(params.get('tripFileId'));
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [paxCount, setPaxCount] = useState('');
  const [notes, setNotes] = useState('');
  const [legs, setLegs] = useState<LegInput[]>([
    emptyLeg(TransferDirection.ARRIVAL),
    emptyLeg(TransferDirection.DEPARTURE),
  ]);

  const trip = useQuery({
    queryKey: ['trip', 'summary', tripFileId],
    queryFn: () => api.get<TripSummary>(`/trips/${tripFileId}`),
    enabled: Boolean(tripFileId),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ id: string; tripFileId: string }>('/transfers', body),
    onSuccess: (booking) => {
      toast.success(t.transfers.newTransfer);
      router.push(`/trips/${booking.tripFileId ?? tripFileId}?tab=transfers`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!can(PERMISSIONS.TRANSFERS_CREATE)) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">{t.errors.FORBIDDEN}</p>
      </div>
    );
  }

  const blocking = !tripFileId
    ? t.trips.tripFileRequired
    : legs.some((l) => !l.serviceDate)
      ? t.transfers.dateRequired
      : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocking) return;
    create.mutate({
      tripFileId,
      partnerId: partnerId ?? undefined,
      paxCount: paxCount ? Number(paxCount) : undefined,
      notes: notes || undefined,
      legs: legs.map((l) => ({
        direction: l.direction,
        fromLocationId: l.fromLocationId ?? undefined,
        toLocationId: l.toLocationId ?? undefined,
        serviceDate: l.serviceDate,
        pickupTimeMinutes: toMinutes(l.pickupTime),
        flightNumber: l.flightNumber || undefined,
        paxCount: l.paxCount ? Number(l.paxCount) : undefined,
        meetAndGreet: l.meetAndGreet,
        notes: l.notes || undefined,
      })),
    });
  };

  return (
    <>
      <PageHeader
        guideKey="page.transfers"
        breadcrumb={
          tripFileId && trip.data ? (
            <Link href={`/trips/${tripFileId}?tab=transfers`} className="hover:text-foreground">
              {trip.data.reference}
            </Link>
          ) : (
            <Link href="/transfers" className="hover:text-foreground">
              {t.transfers.title}
            </Link>
          )
        }
        title={t.transfers.newTransfer}
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

          <div className="grid gap-3 sm:grid-cols-2">
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
                id="paxCount"
                type="number"
                min={0}
                max={999}
                value={paxCount}
                onChange={(e) => setPaxCount(e.target.value)}
                placeholder={trip.data?.paxCount ? String(trip.data.paxCount) : undefined}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title={t.transfers.legs} description={t.transfers.legsHint}>
          <Repeatable
            items={legs}
            onChange={setLegs}
            makeEmpty={() => emptyLeg(TransferDirection.OTHER)}
            addLabel={t.transfers.addLeg}
            itemLabel={(i) => `${t.transfers.leg} ${i + 1}`}
            renderItem={(leg, index, update) => (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t.transfers.direction} htmlFor={`direction-${index}`}>
                    <select
                      id={`direction-${index}`}
                      value={leg.direction}
                      onChange={(e) => update({ direction: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
                    >
                      {Object.values(TransferDirection).map((d) => (
                        <option key={d} value={d}>
                          {t.direction[d as keyof typeof t.direction] ?? d}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t.common.date} htmlFor={`serviceDate-${index}`} required>
                    <Input
                      id={`serviceDate-${index}`}
                      type="date"
                      value={leg.serviceDate}
                      onChange={(e) => update({ serviceDate: e.target.value })}
                      required
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                  <Field label={t.common.from} htmlFor={`from-${index}`}>
                    <EntityPicker
                      id={`from-${index}`}
                      resource="/locations"
                      value={leg.fromLocationId}
                      currentLabel={leg.fromLabel}
                      onChange={(id, record) =>
                        update({
                          fromLocationId: id,
                          fromLabel: (record?.name as string | undefined) ?? null,
                        })
                      }
                    />
                  </Field>
                  <div className="hidden pb-2.5 sm:block">
                    <ArrowLeftRight className="size-4 text-muted-foreground flip-rtl" aria-hidden />
                  </div>
                  <Field label={t.common.to} htmlFor={`to-${index}`}>
                    <EntityPicker
                      id={`to-${index}`}
                      resource="/locations"
                      value={leg.toLocationId}
                      currentLabel={leg.toLabel}
                      onChange={(id, record) =>
                        update({
                          toLocationId: id,
                          toLabel: (record?.name as string | undefined) ?? null,
                        })
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field
                    label={t.transfers.pickupTime}
                    htmlFor={`pickup-${index}`}
                    hint={<HelpTip helpKey="field.pickupTime" label={t.transfers.pickupTime} />}
                  >
                    <Input
                      id={`pickup-${index}`}
                      type="time"
                      value={leg.pickupTime}
                      onChange={(e) => update({ pickupTime: e.target.value })}
                    />
                  </Field>
                  <Field label={t.transfers.flightNumber} htmlFor={`flight-${index}`}>
                    <Input
                      id={`flight-${index}`}
                      maxLength={40}
                      value={leg.flightNumber}
                      onChange={(e) => update({ flightNumber: e.target.value })}
                      dir="ltr"
                    />
                  </Field>
                  <Field label={t.trips.pax} htmlFor={`legPax-${index}`}>
                    <Input
                      id={`legPax-${index}`}
                      type="number"
                      min={0}
                      max={999}
                      value={leg.paxCount}
                      onChange={(e) => update({ paxCount: e.target.value })}
                    />
                  </Field>
                </div>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-brand-700"
                    checked={leg.meetAndGreet}
                    onChange={(e) => update({ meetAndGreet: e.target.checked })}
                  />
                  {t.transfers.meetAndGreet}
                </label>

                <Field label={t.common.notes} htmlFor={`legNotes-${index}`}>
                  <Textarea
                    id={`legNotes-${index}`}
                    rows={2}
                    maxLength={2000}
                    value={leg.notes}
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
              id="notes"
              rows={3}
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
            <Link href={tripFileId ? `/trips/${tripFileId}?tab=transfers` : '/transfers'}>
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

export default function NewTransferPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <NewTransferForm />
    </Suspense>
  );
}
