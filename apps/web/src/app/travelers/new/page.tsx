'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeForSearch, PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { debounce } from '@/lib/utils';
import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { EntityPicker } from '@/components/data/entity-picker';
import { Field, FormSection } from '@/components/forms/repeatable';

interface ExistingTraveler {
  id: string;
  fullName: string;
  phoneRaw: string | null;
  phoneNormalized: string | null;
}

export default function NewTravelerPage() {
  const router = useRouter();
  const { t, errorMessage } = useI18n();
  const { can } = useSession();

  const [fullName, setFullName] = useState('');
  const [fullNameAr, setFullNameAr] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nationalityId, setNationalityId] = useState<string | null>(null);
  const [passportNumber, setPassportNumber] = useState('');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [probe, setProbe] = useState('');

  const setProbeDebounced = useMemo(() => debounce((v: string) => setProbe(v), 350), []);

  // Warns before creating a second record for someone already known. The
  // system will not merge on a resemblance, so avoiding the duplicate up front
  // is cheaper than reconciling it later.
  const similar = useQuery({
    queryKey: ['travelers', 'duplicate-probe', probe],
    queryFn: () =>
      api.get<PaginatedResponse<ExistingTraveler>>('/travelers', { q: probe, pageSize: 4 }),
    enabled: normalizeForSearch(probe).length >= 3,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ id: string }>('/travelers', body),
    onSuccess: (traveler) => {
      toast.success(t.nav.travelers);
      router.push(`/travelers/${traveler.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!can(PERMISSIONS.TRAVELERS_CREATE)) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">{t.errors.FORBIDDEN}</p>
      </div>
    );
  }

  const matches = similar.data?.data ?? [];

  return (
    <>
      <PageHeader
        guideKey="page.travelers"
        breadcrumb={
          <Link href="/travelers" className="hover:text-foreground">
            {t.nav.travelers}
          </Link>
        }
        title={t.travelers.newTraveler}
      />

      <form
        className="max-w-2xl space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            fullName,
            fullNameAr: fullNameAr || undefined,
            phone: phone || undefined,
            email: email || undefined,
            nationalityId: nationalityId ?? undefined,
            passportNumber: passportNumber || undefined,
            partnerId: partnerId ?? undefined,
            notes: notes || undefined,
          });
        }}
      >
        <FormSection title={t.auth.profile}>
          <Field label={t.common.name} htmlFor="fullName" required>
            <Input
              id="fullName" required maxLength={200} autoFocus
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setProbeDebounced(e.target.value);
              }}
            />
          </Field>

          {matches.length > 0 ? (
            <div className="rounded-md bg-warning-subtle px-3 py-2.5 text-xs text-warning">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                {t.travelers.possibleDuplicate}
              </p>
              <ul className="mt-1.5 space-y-1">
                {matches.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/travelers/${m.id}`}
                      className="underline underline-offset-2 hover:no-underline"
                    >
                      {m.fullName}
                    </Link>
                    {m.phoneNormalized || m.phoneRaw ? (
                      <span className="ms-2 opacity-80" dir="ltr">
                        {m.phoneNormalized ?? m.phoneRaw}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Field label={`${t.common.name} (AR)`} htmlFor="fullNameAr">
            <Input
              id="fullNameAr" maxLength={200} dir="rtl"
              value={fullNameAr} onChange={(e) => setFullNameAr(e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.common.phone} htmlFor="phone">
              <Input
                id="phone" maxLength={60} dir="ltr" inputMode="tel"
                value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+20…"
              />
            </Field>
            <Field label={t.auth.email} htmlFor="email">
              <Input
                id="email" type="email" maxLength={200} dir="ltr"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.common.nationality} htmlFor="nationalityId">
              <EntityPicker
                id="nationalityId" resource="/nationalities"
                value={nationalityId} onChange={(id) => setNationalityId(id)}
              />
            </Field>
            <Field label={t.visas.passportNumber} htmlFor="passportNumber">
              <Input
                id="passportNumber" maxLength={60} dir="ltr"
                value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)}
              />
            </Field>
          </div>

          <Field label={t.trips.agency} htmlFor="partnerId">
            <EntityPicker
              id="partnerId" resource="/partners" value={partnerId}
              onChange={(id) => setPartnerId(id)} placeholder={t.common.none}
            />
          </Field>

          <Field label={t.common.notes} htmlFor="notes">
            <Textarea
              id="notes" rows={3} maxLength={4000}
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </FormSection>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/travelers">{t.common.cancel}</Link>
          </Button>
          <Button type="submit" disabled={!fullName.trim()} loading={create.isPending}>
            {t.common.create}
          </Button>
        </div>
      </form>
    </>
  );
}
