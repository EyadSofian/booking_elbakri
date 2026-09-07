'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Plus, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  locale: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Array<{ role: { id: string; key: string; name: string } }>;
  _count?: { sessions: number };
}

interface Role {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
}

export default function UsersPage() {
  const { t, locale, errorMessage } = useI18n();
  const { can, user: currentUser } = useSession();
  const queryClient = useQueryClient();
  const { state, update } = useListQuery({ sortBy: 'fullName', sortDir: 'asc' });
  const [searchInput, setSearchInput] = useState(state.q);
  const [createOpen, setCreateOpen] = useState(false);
  const [rolesFor, setRolesFor] = useState<UserRow | null>(null);

  const manage = can(PERMISSIONS.USERS_MANAGE);

  const query = useQuery({
    queryKey: ['users', state],
    queryFn: () =>
      api.get<PaginatedResponse<UserRow>>('/users', {
        page: state.page, pageSize: state.pageSize,
        q: state.q || undefined, sortBy: state.sortBy, sortDir: state.sortDir,
      }),
  });

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Role[]>('/roles'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/users', body),
    onSuccess: () => { toast.success(t.users.newUser); setCreateOpen(false); void invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const setRoles = useMutation({
    mutationFn: (body: { id: string; roleIds: string[] }) =>
      api.post(`/users/${body.id}/roles`, { roleIds: body.roleIds }),
    onSuccess: () => { toast.success(t.users.roles); setRolesFor(null); void invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const revokeSessions = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/revoke-sessions`),
    onSuccess: () => { toast.success(t.users.revokeSessions); void invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const columns: Column<UserRow>[] = [
    {
      key: 'name', header: t.users.fullName, sortKey: 'fullName',
      alwaysVisible: true, mobile: 'title',
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{row.fullName}</span>
          {row.id === currentUser?.id ? (
            <Badge variant="outline">{t.auth.myAccount}</Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'email', header: t.auth.email, sortKey: 'email', mobile: 'subtitle',
      cell: (row) => <span dir="ltr" className="text-xs">{row.email}</span>,
    },
    {
      key: 'roles', header: t.users.roles,
      cell: (row) => (
        <span className="flex flex-wrap gap-1">
          {row.roles.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            row.roles.map((r) => (
              <Badge key={r.role.id} variant="brand">{r.role.name}</Badge>
            ))
          )}
        </span>
      ),
    },
    {
      key: 'lastLogin', header: t.users.lastLogin, sortKey: 'lastLoginAt',
      cell: (row) => (
        <span className="whitespace-nowrap tabular-nums">
          {row.lastLoginAt ? formatDateTime(row.lastLoginAt, locale) : '—'}
        </span>
      ),
    },
    {
      key: 'active', header: t.common.status,
      cell: (row) => (
        <Badge variant={row.isActive ? 'success' : 'default'}>
          {row.isActive ? t.users.active : t.users.inactive}
        </Badge>
      ),
    },
    ...(manage
      ? ([
          {
            key: 'actions', header: t.common.actions, mobile: 'hidden',
            cell: (row: UserRow) => {
              // Nobody edits their own access — the API refuses it too, so this
              // only avoids offering an action that would be rejected.
              const isSelf = row.id === currentUser?.id;
              return (
                <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost" size="sm"
                    disabled={isSelf}
                    title={isSelf ? t.users.cannotEditOwnAccess : undefined}
                    onClick={() => setRolesFor(row)}
                  >
                    <ShieldCheck className="size-3.5" aria-hidden />
                    <span className="hidden lg:inline">{t.users.roles}</span>
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => revokeSessions.mutate(row.id)}
                    title={t.users.revokeSessions}
                  >
                    <LogOut className="size-3.5 flip-rtl" aria-hidden />
                  </Button>
                </span>
              );
            },
          },
        ] as Column<UserRow>[])
      : []),
  ];

  return (
    <>
      <PageHeader
        title={t.users.title}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
        actions={
          can(PERMISSIONS.USERS_CREATE) ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{t.users.newUser}</span>
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
        onRefresh={() => query.refetch()}
        toolbar={
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
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.users.newUser}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              create.mutate({
                fullName: String(form.get('fullName')),
                email: String(form.get('email')),
                password: String(form.get('password')),
                locale: String(form.get('locale')),
                roleIds: form.getAll('roleIds').map(String),
              });
            }}
          >
            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName" required>{t.users.fullName}</Label>
                <Input id="fullName" name="fullName" required autoFocus maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" required>{t.auth.email}</Label>
                <Input id="email" name="email" type="email" required dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" required>{t.auth.password}</Label>
                <Input
                  id="password" name="password" type="password" required
                  minLength={12} dir="ltr"
                />
                <p className="text-2xs text-muted-foreground">At least 12 characters.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="locale">{t.common.name}</Label>
                <select id="locale" name="locale" defaultValue="en"
                  className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm">
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium">{t.users.roles}</legend>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {(roles.data ?? []).map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="roleIds" value={role.id}
                        className="size-3.5 accent-brand-700" />
                      {role.name}
                    </label>
                  ))}
                </div>
              </fieldset>
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

      <Dialog open={Boolean(rolesFor)} onOpenChange={(open) => !open && setRolesFor(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.users.roles}</DialogTitle>
          </DialogHeader>
          {rolesFor ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                setRoles.mutate({
                  id: rolesFor.id,
                  roleIds: form.getAll('roleIds').map(String),
                });
              }}
            >
              <DialogBody className="space-y-3">
                <p className="text-xs">
                  <span className="font-medium">{rolesFor.fullName}</span>
                  <span className="ms-1.5 text-muted-foreground" dir="ltr">{rolesFor.email}</span>
                </p>
                <div className="space-y-1 rounded-md border p-2">
                  {(roles.data ?? []).map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox" name="roleIds" value={role.id}
                        defaultChecked={rolesFor.roles.some((r) => r.role.id === role.id)}
                        className="size-3.5 accent-brand-700"
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
                <p className="text-2xs text-muted-foreground">{t.users.lastSuperAdmin}</p>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRolesFor(null)}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" loading={setRoles.isPending}>{t.common.save}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
