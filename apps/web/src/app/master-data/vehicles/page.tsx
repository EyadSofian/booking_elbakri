'use client';

import { MasterDataPage } from '@/components/data/master-data-page';
import { useI18n } from '@/lib/providers';

export default function VehiclesPage() {
  const { t } = useI18n();
  return (
    <MasterDataPage
      resource="/vehicles"
      title={t.nav.vehicles}
      extraColumns={[
        {
          key: 'model',
          header: t.common.name,
          cell: (row) => (row as { model?: string | null }).model ?? '—',
        },
        {
          key: 'capacity',
          header: t.trips.pax,
          cell: (row) => (
            <span className="tabular-nums">
              {(row as { capacity?: number | null }).capacity ?? '—'}
            </span>
          ),
        },
      ]}
      createFields={[
        { name: 'model', label: t.common.name },
        { name: 'capacity', label: t.trips.pax, type: 'number' },
      ]}
    />
  );
}
