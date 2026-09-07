'use client';

import { MasterDataPage } from '@/components/data/master-data-page';
import { useI18n } from '@/lib/providers';

export default function DriversPage() {
  const { t } = useI18n();
  return (
    <MasterDataPage
      resource="/drivers"
      title={t.nav.drivers}
      extraColumns={[
        {
          key: 'phone',
          header: t.common.phone,
          cell: (row) => (
            <span dir="ltr" className="tabular-nums">
              {(row as { phone?: string | null }).phone ?? '—'}
            </span>
          ),
        },
        {
          key: 'active',
          header: t.users.active,
          cell: (row) => (row.isActive === false ? t.users.inactive : t.users.active),
        },
      ]}
      createFields={[{ name: 'phone', label: t.common.phone }]}
    />
  );
}
