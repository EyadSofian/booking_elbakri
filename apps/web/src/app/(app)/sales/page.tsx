'use client';

import { Suspense, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, ShoppingBag } from 'lucide-react';
import { SALE_LINE_KINDS, type CurrencyCode, type ListResponse, type SaleItem, type Status } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useInvalidate } from '@/lib/queries';
import { cn, compact } from '@/lib/utils';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/shared/field';
import { DateText, Money, RefTag, Txt } from '@/components/shared/format';
import { StatusMenu } from '@/components/shared/status';
import { EmptyState, ErrorState, RowsSkeleton } from '@/components/shared/feedback';
import { ExportButton, Pagination, SearchBox } from '@/components/shared/list-controls';
import { SellerSelect } from '@/components/shared/pickers';
import { LINE_ICON, lineLabel } from '@/components/sales/sale-form';

interface Totals {
  currency: CurrencyCode;
  count: number;
  totalSell: number;
  totalCost: number;
  totalProfit: number;
  commission: number;
  paid: number;
  remaining: number;
}

type When = 'this-month' | 'upcoming' | 'past' | 'all';
const PAGE_SIZE = 50;

function SalesList() {
  const { t, statusLabel, errorMessage } = useI18n();
  const { is } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const invalidate = useInvalidate();

  const when = (params.get('when') as When | null) ?? 'all';
  const dateBy = (params.get('by') as 'sale' | 'trip' | null) ?? 'sale';
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const sellerId = params.get('seller') ?? '';
  const balance = params.get('balance') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;

  const setParams = useCallback(
    (changes: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (!v) next.delete(k);
        else next.set(k, v);
      }
      if (resetPage && !('page' in changes)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const listParams = compact({
    when: when === 'all' ? undefined : when,
    dateBy,
    status,
    q,
    sellerId,
    balance,
    page,
    pageSize: PAGE_SIZE,
  });
  const list = useQuery({
    queryKey: ['/sales', 'list', listParams],
    queryFn: () => api.get<ListResponse<SaleItem> & { totals: Totals[] }>('/sales', listParams),
    placeholderData: keepPreviousData,
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, s }: { id: string; s: Status }) => api.patch<SaleItem>(`/sales/${id}/status`, { status: s }),
    onSuccess: () => {
      toast.success(t.common.statusChanged);
      invalidate('/sales');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = list.data?.data ?? [];
  const counts = list.data?.counts;
  const canEdit = is('SALES');

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        icon={ShoppingBag}
        title={t.sales.title}
        subtitle={t.sales.subtitle}
        actions={
          <>
            <ExportButton endpoint="/sales" params={listParams} />
            {canEdit ? (
              <Button asChild>
                <Link href="/sales/new">
                  <Plus />
                  {t.sales.new}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 animate-rise [animation-delay:60ms]">
        <Segmented<When>
          name="when"
          value={when}
          onChange={(w) => setParams({ when: w === 'all' ? null : w })}
          options={[
            { value: 'all', label: t.common.anyDate },
            { value: 'this-month', label: t.common.thisMonth },
            { value: 'upcoming', label: t.common.upcoming },
            { value: 'past', label: t.common.past },
          ]}
        />
        <NativeSelect value={dateBy} onChange={(e) => setParams({ by: e.target.value === 'sale' ? null : e.target.value })} className="w-auto" aria-label={t.sales.dateBy}>
          <option value="sale">
            {t.sales.dateBy}: {t.sales.bySaleDate}
          </option>
          <option value="trip">
            {t.sales.dateBy}: {t.sales.byTripDate}
          </option>
        </NativeSelect>
        <SearchBox value={q} onChange={(v) => setParams({ q: v })} placeholder={`${t.common.search}: ${t.sales.customerName}، ${t.sales.phone}، ${t.sales.destination}…`} className="min-w-[14rem] flex-1" />
        <div className="w-44">
          <SellerSelect value={sellerId || null} onChange={(v) => setParams({ seller: v })} includeAll allLabel={`${t.sales.seller}: ${t.common.all}`} />
        </div>
        <NativeSelect value={balance} onChange={(e) => setParams({ balance: e.target.value })} className="w-auto" aria-label={t.sales.filterBalance}>
          <option value="">
            {t.sales.filterBalance}: {t.common.all}
          </option>
          <option value="due">{t.sales.owes}</option>
          <option value="paid">{t.sales.settled}</option>
        </NativeSelect>
      </div>

      <div className="mb-3 overflow-x-auto animate-rise [animation-delay:90ms]">
        <Segmented<string>
          name="status"
          size="sm"
          value={status}
          onChange={(s) => setParams({ status: s })}
          options={[
            { value: '', label: t.common.all, count: counts?.ALL ?? null },
            ...(['NEW', 'IN_PROGRESS', 'CONFIRMED', 'DONE', 'CANCELLED'] as Status[]).map((s) => ({
              value: s,
              label: statusLabel(s),
              count: counts?.[s] ?? null,
            })),
          ]}
        />
      </div>

      {list.data?.totals.length ? (
        <div className="mb-3 grid gap-2 animate-rise [animation-delay:110ms] sm:grid-cols-2 xl:grid-cols-1">
          {list.data.totals.map((tot) => (
            <div key={tot.currency} className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs sm:grid-cols-3 xl:grid-cols-6">
              {(
                [
                  [t.sales.totalSell, tot.totalSell, ''],
                  [t.sales.totalCost, tot.totalCost, 'text-muted-foreground'],
                  [t.sales.totalProfit, tot.totalProfit, tot.totalProfit < 0 ? 'text-danger' : 'text-success'],
                  [t.sales.sellerCommission, tot.commission, ''],
                  [t.sales.paid, tot.paid, 'text-success'],
                  [t.sales.remaining, tot.remaining, tot.remaining > 0 ? 'text-sun-foreground dark:text-sun' : ''],
                ] as const
              ).map(([label, value, cls]) => (
                <div key={label}>
                  <p className="text-[0.7rem] text-muted-foreground">
                    {label} · {tot.count}
                  </p>
                  <Money value={value} currency={tot.currency} className={cn('text-[0.95rem] font-semibold', cls)} />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs animate-rise [animation-delay:130ms]">
        {list.isLoading ? (
          <RowsSkeleton cols={8} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !rows.length ? (
          <EmptyState
            action={
              canEdit ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/sales/new">
                    <Plus />
                    {t.sales.new}
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <div className={cn('scroll-thin max-h-[calc(100dvh-20rem)] overflow-auto', list.isFetching && 'opacity-70 transition-opacity')}>
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    {[
                      t.common.reference, t.sales.saleDate, t.sales.customerName, t.sales.destination, t.sales.datesSection,
                      t.sales.totalSell, t.sales.totalProfit, t.sales.remaining, t.sales.seller, t.sales.items, t.common.status,
                    ].map((h, i, all) => (
                      <th
                        key={h}
                        className={cn(
                          'sticky top-0 z-10 whitespace-nowrap border-b bg-surface-muted px-3 py-2.5 text-start text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground',
                          // The status stays in view while the table scrolls sideways.
                          i === all.length - 1 && 'end-0 z-20 border-s',
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr
                      key={s.id}
                      tabIndex={0}
                      onClick={() => router.push(`/sales/${s.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && router.push(`/sales/${s.id}`)}
                      className={cn('group cursor-pointer outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted', s.status === 'CANCELLED' && 'text-muted-foreground')}
                    >
                      <td className="border-b px-3 py-2.5 align-top"><RefTag value={s.ref} /></td>
                      <td className="border-b px-3 py-2.5 align-top"><DateText value={s.saleDate} /></td>
                      <td className="border-b px-3 py-2.5 align-top">
                        <div className="max-w-[14rem]">
                          <div className="truncate font-medium">
                            <Txt>{s.customerName}</Txt>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            <Txt>{[s.phone, s.nationality].filter(Boolean).join(' · ') || '—'}</Txt>
                          </div>
                        </div>
                      </td>
                      <td className="border-b px-3 py-2.5 align-top">
                        <div className="max-w-[13rem]">
                          <div className="truncate">
                            <Txt>{s.destination ?? '—'}</Txt>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            <Txt>{s.hotelName ?? ''}</Txt>
                          </div>
                        </div>
                      </td>
                      <td className="border-b px-3 py-2.5 align-top">
                        <div className="whitespace-nowrap">
                          <DateText value={s.startDate} />
                          {s.endDate ? <> {t.common.arrow} <DateText value={s.endDate} /></> : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.nights != null ? `${t.common.night(s.nights)} · ` : ''}
                          {s.adults}
                          {s.children ? ` + ${s.children}` : ''} {t.common.pax}
                        </div>
                      </td>
                      <td className="border-b px-3 py-2.5 align-top"><Money value={s.totalSell} currency={s.currency} className="font-medium" /></td>
                      <td className="border-b px-3 py-2.5 align-top"><Money value={s.totalProfit} currency={s.currency} signed /></td>
                      <td className="border-b px-3 py-2.5 align-top">
                        {s.remaining > 0 ? (
                          <Money value={s.remaining} currency={s.currency} className="font-medium text-sun-foreground dark:text-sun" />
                        ) : (
                          <Badge variant="success">{t.sales.paidInFull}</Badge>
                        )}
                      </td>
                      <td className="border-b px-3 py-2.5 align-top"><span className="whitespace-nowrap">{s.seller?.name ?? '—'}</span></td>
                      <td className="border-b px-3 py-2.5 align-top">
                        <LineKinds sale={s} />
                      </td>
                      <td className="sticky end-0 border-b border-s bg-card px-3 py-2.5 align-top transition-colors group-hover:bg-surface-muted group-focus-visible:bg-surface-muted">
                        <StatusMenu status={s.status} onChange={(st) => changeStatus.mutate({ id: s.id, s: st })} disabled={!s.canEdit} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={(p) => setParams({ page: String(p) }, false)} />
          </>
        )}
      </div>
    </div>
  );
}

/** What the sale holds, e.g. 🛏 2 · ✈ 1 — hover for the names. */
function LineKinds({ sale }: { sale: SaleItem }) {
  const { t } = useI18n();
  const kinds = SALE_LINE_KINDS.map((kind) => ({ kind, lines: sale.lines.filter((l) => l.kind === kind) })).filter((k) => k.lines.length);
  if (!kinds.length) return <span className="text-muted-foreground/60">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {kinds.map(({ kind, lines }) => {
        const Icon = LINE_ICON[kind];
        const names = lines.map((l) => l.title).filter(Boolean).join('، ');
        return (
          <Badge key={kind} variant="outline" className="gap-1" title={`${lineLabel(t, kind)}${names ? `: ${names}` : ''}`}>
            <Icon className="size-3" />
            <span className="tabular">{lines.length}</span>
          </Badge>
        );
      })}
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={null}>
      <SalesList />
    </Suspense>
  );
}
