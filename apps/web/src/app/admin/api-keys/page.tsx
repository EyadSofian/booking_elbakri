'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ALL_API_KEY_SCOPES, PERMISSIONS } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string } | null;
}

export default function ApiKeysPage() {
  const { t, locale, errorMessage } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get<ApiKeyRow[]>('/api-keys'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ key: string }>('/api-keys', body),
    onSuccess: (result) => {
      // The plaintext key exists only in this response; only its hash is stored.
      setIssued(result.key);
      setCreateOpen(false);
      void invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => { toast.success(t.apiKeys.revoked); void invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <PageHeader
        title={t.apiKeys.title}
        description={t.apiKeys.readOnlyNotice}
        actions={
          can(PERMISSIONS.API_KEYS_CREATE) ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{t.apiKeys.newKey}</span>
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t.apiKeys.title}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          ) : (query.data?.length ?? 0) === 0 ? (
            <div className="py-12 text-center">
              <KeyRound className="mx-auto size-6 text-muted-foreground/50" aria-hidden />
              <p className="mt-2 text-xs text-muted-foreground">{t.common.noResults}</p>
            </div>
          ) : (
            <ul className="divide-y">
              {query.data!.map((key) => (
                <li key={key.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {key.name}
                      {key.revokedAt ? (
                        <Badge variant="danger">{t.apiKeys.revoked}</Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 font-mono text-2xs text-muted-foreground" dir="ltr">
                      {key.prefix}…
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {key.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="font-mono">{s}</Badge>
                      ))}
                    </p>
                    <p className="mt-1 text-2xs text-muted-foreground">
                      {t.apiKeys.lastUsed}: {key.lastUsedAt ? formatDateTime(key.lastUsedAt, locale) : '—'}
                      {key.createdBy ? ` · ${key.createdBy.fullName}` : ''}
                    </p>
                  </div>
                  {can(PERMISSIONS.API_KEYS_MANAGE) && !key.revokedAt ? (
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate(key.id)}>
                      <Trash2 className="size-3.5" aria-hidden />
                      {t.apiKeys.revoke}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.apiKeys.newKey}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              create.mutate({
                name: String(form.get('name')),
                scopes: form.getAll('scopes').map(String),
              });
            }}
          >
            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" required>{t.apiKeys.keyName}</Label>
                <Input id="name" name="name" required autoFocus maxLength={120} />
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium">{t.apiKeys.scopes}</legend>
                <div className="space-y-1 rounded-md border p-2">
                  {ALL_API_KEY_SCOPES.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 font-mono text-xs">
                      <input type="checkbox" name="scopes" value={scope}
                        className="size-3.5 accent-brand-700" />
                      {scope}
                    </label>
                  ))}
                </div>
                <p className="text-2xs text-muted-foreground">{t.apiKeys.readOnlyNotice}</p>
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

      <Dialog open={Boolean(issued)} onOpenChange={(open) => !open && setIssued(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.apiKeys.newKey}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning">
              {t.apiKeys.secretShownOnce}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-surface-muted p-2 font-mono text-2xs" dir="ltr">
                {issued}
              </code>
              <Button
                variant="outline" size="icon-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(issued ?? '');
                  toast.success(t.common.copied);
                }}
                aria-label={t.common.copy}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>{t.common.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
