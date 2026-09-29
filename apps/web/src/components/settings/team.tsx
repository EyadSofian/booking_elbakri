'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, UserPlus } from 'lucide-react';
import { ROLES, type Role, type UserSummary } from '@elbakri/shared';
import { ApiError, api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { cn, formatDateTime, initials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/shared/field';
import { EmptyState, ErrorState, RowsSkeleton } from '@/components/shared/feedback';

export function TeamTab() {
  const { t, locale } = useI18n();
  const { user: me } = useSession();
  const users = useQuery({ queryKey: ['/users'], queryFn: () => api.get<UserSummary[]>('/users') });
  const [editing, setEditing] = React.useState<UserSummary | 'new' | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <UserPlus />
          {t.settings.addUser}
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {users.isLoading ? (
          <RowsSkeleton rows={3} cols={4} />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : !users.data?.length ? (
          <EmptyState />
        ) : (
          <ul className="divide-y">
            {users.data.map((u) => (
              <li key={u.id} className={cn('flex items-center gap-3 px-4 py-3', !u.isActive && 'opacity-60')}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials(u.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {u.name} {u.id === me?.id ? <span className="text-xs text-muted-foreground">({t.settings.you})</span> : null}
                  </p>
                  <p className="ltr truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="hidden text-end text-xs text-muted-foreground sm:block">
                  <p>{t.settings.lastLogin}</p>
                  <p>{u.lastLoginAt ? formatDateTime(u.lastLoginAt, locale) : t.settings.never}</p>
                </div>
                <Badge variant={u.role === 'ADMIN' ? 'brand' : 'default'}>{t.roles[u.role]}</Badge>
                {!u.isActive ? <Badge variant="danger">{t.settings.inactive}</Badge> : null}
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(u)} aria-label={t.settings.editUser}>
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing ? <UserDialog user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function UserDialog({ user, onClose }: { user: UserSummary | null; onClose: () => void }) {
  const { t, errorMessage } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = React.useState(user?.name ?? '');
  const [email, setEmail] = React.useState(user?.email ?? '');
  const [role, setRole] = React.useState<Role>(user?.role ?? 'OPERATIONS');
  const [active, setActive] = React.useState(user?.isActive ?? true);
  const [password, setPassword] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () =>
      user
        ? api.patch(`/users/${user.id}`, { name, email, role, isActive: active, password: password || undefined })
        : api.post('/users', { name, email, role, password }),
    onSuccess: () => {
      toast.success(t.common.saved);
      void qc.invalidateQueries({ queryKey: ['/users'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        const fields = Object.keys(e.fieldErrors);
        if (fields.length) setErrors(Object.fromEntries(fields.map((f) => [f, t.common.required])));
      }
      toast.error(errorMessage(e));
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = t.common.required;
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = t.common.required;
    if ((!user || password) && password.length < 8) errs.password = t.settings.passwordHint;
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={t.common.close}>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{user ? t.settings.editUser : t.settings.addUser}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label={t.settings.name} htmlFor="u-name" required error={errors.name}>
              <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus invalid={Boolean(errors.name)} />
            </Field>
            <Field label={t.settings.email} htmlFor="u-email" required error={errors.email}>
              <Input id="u-email" type="email" dir="ltr" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(errors.email)} />
            </Field>
            <Field label={t.settings.role}>
              <div role="radiogroup" className="grid gap-2">
                {ROLES.map((r) => (
                  <label
                    key={r}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      role === r ? 'border-primary bg-accent' : 'hover:bg-accent/40',
                    )}
                  >
                    <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1 accent-[hsl(var(--primary))]" />
                    <span>
                      <span className="block text-sm font-medium">{t.roles[r]}</span>
                      <span className="block text-xs text-muted-foreground">{t.roleHint[r]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
            <Field
              label={user ? t.settings.resetPassword : t.settings.newPassword}
              htmlFor="u-password"
              required={!user}
              error={errors.password}
              hint={t.settings.passwordHint}
            >
              <Input id="u-password" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={Boolean(errors.password)} />
            </Field>
            {user ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
                {t.settings.active}
              </label>
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
