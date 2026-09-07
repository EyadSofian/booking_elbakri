'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Link2, Plus, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { cn, debounce, formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/data/empty-state';
import { HelpNotice, HelpTip } from '@/components/help/help-tip';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { AliasSuggestion } from './types';

/** Which master-data endpoint backs each entity type's picker. */
const ENTITY_RESOURCE: Record<string, string> = {
  HOTEL: '/hotels',
  PARTNER: '/partners',
  ROOM_TYPE: '/room-types',
  MEAL_PLAN: '/meal-plans',
  LOCATION: '/locations',
  EXCURSION: '/excursions',
  NATIONALITY: '/nationalities',
};

interface CanonicalRecord {
  id: string;
  name: string;
  nameAr?: string | null;
  region?: string | null;
  city?: string | null;
}

/**
 * The matching queue.
 *
 * Values the importer could not resolve deterministically land here. Nothing on
 * this screen has been applied — each row is a decision waiting for someone who
 * knows the business, and that decision is remembered so every future import
 * resolves the same spelling without asking again.
 */
export function MatchingQueue({ importRunId }: { importRunId?: string }) {
  const { t, locale, errorMessage } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();

  const [entityType, setEntityType] = useState('');
  const [status, setStatus] = useState('SUGGESTED');
  const [linking, setLinking] = useState<AliasSuggestion | null>(null);

  const canManage = can(PERMISSIONS.MASTER_DATA_MANAGE);

  const query = useQuery({
    queryKey: ['alias-suggestions', { importRunId, entityType, status }],
    queryFn: () =>
      api.get<PaginatedResponse<AliasSuggestion>>('/alias-suggestions', {
        pageSize: 100,
        importRunId: importRunId || undefined,
        entityType: entityType || undefined,
        status: status || undefined,
      }),
  });

  /** Everything a decision touches has to refresh, or the counts go stale. */
  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['alias-suggestions'] });
    void queryClient.invalidateQueries({ queryKey: ['import'] });
    void queryClient.invalidateQueries({ queryKey: ['imports'] });
    void queryClient.invalidateQueries({ queryKey: ['data-quality'] });
    void queryClient.invalidateQueries({ queryKey: ['master-data'] });
    void queryClient.invalidateQueries({ queryKey: ['hotels'] });
    void queryClient.invalidateQueries({ queryKey: ['partners'] });
  };

  const approve = useMutation({
    mutationFn: (input: { id: string; targetId: string }) =>
      api.post(`/alias-suggestions/${input.id}/approve`, { targetId: input.targetId }),
    onSuccess: () => {
      toast.success(t.masterData.linkToExisting);
      setLinking(null);
      refreshAll();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const promote = useMutation({
    mutationFn: (id: string) => api.post(`/alias-suggestions/${id}/promote`),
    onSuccess: () => { toast.success(t.masterData.createNew); refreshAll(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/alias-suggestions/${id}/reject`),
    onSuccess: () => { toast.success(t.masterData.reject); refreshAll(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = query.data?.data ?? [];
  const entityTypes = useMemo(
    () => [...new Set(rows.map((r) => r.entityType))].sort(),
    [rows],
  );

  return (
    <>
      <HelpNotice noticeKey="notice.matchingTeaches" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-surface px-2 text-xs"
          aria-label={t.common.status}
        >
          <option value="SUGGESTED">{t.status.SUGGESTED}</option>
          <option value="APPROVED">{t.status.APPROVED}</option>
          <option value="REJECTED">{t.status.REJECTED}</option>
          <option value="">{t.common.all}</option>
        </select>

        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="h-8 rounded-md border border-input bg-surface px-2 text-xs"
          aria-label={t.masterData.title}
        >
          <option value="">{t.common.all}</option>
          {entityTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <span className="ms-auto text-2xs text-muted-foreground">
          {rows.length} {t.dataQuality.openIssues.toLowerCase()}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-14 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Check}
              title={t.masterData.allResolved}
              description={t.masterData.allResolvedHint}
            />
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        {/* The raw value, exactly as the workbook wrote it. */}
                        <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs">
                          {row.rawValue}
                        </code>
                        <Badge variant="outline">{row.entityType}</Badge>
                        {row.occurrences > 1 ? (
                          <span className="text-2xs text-muted-foreground">
                            {row.occurrences}× {t.masterData.occurrences.toLowerCase()}
                          </span>
                        ) : null}
                        {row.status !== 'SUGGESTED' ? (
                          <Badge variant={row.status === 'APPROVED' ? 'success' : 'default'}>
                            {t.status[row.status as keyof typeof t.status] ?? row.status}
                          </Badge>
                        ) : null}
                      </p>

                      {row.suggestedName ? (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Sparkles className="size-3 shrink-0" aria-hidden />
                          {t.masterData.suggestedMatch}:{' '}
                          <span className="font-medium text-foreground">{row.suggestedName}</span>
                          {row.score !== null ? (
                            <span className="inline-flex items-center gap-1">
                              <Badge variant="info">{Math.round(row.score * 100)}%</Badge>
                              <HelpTip
                                helpKey="field.matchConfidence"
                                label={t.masterData.confidence}
                              />
                            </span>
                          ) : null}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {t.masterData.noSuggestion}
                        </p>
                      )}

                      <p className="mt-1 text-2xs text-muted-foreground">
                        {formatDate(row.createdAt, locale)}
                      </p>
                    </div>

                    {canManage && row.status === 'SUGGESTED' ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {row.suggestedId ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              approve.mutate({ id: row.id, targetId: row.suggestedId! })
                            }
                            loading={approve.isPending}
                          >
                            <Check className="size-3.5" aria-hidden />
                            {t.masterData.linkToExisting}
                          </Button>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={() => setLinking(row)}>
                          <Link2 className="size-3.5" aria-hidden />
                          {t.masterData.chooseRecord}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => promote.mutate(row.id)}
                          loading={promote.isPending}
                        >
                          <Plus className="size-3.5" aria-hidden />
                          {t.masterData.createNew}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reject.mutate(row.id)}
                          loading={reject.isPending}
                        >
                          <X className="size-3.5" aria-hidden />
                          {t.masterData.reject}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CanonicalPicker
        suggestion={linking}
        onClose={() => setLinking(null)}
        onPick={(targetId) =>
          linking && approve.mutate({ id: linking.id, targetId })
        }
        pending={approve.isPending}
      />
    </>
  );
}

/** Searchable picker over the canonical records for one entity type. */
function CanonicalPicker({
  suggestion, onClose, onPick, pending,
}: {
  suggestion: AliasSuggestion | null;
  onClose: () => void;
  onPick: (targetId: string) => void;
  pending: boolean;
}) {
  const { t, locale } = useI18n();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  const setSearchDebounced = useMemo(() => debounce((v: string) => setSearch(v), 220), []);
  const resource = suggestion ? ENTITY_RESOURCE[suggestion.entityType] : null;

  const query = useQuery({
    queryKey: ['canonical-picker', resource, search],
    queryFn: async () => {
      const r = await api.get<PaginatedResponse<CanonicalRecord> | CanonicalRecord[]>(
        resource as string,
        { q: search || undefined, pageSize: 25 },
      );
      return Array.isArray(r) ? r : r.data;
    },
    enabled: Boolean(resource && suggestion),
  });

  return (
    <Dialog open={Boolean(suggestion)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t.masterData.linkToExisting}</DialogTitle>
        </DialogHeader>
        {suggestion ? (
          <DialogBody className="space-y-3">
            <p className="rounded-md bg-surface-muted px-3 py-2 text-xs">
              <span className="text-muted-foreground">{t.dataQuality.rawValue}: </span>
              <code className="font-mono">{suggestion.rawValue}</code>
            </p>

            {!resource ? (
              <p className="text-xs text-warning">
                {t.masterData.noPickerForType} ({suggestion.entityType})
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="canonicalSearch">{t.common.search}</Label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="canonicalSearch"
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        setSearchDebounced(e.target.value);
                      }}
                      className="ps-8"
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                </div>

                <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                  {query.isFetching ? (
                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {t.common.loading}
                    </li>
                  ) : (query.data?.length ?? 0) === 0 ? (
                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {t.common.noResults}
                    </li>
                  ) : (
                    query.data!.map((record) => (
                      <li key={record.id}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onPick(record.id)}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 px-3 py-2 text-start',
                            'transition-colors hover:bg-accent/40 disabled:opacity-50',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm">
                              {(locale === 'ar' && record.nameAr) || record.name}
                            </span>
                            {record.region || record.city ? (
                              <span className="block truncate text-2xs text-muted-foreground">
                                {record.region ?? record.city}
                              </span>
                            ) : null}
                          </span>
                          {record.id === suggestion.suggestedId ? (
                            <Badge variant="info">{t.masterData.suggestedMatch}</Badge>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.common.cancel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
