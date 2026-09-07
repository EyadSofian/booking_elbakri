'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import type { PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TravelerRow {
  id: string;
  fullName: string;
  fullNameAr: string | null;
  phoneRaw: string | null;
  phoneNormalized: string | null;
  phoneDigits: string | null;
  email: string | null;
  nationalityRaw: string | null;
  nationality: { id: string; name: string; nameAr: string | null } | null;
  partner: { id: string; name: string } | null;
  createdAt: string;
  _count: { tripFiles: number };
}

export default function TravelersPage() {
  const { t, locale } = useI18n();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({
    sortBy: 'fullName', sortDir: 'asc',
  });
  const [searchInput, setSearchInput] = useState(state.q);

  const query = useQuery({
    queryKey: ['travelers', state],
    queryFn: () =>
      api.get<PaginatedResponse<TravelerRow>>('/travelers', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
        ...state.filters,
      }),
  });

  const columns: Column<TravelerRow>[] = [
    {
      key: 'name', header: t.common.name, sortKey: 'fullName',
      alwaysVisible: true, mobile: 'title',
      cell: (row) => (
        <span className="block max-w-64 truncate font-medium">
          {/* The display name is always the original text, never its search form. */}
          {(locale === 'ar' && row.fullNameAr) || row.fullName}
        </span>
      ),
    },
    {
      key: 'phone', header: t.common.phone, mobile: 'subtitle',
      cell: (row) => (
        <span dir="ltr" className="tabular-nums">
          {row.phoneNormalized ?? row.phoneRaw ?? '—'}
        </span>
      ),
    },
    {
      key: 'nationality', header: t.common.nationality,
      cell: (row) =>
        (locale === 'ar' ? row.nationality?.nameAr : row.nationality?.name) ??
        row.nationalityRaw ?? '—',
    },
    {
      key: 'partner', header: t.trips.agency,
      cell: (row) => row.partner?.name ?? '—',
    },
    {
      key: 'trips', header: t.nav.tripFiles,
      cell: (row) => <span className="tabular-nums">{row._count?.tripFiles ?? 0}</span>,
    },
    {
      key: 'email', header: t.auth.email, defaultHidden: true,
      cell: (row) => <span dir="ltr">{row.email ?? '—'}</span>,
    },
    {
      key: 'createdAt', header: t.common.date, sortKey: 'createdAt', defaultHidden: true,
      cell: (row) => <span className="tabular-nums">{formatDate(row.createdAt, locale)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title={t.nav.travelers}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
      />

      <DataTable
        columns={columns}
        rows={query.data?.data ?? []}
        meta={query.data?.meta}
        loading={query.isFetching}
        error={query.error}
        rowKey={(row) => row.id}
        sortBy={state.sortBy}
        sortDir={state.sortDir}
        onSortChange={(sortBy, sortDir) => update({ sortBy, sortDir })}
        onPageChange={(page) => update({ page })}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        onRefresh={() => query.refetch()}
        mobileBadge={(row) =>
          row._count?.tripFiles ? <Badge variant="outline">{row._count.tripFiles}</Badge> : null
        }
        toolbar={
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); update({ q: searchInput }); }}
              className="relative min-w-0 flex-1 sm:max-w-sm"
            >
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={`${t.common.search} — ${t.common.name}, ${t.common.phone}`}
                className="h-8 ps-8 text-xs"
              />
            </form>
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); clearFilters(); }}>
                <X className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.common.clearFilters}</span>
              </Button>
            ) : null}
          </>
        }
      />
    </>
  );
}
