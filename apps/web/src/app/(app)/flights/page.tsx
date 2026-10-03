'use client';

import { Suspense } from 'react';
import { OpsPage } from '@/components/ops/ops-page';
import { flightsConfig } from '@/components/ops/flights';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OpsPage config={flightsConfig} />
    </Suspense>
  );
}
