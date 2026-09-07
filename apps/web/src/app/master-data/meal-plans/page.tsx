'use client';

import { MasterDataPage } from '@/components/data/master-data-page';
import { useI18n } from '@/lib/providers';

export default function Page() {
  const { t } = useI18n();
  return (
    <MasterDataPage
      resource="/meal-plans"
      title={t.nav.mealPlans}
    />
  );
}
