'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownUp, ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { ATTACHMENT_KINDS_FOR, type EntityType, type OpsBase, type Status } from '@elbakri/shared';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { ApiError, api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useActivity, useInvalidate, useList, useRecord } from '@/lib/queries';
import { cn, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle, DialogDescription, SheetContent } from '@/components/ui/dialog';
import { StatusMenu } from '@/components/shared/status';
import { DateText, RefTag, Txt } from '@/components/shared/format';
import { FormSection, Segmented } from '@/components/shared/field';
import { ConfirmDialog, EmptyState, ErrorState, RowsSkeleton } from '@/components/shared/feedback';
import { ExportButton, Pagination, SearchBox } from '@/components/shared/list-controls';
import { AgencyFilter } from '@/components/shared/pickers';
import { ActivityList } from '@/components/shared/activity-list';
import { Attachments, uploadPending, type PendingFile } from '@/components/shared/attachments';
import { useDraft, type Draft } from './draft';

export interface Ctx {
  t: Dictionary;
  locale: string;
  statusLabel: (s: Status, type?: EntityType) => string;
}

export interface Column<T> {
  key: string;
  header: (t: Dictionary) => React.ReactNode;
  cell: (row: T, ctx: Ctx) => React.ReactNode;
  sortKey?: string;
  className?: string;
}

export interface FormProps<T> {
  draft: Draft;
  set: (key: string, value: string) => void;
  errors: Record<string, string>;
  record?: T;
}

type When = 'upcoming' | 'today' | 'tomorrow' | 'past' | 'all';

export interface OpsConfig<T extends OpsBase> {
  type: 'HOTEL' | 'TRANSFER' | 'EXCURSION' | 'VISA' | 'FLIGHT';
  endpoint: string;
  icon: LucideIcon;
  title: (t: Dictionary) => string;
  subtitle: (t: Dictionary) => string;
  searchPlaceholder: (t: Dictionary) => string;
  columns: Column<T>[];
  /** The phone layout: one card per booking. */
  card: (row: T, ctx: Ctx) => { title: React.ReactNode; lines: React.ReactNode[]; date: string | null };
  /** Extra filters shown as dropdowns next to the search. */
  filters?: Array<{ param: string; label: (t: Dictionary) => string; options: (t: Dictionary) => Array<{ value: string; label: string }> }>;
  whenLabel?: Partial<Record<When, (t: Dictionary) => string>>;
  headline: (row: T, ctx: Ctx) => { title: string; subtitle?: React.ReactNode };
  details: (row: T, ctx: Ctx) => Array<{ title?: string; items: Array<{ label: string; value: React.ReactNode; wide?: boolean }> }>;
  Form: React.ComponentType<FormProps<T>>;
  emptyDraft: () => Draft;
  toDraft: (row: T) => Draft;
  toPayload: (draft: Draft) => Record<string, unknown>;
  validate: (draft: Draft, t: Dictionary) => Record<string, string>;
  /**
   * One more tab after the statuses, e.g. hotel payments due. It lists by its
   * own params, whatever the date filter, and its count comes from `extraCounts`.
   */
  extraTab?: { value: string; label: (t: Dictionary) => string; params: Record<string, string> };
  /** More actions on a booking, e.g. "add the return transfer". Returns a new draft to open. */
  extraActions?: (row: T, ctx: Ctx) => Array<{ label: string; icon: LucideIcon; draft: Draft }>;
}

type SheetState =
  | { mode: 'closed' }
  | { mode: 'view'; id: string }
  | { mode: 'edit'; id: string }
  | { mode: 'new'; draft: Draft };

const PAGE_SIZE = 50;

export function OpsPage<T extends OpsBase>({ config }: { config: OpsConfig<T> }) {
  const { t, locale, statusLabel } = useI18n();
  const ctx: Ctx = { t, locale, statusLabel };
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const when = (params.get('when') as When | null) ?? 'upcoming';
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const agencyId = params.get('agency') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const sortBy = params.get('sort') ?? '';
  const sortDir = (params.get('dir') as 'asc' | 'desc' | null) ?? 'asc';
  const extra = Object.fromEntries((config.filters ?? []).map((f) => [f.param, params.get(f.param) ?? '']));

  /** Changes filters in the address bar, so a filtered list can be shared or reloaded. */
  const setParams = React.useCallback(
    (changes: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (resetPage && !('page' in changes)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const extraTab = config.extraTab && status === config.extraTab.value ? config.extraTab : null;
  const listParams = {
    when: when === 'all' || extraTab ? undefined : when,
    status: extraTab ? undefined : status || undefined,
    q: q || undefined,
    agencyId: agencyId || undefined,
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortBy || undefined,
    sortDir: sortBy ? sortDir : undefined,
    ...extra,
    ...extraTab?.params,
  };
  const list = useList<T>(config.endpoint, listParams);
  const invalidate = useInvalidate();

  // ---- the side panel: ?open=<id> shows a booking, ?new=1 opens an empty form
  const [sheet, setSheet] = React.useState<SheetState>({ mode: 'closed' });
  const openId = params.get('open');
  const wantsNew = params.get('new');

  React.useEffect(() => {
    if (openId) setSheet((s) => (s.mode === 'edit' && s.id === openId ? s : { mode: 'view', id: openId }));
  }, [openId]);

  React.useEffect(() => {
    if (wantsNew) {
      setSheet({ mode: 'new', draft: config.emptyDraft() });
      setParams({ new: null }, false);
    }
  }, [wantsNew, config, setParams]);

  const closeSheet = () => {
    setSheet({ mode: 'closed' });
    if (openId) setParams({ open: null }, false);
  };

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) => api.patch<T>(`${config.endpoint}/${id}/status`, { status }),
    onSuccess: (row) => {
      toast.success(`${t.common.statusChanged} · ${statusLabel(row.status, config.type)}`);
      invalidate(config.endpoint);
    },
    onError: (e) => toast.error(ctx.t.errors[(e as ApiError).code] ?? t.errors.INTERNAL_ERROR),
  });

  const counts = list.data?.counts;
  const rows = list.data?.data ?? [];
  const whenOptions: When[] = ['upcoming', 'today', 'tomorrow', 'past', 'all'];
  const whenText = (w: When) =>
    config.whenLabel?.[w]?.(t) ??
    { upcoming: t.common.upcoming, today: t.common.today, tomorrow: t.common.tomorrow, past: t.common.past, all: t.common.anyDate }[w];

  const sortHeader = (col: Column<T>) => {
    if (!col.sortKey) return col.header(t);
    const on = sortBy === col.sortKey;
    const Icon = on ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowDownUp;
    return (
      <button
        type="button"
        onClick={() => setParams({ sort: col.sortKey!, dir: on && sortDir === 'asc' ? 'desc' : 'asc' })}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', on && 'text-foreground')}
      >
        {col.header(t)}
        <Icon className={cn('size-3', !on && 'opacity-40')} />
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        icon={config.icon}
        title={config.title(t)}
        subtitle={config.subtitle(t)}
        actions={
          <>
            <ExportButton endpoint={config.endpoint} params={listParams} />
            <Button onClick={() => setSheet({ mode: 'new', draft: config.emptyDraft() })}>
              <Plus />
              {t.ops.newBooking}
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 animate-rise [animation-delay:60ms]">
        {extraTab ? null : (
          <Segmented<When>
            name="when"
            value={when}
            onChange={(w) => setParams({ when: w === 'upcoming' ? null : w })}
            options={whenOptions.map((w) => ({ value: w, label: whenText(w) }))}
          />
        )}
        <SearchBox value={q} onChange={(v) => setParams({ q: v })} placeholder={config.searchPlaceholder(t)} className="min-w-[14rem] flex-1" />
        <AgencyFilter value={agencyId} onChange={(v) => setParams({ agency: v })} />
        {(config.filters ?? []).map((f) => (
          <NativeSelect
            key={f.param}
            value={extra[f.param]}
            onChange={(e) => setParams({ [f.param]: e.target.value })}
            className="w-auto min-w-[9rem]"
            aria-label={f.label(t)}
          >
            {f.options(t).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        ))}
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
              label: statusLabel(s, config.type),
              count: counts?.[s] ?? null,
            })),
            ...(config.extraTab
              ? [{ value: config.extraTab.value, label: config.extraTab.label(t), count: list.data?.extraCounts?.[config.extraTab.value] ?? null }]
              : []),
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs animate-rise [animation-delay:120ms]">
        {list.isLoading ? (
          <RowsSkeleton cols={Math.min(config.columns.length, 7)} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !rows.length ? (
          <EmptyState
            action={
              <Button variant="outline" size="sm" onClick={() => setSheet({ mode: 'new', draft: config.emptyDraft() })}>
                <Plus />
                {t.ops.newBooking}
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop: a sheet-like table. */}
            <div className={cn('scroll-thin hidden max-h-[calc(100dvh-17.5rem)] overflow-auto md:block', list.isFetching && 'opacity-70 transition-opacity')}>
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    {config.columns.map((col) => (
                      <th
                        key={col.key}
                        scope="col"
                        className={cn(
                          'sticky top-0 z-10 whitespace-nowrap border-b bg-surface-muted px-3 py-2.5 text-start text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground',
                          col.className,
                        )}
                      >
                        {sortHeader(col)}
                      </th>
                    ))}
                    <th className="sticky end-0 top-0 z-20 border-b border-s bg-surface-muted px-3 py-2.5 text-start text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.common.status}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      onClick={() => setParams({ open: row.id }, false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setParams({ open: row.id }, false);
                      }}
                      className={cn(
                        'group cursor-pointer outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted',
                        row.status === 'CANCELLED' && 'text-muted-foreground [&_td]:line-through [&_td]:decoration-muted-foreground/30',
                      )}
                    >
                      {config.columns.map((col) => (
                        <td key={col.key} className={cn('border-b px-3 py-2.5 align-top', col.className)}>
                          {col.cell(row, ctx)}
                        </td>
                      ))}
                      <td className="sticky end-0 border-b border-s bg-card px-3 py-2.5 align-top transition-colors group-hover:bg-surface-muted group-focus-visible:bg-surface-muted">
                        <StatusMenu status={row.status} type={config.type} onChange={(s) => changeStatus.mutate({ id: row.id, status: s })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone: one card per booking. */}
            <ul className="divide-y md:hidden">
              {rows.map((row) => {
                const card = config.card(row, ctx);
                return (
                  <li key={row.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setParams({ open: row.id }, false)}
                      onKeyDown={(e) => e.key === 'Enter' && setParams({ open: row.id }, false)}
                      className="flex gap-3 px-4 py-3 active:bg-accent/60"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <RefTag value={row.ref} />
                          <span className="truncate font-medium">
                            <Txt>{card.title}</Txt>
                          </span>
                        </div>
                        {card.lines.map((line, i) => (
                          <div key={i} className="truncate text-xs text-muted-foreground">
                            <Txt>{line}</Txt>
                          </div>
                        ))}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <DateText value={card.date} className="text-xs" />
                        <StatusMenu status={row.status} type={config.type} onChange={(s) => changeStatus.mutate({ id: row.id, status: s })} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={(p) => setParams({ page: String(p) }, false)} />
          </>
        )}
      </div>

      <OpsSheet
        config={config}
        state={sheet}
        onState={setSheet}
        onClose={closeSheet}
        onSaved={(row) => {
          invalidate(config.endpoint);
          setSheet({ mode: 'view', id: row.id });
          setParams({ open: row.id }, false);
        }}
        onDeleted={() => {
          invalidate(config.endpoint);
          closeSheet();
        }}
        onStatus={(id, s) => changeStatus.mutate({ id, status: s })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The side panel: view a booking, edit it, or create a new one.
// ---------------------------------------------------------------------------

function OpsSheet<T extends OpsBase>({
  config,
  state,
  onState,
  onClose,
  onSaved,
  onDeleted,
  onStatus,
}: {
  config: OpsConfig<T>;
  state: SheetState;
  onState: (s: SheetState) => void;
  onClose: () => void;
  onSaved: (row: T) => void;
  onDeleted: () => void;
  onStatus: (id: string, s: Status) => void;
}) {
  const { t } = useI18n();
  const open = state.mode !== 'closed';
  const recordId = state.mode === 'view' || state.mode === 'edit' ? state.id : null;
  const record = useRecord<T>(config.endpoint, recordId);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const dirtyRef = React.useRef(false);

  const requestClose = () => {
    if ((state.mode === 'edit' || state.mode === 'new') && dirtyRef.current) setConfirmDiscard(true);
    else onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
        <SheetContent width="lg" closeLabel={t.common.close} aria-describedby={undefined}>
          {state.mode === 'view' ? (
            record.isLoading ? (
              <div className="p-6">
                <DialogTitle className="sr-only">{t.common.loading}</DialogTitle>
                <RowsSkeleton rows={6} cols={2} />
              </div>
            ) : record.isError || !record.data ? (
              <div className="p-6">
                <DialogTitle className="sr-only">{t.common.error}</DialogTitle>
                <ErrorState error={record.error} />
              </div>
            ) : (
              <OpsDetails
                config={config}
                row={record.data}
                onEdit={() => onState({ mode: 'edit', id: record.data!.id })}
                onDuplicate={(draft) => onState({ mode: 'new', draft })}
                onDeleted={onDeleted}
                onStatus={(s) => onStatus(record.data!.id, s)}
              />
            )
          ) : state.mode === 'edit' ? (
            record.data ? (
              <OpsForm
                key={`edit-${record.data.id}`}
                config={config}
                record={record.data}
                initial={config.toDraft(record.data)}
                dirtyRef={dirtyRef}
                onCancel={() => onState({ mode: 'view', id: record.data!.id })}
                onSaved={onSaved}
              />
            ) : (
              <DialogTitle className="sr-only">{t.common.loading}</DialogTitle>
            )
          ) : state.mode === 'new' ? (
            <OpsForm
              key={`new-${JSON.stringify(state.draft)}`}
              config={config}
              initial={state.draft}
              dirtyRef={dirtyRef}
              onCancel={requestClose}
              onSaved={onSaved}
            />
          ) : null}
        </SheetContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t.common.unsavedTitle}
        confirmLabel={t.common.discard}
        onConfirm={() => {
          setConfirmDiscard(false);
          dirtyRef.current = false;
          onClose();
        }}
      />
    </>
  );
}

function OpsDetails<T extends OpsBase>({
  config,
  row,
  onEdit,
  onDuplicate,
  onDeleted,
  onStatus,
}: {
  config: OpsConfig<T>;
  row: T;
  onEdit: () => void;
  onDuplicate: (draft: Draft) => void;
  onDeleted: () => void;
  onStatus: (s: Status) => void;
}) {
  const { t, locale, statusLabel, errorMessage } = useI18n();
  const { is } = useSession();
  const ctx: Ctx = { t, locale, statusLabel };
  const history = useActivity(config.endpoint, row.id);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const remove = useMutation({
    mutationFn: () => api.delete(`${config.endpoint}/${row.id}`),
    onSuccess: () => {
      toast.success(t.common.deleted);
      onDeleted();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const head = config.headline(row, ctx);
  const qc = useQueryClient();
  const kinds = ATTACHMENT_KINDS_FOR[config.type];
  const duplicate = () => onDuplicate({ ...config.toDraft(row), status: 'NEW' });

  return (
    <>
      <DialogHeader className="gap-3">
        <div className="flex items-center gap-2">
          <RefTag value={row.ref} />
          <span className="text-xs text-muted-foreground">{t.entity[config.type]}</span>
        </div>
        <div>
          <DialogTitle className="text-lg">
            <Txt>{head.title}</Txt>
          </DialogTitle>
          {head.subtitle ? <DialogDescription className="mt-0.5 text-sm">{head.subtitle}</DialogDescription> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusMenu status={row.status} type={config.type} onChange={onStatus} size="md" />
        </div>
      </DialogHeader>
      <DialogBody className="space-y-6">
        {config.details(row, ctx).map((section, i) => (
          <section key={i} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
            {section.title ? (
              <h3 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
            ) : null}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-surface p-4 sm:grid-cols-3">
              {section.items.map((item) => (
                <div key={item.label} className={cn('min-w-0', item.wide && 'col-span-2 sm:col-span-3')}>
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="mt-0.5 break-words text-sm font-medium">
                    {typeof item.value === 'string' ? <Txt>{item.value}</Txt> : item.value ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        {kinds ? (
          <section>
            <h3 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground">{t.files.section}</h3>
            <div className="rounded-xl border bg-surface p-4">
              <Attachments
                entityType={config.type}
                entityId={row.id}
                kinds={kinds}
                onChanged={() => void qc.invalidateQueries({ queryKey: [config.endpoint, 'activity', row.id] })}
              />
            </div>
          </section>
        ) : null}

        <section>
          <h3 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground">{t.common.history}</h3>
          <ActivityList items={history.data} type={config.type} loading={history.isLoading} />
          <p className="mt-4 text-[0.7rem] text-muted-foreground">
            {t.common.createdBy}: {row.createdBy?.name ?? 'Excel'} · {formatDateTime(row.createdAt, locale)}
          </p>
        </section>
      </DialogBody>
      <DialogFooter className="justify-between">
        <div className="flex flex-wrap gap-2">
          {is('OPERATIONS') ? (
            <Button variant="ghost" className="text-destructive hover:bg-danger-subtle hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              {t.common.delete}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {(config.extraActions?.(row, ctx) ?? []).map((a) => (
            <Button key={a.label} variant="outline" onClick={() => onDuplicate(a.draft)}>
              <a.icon />
              {a.label}
            </Button>
          ))}
          <Button variant="outline" onClick={duplicate}>
            <Copy />
            {t.common.duplicate}
          </Button>
          <Button onClick={onEdit}>
            <Pencil />
            {t.common.edit}
          </Button>
        </div>
      </DialogFooter>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t.common.deleteTitle}
        body={t.common.deleteBody}
        confirmLabel={t.common.delete}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

function OpsForm<T extends OpsBase>({
  config,
  record,
  initial,
  dirtyRef,
  onCancel,
  onSaved,
}: {
  config: OpsConfig<T>;
  record?: T;
  initial: Draft;
  dirtyRef: React.MutableRefObject<boolean>;
  onCancel: () => void;
  onSaved: (row: T) => void;
}) {
  const { t, errorMessage } = useI18n();
  const form = useDraft(initial);
  const formRef = React.useRef<HTMLFormElement>(null);
  const kinds = ATTACHMENT_KINDS_FOR[config.type];
  // Files chosen on a new booking wait here and are uploaded once it is saved.
  const [pending, setPending] = React.useState<PendingFile[]>([]);
  dirtyRef.current = form.dirty || pending.length > 0;

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const row = await (record ? api.patch<T>(`${config.endpoint}/${record.id}`, body) : api.post<T>(config.endpoint, body));
      const failed = pending.length ? await uploadPending(config.type, row.id, pending) : 0;
      return { row, failed };
    },
    onSuccess: ({ row, failed }) => {
      dirtyRef.current = false;
      setPending([]);
      toast.success(record ? t.common.saved : `${t.common.created} · ${row.ref}`);
      // The booking is saved either way; say so if a file did not make it.
      if (failed) toast.error(`${t.files.section}: ${t.errors.INTERNAL_ERROR}`);
      onSaved(row);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fieldErrors) {
        const fields = Object.fromEntries(Object.keys(e.fieldErrors).map((k) => [k, t.common.required]));
        if (Object.keys(fields).length) form.setErrors(fields);
      }
      toast.error(errorMessage(e));
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = config.validate(form.draft, t);
    if (Object.values(errors).some(Boolean)) {
      form.setErrors(errors);
      // Take the person to the first field that needs attention.
      const first = Object.keys(errors).find((k) => errors[k]);
      formRef.current?.querySelector<HTMLElement>(`[id="f-${first}"]`)?.focus();
      return;
    }
    save.mutate(config.toPayload(form.draft));
  };

  const Form = config.Form;
  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col" autoComplete="off">
      <DialogHeader>
        <DialogTitle>
          {record ? t.ops.editBooking : t.ops.newBooking} · {t.entity[config.type]}
        </DialogTitle>
        {record ? <DialogDescription>{record.ref} · {record.guestName}</DialogDescription> : null}
      </DialogHeader>
      <DialogBody className="space-y-7">
        <Form draft={form.draft} set={form.set} errors={form.errors} record={record} />
        {kinds ? (
          <FormSection title={t.files.section} hint={t.files.hint}>
            <Attachments entityType={config.type} entityId={record?.id} kinds={kinds} pending={pending} onPending={setPending} />
          </FormSection>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {record ? t.common.saveChanges : t.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
