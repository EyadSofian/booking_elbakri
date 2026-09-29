'use client';

import { Suspense } from 'react';
import { OpsPage } from '@/components/ops/ops-page';
import { visasConfig } from '@/components/ops/visas';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OpsPage config={visasConfig} />
    </Suspense>
  );
}
