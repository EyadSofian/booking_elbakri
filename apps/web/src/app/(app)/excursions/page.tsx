'use client';

import { Suspense } from 'react';
import { OpsPage } from '@/components/ops/ops-page';
import { excursionsConfig } from '@/components/ops/excursions';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OpsPage config={excursionsConfig} />
    </Suspense>
  );
}
