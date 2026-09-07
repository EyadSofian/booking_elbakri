'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Search, Tags, X } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export interface MasterRecord {
  id: string;
  name: string;
  nameAr?: string | null;
  code?: string | null;
  city?: string | null;
  type?: string | null;
  isActive?: boolean;
  aliases?: Array<{ id: string; alias: string }>;
  _count?: Record<string, number>;
}

export interface MasterDataPageProps {
  /** API resource path, e.g. `/hotels`. */
  resource: string;
  title: string;
  /** Extra columns beyond name and aliases. */
  extraColumns?: Column<MasterRecord>[];
  /** Fields offered in the create dialog, beyond the name. */
  createFields?: Array<{ name: string; label: string; type?: string; required?: boolean }>;
  canCreate?: boolean;
}

/**
 * The shared master-data screen.
 *
 * Every catalogue behaves the same way — a canonical record plus the alias
 * spellings that resolve to it — so they share one implementation rather than
 * eight near-identical files that drift apart.
 */
export function MasterDataPage({
  resource, title, extraColumns = [], createFields = [], canCreate = true,
}: MasterDataPageProps) {
  const { t, locale, errorMessage } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const { state, update, clearFilters, activeFilterCount } = useListQuery({
    sortBy: 'name', sortDir: 'asc',
  });
  const [searchInput, setSearchInput] = useState(state.q);
  const [createOpen, setCreateOpen] = useState(false);
  const [aliasFor, setAliasFor] = useState<MasterRecord | null>(null);

  const manage = can(PERMISSIONS.MASTER_DATA_MANAGE);

  const query = useQuery({
    queryKey: ['master-data', resource, state],
    queryFn: async () => {
      const result = await api.get<PaginatedResponse<MasterRecord> | MasterRecord[]>(resource, {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
      });
      // Some catalogues are small enough that the API returns a plain array.
      return Array.isArray(result)
        ? {
            data: result,
            meta: {
              page: 1, pageSize: result.length, total: result.length,
              totalPages: 1, hasNext: false, hasPrevious: false,
            },
          }
        : result;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['master-data', resource] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(resource, body),
    onSuccess: () => { toast.success(t.common.create); setCreateOpen(false); void invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const addAlias = useMutation({
    mutationFn: (body: { entityId: string; alias: string }) =>
      api.post('/aliases', { entityType: resource.replace('/', ''), ...body }),
    onSuccess: () => { toast.success(t.masterData.addAlias); setAliasFor(null); void invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const columns: Column<MasterRecord>[] = [
    {
      key: 'name', header: t.masterData.canonicalName, sortKey: 'name',
      alwaysVisible: true, mobile: 'title',
      cell: (row) => (
        <span className="block max-w-72 truncate font-medium">
          {(locale === 'ar' && row.nameAr) || row.name}
        </span>
      ),
    },
    ...extraColumns,
    {
      key: 'aliases', header: t.masterData.aliases, mobile: 'field',
      cell: (row) => {
        const aliases = row.aliases ?? [];
        if (!aliases.length) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="flex flex-wrap items-center gap-1">
            {aliases.slice(0, 3).map((a) => (
              <Badge key={a.id} variant="outline" className="font-mono">
                {a.alias}
              </Badge>
            ))}
            {aliases.length > 3 ? (
              <span className="text-2xs text-muted-foreground">+{aliases.length - 3}</span>
            ) : null}
          </span>
        );
      },
    },
    ...(manage
      ? ([
          {
            key: 'actions', header: t.common.actions, mobile: 'hidden',
            cell: (row: MasterRecord) => (
              <span onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" onClick={() => setAliasFor(row)}>
                  <Tags className="size-3.5" aria-hidden />
                  <span className="hidden lg:inline">{t.masterData.addAlias}</span>
                </Button>
              </span>
            ),
          },
        ] as Column<MasterRecord>[])
      : []),
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
        actions={
          manage && canCreate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{t.common.create}</span>
            </Button>
          ) : null
        }
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
        toolbar={
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); update({ q: searchInput }); }}
              className="relative min-w-0 flex-1 sm:max-w-xs"
            >
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.common.search}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.common.create}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const body: Record<string, unknown> = { name: String(form.get('name')) };
              for (const field of createFields) {
                const value = String(form.get(field.name) ?? '');
                if (value) body[field.name] = value;
              }
              create.mutate(body);
            }}
          >
            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" required>{t.masterData.canonicalName}</Label>
                <Input id="name" name="name" required autoFocus maxLength={200} />
              </div>
              {createFields.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <Label htmlFor={field.name} required={field.required}>{field.label}</Label>
                  <Input
                    id={field.name} name={field.name}
                    type={field.type ?? 'text'} required={field.required} maxLength={200}
                  />
                </div>
              ))}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" loading={create.isPending}>{t.common.create}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(aliasFor)} onOpenChange={(open) => !open && setAliasFor(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.masterData.addAlias}</DialogTitle>
          </DialogHeader>
          {aliasFor ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                addAlias.mutate({ entityId: aliasFor.id, alias: String(form.get('alias')) });
              }}
            >
              <DialogBody className="space-y-4">
                <p className="text-xs">
                  <span className="text-muted-foreground">{t.masterData.canonicalName}:</span>{' '}
                  <span className="font-medium">{aliasFor.name}</span>
                </p>

                {aliasFor.aliases?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {aliasFor.aliases.map((a) => (
                      <Badge key={a.id} variant="outline" className="font-mono">
                        <Check className="size-3" aria-hidden />
                        {a.alias}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="alias" required>{t.masterData.alias}</Label>
                  <Input id="alias" name="alias" required autoFocus maxLength={200} />
                  <p className="text-2xs text-muted-foreground">
                    An approved alias resolves deterministically on every future import — that is
                    what stops two spellings becoming two records.
                  </p>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAliasFor(null)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" loading={addAlias.isPending}>{t.common.save}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
