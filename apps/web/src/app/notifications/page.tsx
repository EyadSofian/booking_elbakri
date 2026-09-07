'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { PaginatedResponse } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { useListQuery } from '@/hooks/use-list-query';
import { cn, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, severityVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface NotificationRow {
  id: string;
  type: string;
  severity: string;
  title: string;
  titleAr: string | null;
  body: string | null;
  bodyAr: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const { t, locale, errorMessage } = useI18n();
  const queryClient = useQueryClient();
  const { state, update } = useListQuery({ pageSize: 50 });

  const query = useQuery({
    queryKey: ['notifications', state],
    queryFn: () =>
      api.get<PaginatedResponse<NotificationRow>>('/notifications', {
        page: state.page, pageSize: state.pageSize, ...state.filters,
      }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/mark-all-read'),
    onSuccess: () => { toast.success(t.common.save); invalidate(); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post('/notifications/mark-read', { ids: [id] }),
    onSuccess: invalidate,
  });

  const rows = query.data?.data ?? [];
  const unread = rows.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title={t.nav.dashboard}
        description={query.data ? `${query.data.meta.total} ${t.common.total.toLowerCase()}` : undefined}
        actions={
          unread > 0 ? (
            <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} loading={markAllRead.isPending}>
              <CheckCheck className="size-3.5" aria-hidden />
              {t.common.all}
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-14 text-center">
              <Bell className="mx-auto size-7 text-muted-foreground/50" aria-hidden />
              <p className="mt-2 text-xs text-muted-foreground">{t.dashboard.noAlerts}</p>
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((n) => {
                const title = (locale === 'ar' && n.titleAr) || n.title;
                const body = (locale === 'ar' && n.bodyAr) || n.body;
                const content = (
                  <span className={cn('block px-4 py-3', !n.readAt && 'bg-accent/30')}>
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{title}</span>
                        {body ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{body}</span>
                        ) : null}
                        <span className="mt-1 block text-2xs text-muted-foreground">
                          {formatDateTime(n.createdAt, locale)}
                        </span>
                      </span>
                      <Badge variant={severityVariant(n.severity)}>
                        {t.severity[n.severity as keyof typeof t.severity] ?? n.severity}
                      </Badge>
                    </span>
                  </span>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => !n.readAt && markRead.mutate(n.id)}
                        className="block transition-colors hover:bg-accent/40"
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => !n.readAt && markRead.mutate(n.id)}
                        className="block w-full text-start transition-colors hover:bg-accent/40"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {query.data && query.data.meta.hasNext ? (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={() => update({ page: state.page + 1 })}>
            {t.common.showMore}
          </Button>
        </div>
      ) : null}
    </>
  );
}
