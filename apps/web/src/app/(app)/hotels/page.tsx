'use client';

import { Suspense } from 'react';
import { OpsPage } from '@/components/ops/ops-page';
import { hotelsConfig } from '@/components/ops/hotels';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OpsPage config={hotelsConfig} />
    </Suspense>
  );
}
