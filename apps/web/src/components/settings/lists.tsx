'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, EyeOff, GitMerge, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { AgencyItem, HotelItem } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useAgencies, useHotels } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/shared/field';
import { EmptyState, ErrorState, RowsSkeleton } from '@/components/shared/feedback';
import { SearchBox } from '@/components/shared/list-controls';

type Kind = 'agencies' | 'hotels';
type Item = (AgencyItem | HotelItem) & { isDirect?: boolean; city?: string | null };

/**
 * The two pick-lists — agencies and hotels. Spelling variants from the old
 * sheets can be merged here, so "Sama" and "SAMA TOURS" become one agency.
 */
export function ListTab({ kind }: { kind: Kind }) {
  const { t, errorMessage } = useI18n();
  const { is } = useSession();
  const qc = useQueryClient();
  const [showHidden, setShowHidden] = React.useState(false);
  const [q, setQ] = React.useState('');
  const agencies = useAgencies(true);
  const hotels = useHotels(true);
  const query = kind === 'agencies' ? agencies : hotels;
  const [dialog, setDialog] = React.useState<{ mode: 'add' } | { mode: 'rename'; item: Item } | { mode: 'merge'; item: Item } | null>(null);
  const canEdit = is('OPERATIONS');
  const base = `/lookups/${kind}`;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [base] });
    void qc.invalidateQueries({ queryKey: ['/hotel-bookings'] });
    void qc.invalidateQueries({ queryKey: ['/transfers'] });
    void qc.invalidateQueries({ queryKey: ['/excursions'] });
    void qc.invalidateQueries({ queryKey: ['/visas'] });
  };

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`${base}/${id}`, body),
    onSuccess: () => {
      toast.success(t.common.saved);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${base}/${id}`),
    onSuccess: () => {
      toast.success(t.common.deleted);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const all = ((query.data ?? []) as Item[]).filter((i) => showHidden || i.isActive);
  const term = q.trim().toLowerCase();
  const rows = term ? all.filter((i) => `${i.name} ${i.city ?? ''}`.toLowerCase().includes(term)) : all;
  const sorted = [...rows].sort((a, b) => b.bookings - a.bookings || a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder={t.common.search} className="min-w-[14rem] flex-1" />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
          {t.settings.showInactive}
        </label>
        {canEdit ? (
          <Button onClick={() => setDialog({ mode: 'add' })}>
            <Plus />
            {kind === 'agencies' ? t.settings.addAgency : t.settings.addHotel}
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {query.isLoading ? (
          <RowsSkeleton rows={6} cols={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !sorted.length ? (
          <EmptyState />
        ) : (
          <ul className="scroll-thin max-h-[calc(100dvh-18rem)] divide-y overflow-y-auto">
            {sorted.map((item) => (
              <li key={item.id} className={cn('flex items-center gap-3 px-4 py-2.5', !item.isActive && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {item.name}
                    {item.isDirect ? <Badge variant="sun">{t.common.directCustomer}</Badge> : null}
                  </p>
                  {kind === 'hotels' && item.city ? <p className="text-xs text-muted-foreground">{item.city}</p> : null}
                </div>
                <span className="tabular text-xs text-muted-foreground">
                  {item.bookings} {t.settings.bookings}
                </span>
                {canEdit ? (
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t.common.more}>
                        <MoreHorizontal />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setDialog({ mode: 'rename', item })}>
                        <Pencil />
                        {t.settings.rename}
                      </MenuItem>
                      <MenuItem onSelect={() => setDialog({ mode: 'merge', item })}>
                        <GitMerge />
                        {t.settings.merge}
                      </MenuItem>
                      {kind === 'agencies' ? (
                        <MenuItem onSelect={() => patch.mutate({ id: item.id, body: { isDirect: !item.isDirect } })}>
                          <Star />
                          {t.settings.isDirect}
                        </MenuItem>
                      ) : null}
                      <MenuItem onSelect={() => patch.mutate({ id: item.id, body: { isActive: !item.isActive } })}>
                        {item.isActive ? <EyeOff /> : <Eye />}
                        {item.isActive ? t.settings.hide : t.settings.unhide}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem
                        destructive
                        disabled={item.bookings > 0}
                        onSelect={() => remove.mutate(item.id)}
                        title={item.bookings > 0 ? t.settings.cannotRemove : undefined}
                      >
                        <Trash2 />
                        {t.settings.remove}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog?.mode === 'add' || dialog?.mode === 'rename' ? (
        <NameDialog kind={kind} item={dialog.mode === 'rename' ? dialog.item : null} onClose={() => setDialog(null)} onDone={refresh} />
      ) : null}
      {dialog?.mode === 'merge' ? (
        <MergeDialog kind={kind} item={dialog.item} options={(query.data ?? []) as Item[]} onClose={() => setDialog(null)} onDone={refresh} />
      ) : null}
    </div>
  );
}

function NameDialog({ kind, item, onClose, onDone }: { kind: Kind; item: Item | null; onClose: () => void; onDone: () => void }) {
  const { t, errorMessage } = useI18n();
  const [name, setName] = React.useState(item?.name ?? '');
  const [city, setCity] = React.useState(item?.city ?? '');
  const [error, setError] = React.useState('');
  const base = `/lookups/${kind}`;
  const save = useMutation({
    mutationFn: () => {
      const body = kind === 'hotels' ? { name: name.trim(), city: city.trim() || null } : { name: name.trim() };
      return item ? api.patch(`${base}/${item.id}`, body) : api.post(base, body);
    },
    onSuccess: () => {
      toast.success(t.common.saved);
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" closeLabel={t.common.close}>
        <form
          noValidate
          className="flex min-h-0 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return setError(t.common.required);
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {item ? t.settings.rename : kind === 'agencies' ? t.settings.addAgency : t.settings.addHotel}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label={kind === 'agencies' ? t.settings.agencyName : t.settings.hotelName} htmlFor="n-name" required error={error}>
              <Input id="n-name" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} autoFocus invalid={Boolean(error)} />
            </Field>
            {kind === 'hotels' ? (
              <Field label={t.settings.city} htmlFor="n-city">
                <Input id="n-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({ kind, item, options, onClose, onDone }: { kind: Kind; item: Item; options: Item[]; onClose: () => void; onDone: () => void }) {
  const { t, errorMessage } = useI18n();
  const [into, setInto] = React.useState('');
  const merge = useMutation({
    mutationFn: () => api.post(`/lookups/${kind}/${item.id}/merge`, { intoId: into }),
    onSuccess: () => {
      toast.success(t.settings.mergeDone);
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const choices = options.filter((o) => o.id !== item.id).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{t.settings.mergeTitle(item.name)}</DialogTitle>
          <DialogDescription>{t.settings.mergeHint}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label={t.settings.mergeInto} htmlFor="m-into">
            <NativeSelect id="m-into" value={into} onChange={(e) => setInto(e.target.value)}>
              <option value="">—</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.bookings})
                </option>
              ))}
            </NativeSelect>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button disabled={!into} loading={merge.isPending} onClick={() => merge.mutate()}>
            <GitMerge />
            {t.settings.mergeInto}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
