'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import type { TripTabContext } from '../types';

export function TravelersTab({ context }: { context: TripTabContext }) {
  const { trip } = context;
  const { t } = useI18n();

  return (
    <Card>
      <CardContent className="p-0">
        {trip.travelers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t.trips.noTravelers}
            description={t.trips.noTravelersHint}
          />
        ) : (
          <ul className="divide-y">
            {trip.travelers.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <Link
                  href={`/travelers/${member.traveler.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  {member.traveler.fullName}
                </Link>
                <Badge variant="outline">{member.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
