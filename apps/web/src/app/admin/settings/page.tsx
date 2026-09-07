'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** As returned by `GET /settings`. The value's type is inferred, not declared. */
interface Setting {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
}

export default function SettingsPage() {
  const { t, errorMessage } = useI18n();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting[]>('/settings'),
  });

  const save = useMutation({
    mutationFn: (body: { key: string; value: string }) =>
      api.put(`/settings/${body.key}`, { value: body.value }),
    onSuccess: () => {
      toast.success(t.common.save);
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <PageHeader title={t.nav.settings} />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t.nav.settings}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y">
              {(query.data ?? []).map((setting) => (
                <li key={setting.key} className="px-4 py-3">
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      save.mutate({ key: setting.key, value: String(form.get('value')) });
                    }}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor={setting.key} className="font-mono">{setting.key}</Label>
                      {setting.description ? (
                        <p className="text-2xs text-muted-foreground">{setting.description}</p>
                      ) : null}
                      <Input
                        id={setting.key}
                        name="value"
                        defaultValue={
                          typeof setting.value === 'object' && setting.value !== null
                            ? JSON.stringify(setting.value)
                            : String(setting.value ?? '')
                        }
                        // The API does not declare a type, so it is inferred
                        // from the current value rather than assumed.
                        type={typeof setting.value === 'number' ? 'number' : 'text'}
                      />
                    </div>
                    <Button type="submit" size="sm" variant="outline">{t.common.save}</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
