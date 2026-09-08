'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { nightsBetween, PERMISSIONS } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EntityPicker } from '@/components/data/entity-picker';
import { Field, FormSection, Repeatable } from '@/components/forms/repeatable';
import { HelpTip } from '@/components/help/help-tip';

interface RoomInput {
  roomTypeId: string | null;
  roomTypeLabel: string | null;
  quantity: number;
  adults: number | null;
  children: number | null;
}

interface SegmentInput {
  hotelId: string | null;
  hotelLabel: string | null;
  checkIn: string;
  checkOut: string;
  mealPlanId: string | null;
  mealPlanLabel: string | null;
  notes: string;
  rooms: RoomInput[];
}

const emptyRoom = (): RoomInput => ({
  roomTypeId: null, roomTypeLabel: null, quantity: 1, adults: null, children: null,
});

const emptySegment = (): SegmentInput => ({
  hotelId: null, hotelLabel: null, checkIn: '', checkOut: '',
  mealPlanId: null, mealPlanLabel: null, notes: '', rooms: [emptyRoom()],
});

interface TripSummary {
  id: string;
  reference: string;
  leadTraveler: { id: string; fullName: string } | null;
  partner: { id: string; name: string } | null;
}

/**
 * Create a hotel booking.
 *
 * One booking holds one or more stays, each with its own rooms — a guest who
 * moves between hotels is one booking, not two. That is the same relationship
 * the legacy sheets encoded with blank-name continuation rows.
 */
function NewHotelBookingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t, errorMessage } = useI18n();
  const { can } = useSession();

  const presetTripId = params.get('tripFileId');
  const [tripFileId, setTripFileId] = useState<string | null>(presetTripId);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [bookingDate, setBookingDate] = useState('');
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [securityApproval, setSecurityApproval] = useState(false);
  const [notes, setNotes] = useState('');
  const [segments, setSegments] = useState<SegmentInput[]>([emptySegment()]);

  // When arriving from a trip file, show which one rather than an opaque id.
  const trip = useQuery({
    queryKey: ['trip', 'summary', tripFileId],
    queryFn: () => api.get<TripSummary>(`/trips/${tripFileId}`),
    enabled: Boolean(tripFileId),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ id: string; tripFileId: string }>('/hotel-bookings', body),
    onSuccess: (booking) => {
      toast.success(t.hotels.newBooking);
      router.push(`/trips/${booking.tripFileId ?? tripFileId}?tab=hotels`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!can(PERMISSIONS.HOTELS_CREATE)) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">{t.errors.FORBIDDEN}</p>
      </div>
    );
  }

  // Nights are shown as the server will calculate them, and a reversed range is
  // flagged before submitting rather than coming back as an error.
  const segmentIssue = (segment: SegmentInput): string | null => {
    if (!segment.checkIn || !segment.checkOut) return null;
    const nights = nightsBetween(
      new Date(`${segment.checkIn}T00:00:00Z`),
      new Date(`${segment.checkOut}T00:00:00Z`),
    );
    if (nights < 0) return t.errors.CHECKOUT_BEFORE_CHECKIN;
    if (nights === 0) return t.hotels.zeroNightWarning;
    return null;
  };

  const blocking = !tripFileId
    ? t.trips.tripFileRequired
    : segments.some((s) => !s.checkIn || !s.checkOut)
      ? t.hotels.datesRequired
      : segments.some((s) => {
          if (!s.checkIn || !s.checkOut) return false;
          return (
            nightsBetween(
              new Date(`${s.checkIn}T00:00:00Z`),
              new Date(`${s.checkOut}T00:00:00Z`),
            ) < 0
          );
        })
        ? t.errors.CHECKOUT_BEFORE_CHECKIN
        : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocking) return;
    create.mutate({
      tripFileId,
      partnerId: partnerId ?? undefined,
      bookingDate: bookingDate || undefined,
      confirmationNumber: confirmationNumber || undefined,
      securityApprovalRequired: securityApproval,
      notes: notes || undefined,
      segments: segments.map((s) => ({
        hotelId: s.hotelId ?? undefined,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        mealPlanId: s.mealPlanId ?? undefined,
        notes: s.notes || undefined,
        rooms: s.rooms
          .filter((r) => r.roomTypeId || r.quantity > 0)
          .map((r) => ({
            roomTypeId: r.roomTypeId ?? undefined,
            quantity: r.quantity,
            adults: r.adults ?? undefined,
            children: r.children ?? undefined,
          })),
      })),
    });
  };

  return (
    <>
      <PageHeader
        guideKey="page.hotelBookings"
        breadcrumb={
          tripFileId && trip.data ? (
            <Link href={`/trips/${tripFileId}?tab=hotels`} className="hover:text-foreground">
              {trip.data.reference}
            </Link>
          ) : (
            <Link href="/hotel-bookings" className="hover:text-foreground">
              {t.hotels.title}
            </Link>
          )
        }
        title={t.hotels.newBooking}
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
        </FormSection>

        <FormSection title={t.hotels.stays} description={t.hotels.staysHint}>
          <Repeatable
            items={segments}
            onChange={setSegments}
            makeEmpty={emptySegment}
            addLabel={t.hotels.addStay}
            itemLabel={(i) => `${t.hotels.stay} ${i + 1}`}
            renderItem={(segment, index, update) => {
              const issue = segmentIssue(segment);
              const nights =
                segment.checkIn && segment.checkOut
                  ? nightsBetween(
                      new Date(`${segment.checkIn}T00:00:00Z`),
                      new Date(`${segment.checkOut}T00:00:00Z`),
                    )
                  : null;
              return (
                <div className="space-y-3">
                  <Field label={t.hotels.hotel} htmlFor={`hotel-${index}`}>
                    <EntityPicker
                      id={`hotel-${index}`}
                      resource="/hotels"
                      value={segment.hotelId}
                      currentLabel={segment.hotelLabel}
                      onChange={(id, record) =>
                        update({
                          hotelId: id,
                          hotelLabel: (record?.name as string | undefined) ?? null,
                        })
                      }
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label={t.hotels.checkIn} htmlFor={`checkIn-${index}`} required>
                      <Input
                        id={`checkIn-${index}`}
                        type="date"
                        value={segment.checkIn}
                        onChange={(e) => update({ checkIn: e.target.value })}
                        required
                        invalid={Boolean(issue)}
                      />
                    </Field>
                    <Field label={t.hotels.checkOut} htmlFor={`checkOut-${index}`} required>
                      <Input
                        id={`checkOut-${index}`}
                        type="date"
                        value={segment.checkOut}
                        onChange={(e) => update({ checkOut: e.target.value })}
                        required
                        invalid={Boolean(issue)}
                      />
                    </Field>
                    <Field
                      label={t.hotels.nights}
                      hint={<HelpTip helpKey="field.nights" label={t.hotels.nights} />}
                    >
                      {/* Derived on the server; shown here so the range is obvious. */}
                      <div className="flex h-9 items-center px-1 text-sm tabular-nums text-muted-foreground">
                        {nights === null ? '—' : nights}
                      </div>
                    </Field>
                  </div>

                  {issue ? (
                    <p className="flex items-center gap-1.5 text-2xs text-danger">
                      <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                      {issue}
                    </p>
                  ) : null}

                  <Field label={t.hotels.mealPlan} htmlFor={`mealPlan-${index}`}>
                    <EntityPicker
                      id={`mealPlan-${index}`}
                      resource="/meal-plans"
                      value={segment.mealPlanId}
                      currentLabel={segment.mealPlanLabel}
                      onChange={(id, record) =>
                        update({
                          mealPlanId: id,
                          mealPlanLabel: (record?.name as string | undefined) ?? null,
                        })
                      }
                    />
                  </Field>

                  <div>
                    <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.hotels.rooms}
                    </p>
                    <Repeatable
                      items={segment.rooms}
                      onChange={(rooms) => update({ rooms })}
                      makeEmpty={emptyRoom}
                      addLabel={t.hotels.addRoom}
                      itemLabel={(i) => `${t.hotels.sectionRoom} ${i + 1}`}
                      maxItems={10}
                      renderItem={(room, roomIndex, updateRoom) => (
                        <div className="grid gap-3 sm:grid-cols-4">
                          <Field
                            label={t.hotels.roomType}
                            htmlFor={`roomType-${index}-${roomIndex}`}
                            className="sm:col-span-2"
                          >
                            <EntityPicker
                              id={`roomType-${index}-${roomIndex}`}
                              resource="/room-types"
                              value={room.roomTypeId}
                              currentLabel={room.roomTypeLabel}
                              onChange={(id, record) =>
                                updateRoom({
                                  roomTypeId: id,
                                  roomTypeLabel: (record?.name as string | undefined) ?? null,
                                })
                              }
                            />
                          </Field>
                          <Field
                            label={t.hotels.quantity}
                            htmlFor={`qty-${index}-${roomIndex}`}
                          >
                            <Input
                              id={`qty-${index}-${roomIndex}`}
                              type="number"
                              min={1}
                              max={99}
                              value={room.quantity}
                              onChange={(e) =>
                                updateRoom({ quantity: Number(e.target.value) || 1 })
                              }
                            />
                          </Field>
                          <Field label={t.trips.pax} htmlFor={`adults-${index}-${roomIndex}`}>
                            <Input
                              id={`adults-${index}-${roomIndex}`}
                              type="number"
                              min={0}
                              max={99}
                              value={room.adults ?? ''}
                              onChange={(e) =>
                                updateRoom({
                                  adults: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                            />
                          </Field>
                        </div>
                      )}
                    />
                  </div>

                  <Field label={t.common.notes} htmlFor={`segNotes-${index}`}>
                    <Textarea
                      id={`segNotes-${index}`}
                      rows={2}
                      maxLength={2000}
                      value={segment.notes}
                      onChange={(e) => update({ notes: e.target.value })}
                    />
                  </Field>
                </div>
              );
            }}
          />
        </FormSection>

        <FormSection title={t.hotels.sectionStatus}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.hotels.bookingDate} htmlFor="bookingDate">
              <Input
                id="bookingDate"
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
              />
            </Field>
            <Field label={t.hotels.confirmationNumber} htmlFor="confirmationNumber">
              <Input
                id="confirmationNumber"
                maxLength={120}
                value={confirmationNumber}
                onChange={(e) => setConfirmationNumber(e.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-3.5 accent-brand-700"
              checked={securityApproval}
              onChange={(e) => setSecurityApproval(e.target.checked)}
            />
            {t.hotels.securityApproval}
            <HelpTip helpKey="field.securityApproval" label={t.hotels.securityApproval} />
          </label>

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
            <Link href={tripFileId ? `/trips/${tripFileId}?tab=hotels` : '/hotel-bookings'}>
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

export default function NewHotelBookingPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <NewHotelBookingForm />
    </Suspense>
  );
}
