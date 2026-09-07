'use client';

import { History } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/data/empty-state';
import type { TripTabContext } from '../types';

export function TimelineTab({ context }: { context: TripTabContext }) {
  const { trip } = context;
  const { t, locale } = useI18n();

  return (
    <Card>
      <CardContent className="p-0">
        {trip.statusHistory.length === 0 ? (
          <EmptyState
            icon={History}
            title={t.audit.noHistory}
            description={t.trips.noHistoryHint}
          />
        ) : (
          <ul className="divide-y">
            {trip.statusHistory.map((entry) => (
              <li key={entry.id} className="px-4 py-2.5">
                <p className="text-sm">
                  {entry.fromStatus
                    ? `${t.status[entry.fromStatus as keyof typeof t.status] ?? entry.fromStatus} → `
                    : ''}
                  <span className="font-medium">
                    {t.status[entry.toStatus as keyof typeof t.status] ?? entry.toStatus}
                  </span>
                </p>
                <p className="text-2xs text-muted-foreground">
                  {formatDateTime(entry.createdAt, locale)}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
