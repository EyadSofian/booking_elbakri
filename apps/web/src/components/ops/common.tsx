'use client';

import type { OpsBase } from '@elbakri/shared';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { todayIso } from '@/lib/utils';
import { Money, RefTag, Txt } from '@/components/shared/format';
import { int, num, str, toStr, type Draft } from './draft';

/** The shared part of every booking's form state. */
export function baseEmpty(extra: Draft = {}): Draft {
  return {
    status: 'NEW', guestName: '', phone: '', nationality: '', agencyId: '', agencyName: '',
    currency: 'EGP', cost: '', sell: '', notes: '', ...extra,
  };
}

export function baseToDraft(row: OpsBase): Draft {
  return {
    status: row.status,
    guestName: row.guestName,
    phone: toStr(row.phone),
    nationality: toStr(row.nationality),
    agencyId: row.agency?.id ?? '',
    agencyName: row.agency?.name ?? '',
    currency: row.currency,
    cost: toStr(row.cost),
    sell: toStr(row.sell),
    notes: toStr(row.notes),
  };
}

export function basePayload(d: Draft): Record<string, unknown> {
  return {
    status: d.status || 'NEW',
    guestName: (d.guestName ?? '').trim(),
    phone: str(d.phone),
    nationality: str(d.nationality),
    agencyId: d.agencyId || null,
    currency: d.currency || 'EGP',
    cost: num(d.cost),
    sell: num(d.sell),
    notes: str(d.notes),
  };
}

export function requireFields(d: Draft, t: Dictionary, fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f, (d[f] ?? '').trim() ? '' : t.common.required]));
}

export const today = () => todayIso();
export { int, num, str, toStr };

export function Sub({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-0.5 truncate text-xs text-muted-foreground">
      <Txt>{children}</Txt>
    </div>
  );
}

export function GuestCell({ row }: { row: OpsBase }) {
  return (
    <div className="min-w-[9rem] max-w-[13rem]">
      <div className="truncate font-medium">
        <Txt>{row.guestName}</Txt>
      </div>
      <Sub>
        {[row.nationality, row.phone].filter(Boolean).join(' · ') || '—'}
      </Sub>
    </div>
  );
}

export function AgencyCell({ row, t }: { row: OpsBase; t: Dictionary }) {
  return (
    <div className="max-w-[8.5rem]">
      <div className="truncate">
        <Txt>{row.agency?.name ?? '—'}</Txt>
      </div>
    </div>
  );
}

export const refColumn = {
  key: 'ref',
  header: (t: Dictionary) => t.common.reference,
  cell: (row: OpsBase) => <RefTag value={row.ref} />,
  sortKey: 'number',
  className: 'w-20',
};

export function priceItems(row: OpsBase, t: Dictionary, costLabel?: string) {
  return [
    { label: costLabel ?? t.common.cost, value: <Money value={row.cost} currency={row.currency} /> },
    { label: t.common.sell, value: <Money value={row.sell} currency={row.currency} /> },
    {
      label: t.common.profit,
      value:
        row.cost != null && row.sell != null ? <Money value={Math.round((row.sell - row.cost) * 100) / 100} currency={row.currency} signed /> : '—',
    },
  ];
}
