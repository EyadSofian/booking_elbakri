'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { calculateMargin, PERMISSIONS } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { EntityPicker } from '@/components/data/entity-picker';
import { Field, FormSection, Repeatable } from '@/components/forms/repeatable';
import { HelpTip } from '@/components/help/help-tip';

interface ApplicantInput {
  fullName: string;
  passportNumber: string;
  passportExpiry: string;
}

const emptyApplicant = (): ApplicantInput => ({
  fullName: '', passportNumber: '', passportExpiry: '',
});

interface TripSummary {
  id: string;
  reference: string;
  leadTraveler: { id: string; fullName: string } | null;
  partner: { id: string; name: string } | null;
}

function NewVisaForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t, locale, errorMessage } = useI18n();
  const { can } = useSession();

  const [tripFileId, setTripFileId] = useState<string | null>(params.get('tripFileId'));
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [originRaw, setOriginRaw] = useState('');
  const [destinationRaw, setDestinationRaw] = useState('');
  const [paxCount, setPaxCount] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [netAmount, setNetAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [notes, setNotes] = useState('');
  const [applicants, setApplicants] = useState<ApplicantInput[]>([]);

  const canSeeFinance = can(PERMISSIONS.VISAS_FINANCE_READ);

  const trip = useQuery({
    queryKey: ['trip', 'summary', tripFileId],
    queryFn: () => api.get<TripSummary>(`/trips/${tripFileId}`),
    enabled: Boolean(tripFileId),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ id: string; tripFileId: string }>('/visa-orders', body),
    onSuccess: (order) => {
      toast.success(t.visas.newOrder);
      router.push(`/trips/${order.tripFileId ?? tripFileId}?tab=visa`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!can(PERMISSIONS.VISAS_CREATE)) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">{t.errors.FORBIDDEN}</p>
      </div>
    );
  }

  const blocking = !tripFileId ? t.trips.tripFileRequired : null;

  // Shown live so the operator sees the margin before saving. The server
  // recalculates it on every read — this preview is never sent or stored.
  const marginPreview =
    netAmount && sellAmount
      ? calculateMargin(Number(sellAmount), Number(netAmount))
      : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocking) return;
    create.mutate({
      tripFileId,
      partnerId: partnerId ?? undefined,
      originRaw: originRaw || undefined,
      destinationRaw: destinationRaw || undefined,
      paxCount: paxCount ? Number(paxCount) : undefined,
      serviceDate: serviceDate || undefined,
      netAmount: canSeeFinance && netAmount ? Number(netAmount) : undefined,
      sellAmount: canSeeFinance && sellAmount ? Number(sellAmount) : undefined,
      currency,
      notes: notes || undefined,
      applicants: applicants
        .filter((a) => a.fullName.trim())
        .map((a) => ({
          fullName: a.fullName,
          passportNumber: a.passportNumber || undefined,
          passportExpiry: a.passportExpiry || undefined,
        })),
    });
  };

  return (
    <>
      <PageHeader
        guideKey="page.visas"
        breadcrumb={
          tripFileId && trip.data ? (
            <Link href={`/trips/${tripFileId}?tab=visa`} className="hover:text-foreground">
              {trip.data.reference}
            </Link>
          ) : (
            <Link href="/visas" className="hover:text-foreground">
              {t.visas.title}
            </Link>
          )
        }
        title={t.visas.newOrder}
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
            <Field label={t.visas.origin} htmlFor="originRaw">
              <Input
                id="originRaw" maxLength={200}
                value={originRaw} onChange={(e) => setOriginRaw(e.target.value)}
              />
            </Field>
            <Field label={t.visas.destination} htmlFor="destinationRaw">
              <Input
                id="destinationRaw" maxLength={200}
                value={destinationRaw} onChange={(e) => setDestinationRaw(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t.trips.agency} htmlFor="partnerId">
              <EntityPicker
                id="partnerId" resource="/partners" value={partnerId}
                currentLabel={trip.data?.partner?.name}
                onChange={(id) => setPartnerId(id)}
                placeholder={t.common.none}
              />
            </Field>
            <Field label={t.trips.pax} htmlFor="paxCount">
              <Input
                id="paxCount" type="number" min={0} max={999}
                value={paxCount} onChange={(e) => setPaxCount(e.target.value)}
              />
            </Field>
            <Field label={t.common.date} htmlFor="serviceDate">
              <Input
                id="serviceDate" type="date"
                value={serviceDate} onChange={(e) => setServiceDate(e.target.value)}
              />
            </Field>
          </div>
        </FormSection>

        {canSeeFinance ? (
          <FormSection title={t.trips.finance}>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label={t.visas.net} htmlFor="netAmount">
                <Input
                  id="netAmount" type="number" min={0} step="0.01"
                  value={netAmount} onChange={(e) => setNetAmount(e.target.value)}
                />
              </Field>
              <Field label={t.visas.sell} htmlFor="sellAmount">
                <Input
                  id="sellAmount" type="number" min={0} step="0.01"
                  value={sellAmount} onChange={(e) => setSellAmount(e.target.value)}
                />
              </Field>
              <Field label={t.finance.currency} htmlFor="currency">
                <select
                  id="currency" value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
                >
                  {['EGP', 'USD', 'EUR'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field
                label={t.visas.margin}
                hint={<HelpTip helpKey="field.visaMargin" label={t.visas.margin} />}
              >
                {/* Derived, never entered — the server computes it on every read. */}
                <div className="flex h-9 items-center px-1 text-sm font-medium tabular-nums">
                  {marginPreview === null
                    ? '—'
                    : formatMoney(marginPreview, currency, locale)}
                </div>
              </Field>
            </div>
            <p className="text-2xs text-muted-foreground">{t.visas.marginDerived}</p>
          </FormSection>
        ) : null}

        <FormSection title={t.visas.applicants} description={t.visas.applicantsHint}>
          <Repeatable
            items={applicants}
            onChange={setApplicants}
            makeEmpty={emptyApplicant}
            addLabel={t.visas.addApplicant}
            itemLabel={(i) => `${t.visas.applicants} ${i + 1}`}
            minItems={0}
            renderItem={(applicant, index, update) => (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t.common.name} htmlFor={`applicantName-${index}`} required>
                  <Input
                    id={`applicantName-${index}`} maxLength={200}
                    value={applicant.fullName}
                    onChange={(e) => update({ fullName: e.target.value })}
                  />
                </Field>
                <Field label={t.visas.passportNumber} htmlFor={`passport-${index}`}>
                  <Input
                    id={`passport-${index}`} maxLength={60} dir="ltr"
                    value={applicant.passportNumber}
                    onChange={(e) => update({ passportNumber: e.target.value })}
                  />
                </Field>
                <Field label={t.visas.passportExpiry} htmlFor={`expiry-${index}`}>
                  <Input
                    id={`expiry-${index}`} type="date"
                    value={applicant.passportExpiry}
                    onChange={(e) => update({ passportExpiry: e.target.value })}
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
            <Link href={tripFileId ? `/trips/${tripFileId}?tab=visa` : '/visas'}>
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

export default function NewVisaPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <NewVisaForm />
    </Suspense>
  );
}
