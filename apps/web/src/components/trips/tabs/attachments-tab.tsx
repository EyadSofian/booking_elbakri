'use client';

import { Paperclip } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import type { TripTabContext } from '../types';

export function AttachmentsTab({ context }: { context: TripTabContext }) {
  const { trip } = context;
  const { t, locale } = useI18n();

  return (
    <Card>
      <CardContent className="p-0">
        {trip.attachments.length === 0 ? (
          <EmptyState
            icon={Paperclip}
            title={t.trips.noAttachments}
            description={t.trips.noAttachmentsHint}
          />
        ) : (
          <ul className="divide-y">
            {trip.attachments.map((file) => (
              <li key={file.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                  {formatDate(file.createdAt, locale)}
                </span>
                <Badge variant="outline">{file.category}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
