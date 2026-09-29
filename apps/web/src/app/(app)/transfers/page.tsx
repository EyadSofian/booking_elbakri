'use client';

import { Suspense } from 'react';
import { OpsPage } from '@/components/ops/ops-page';
import { transfersConfig } from '@/components/ops/transfers';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OpsPage config={transfersConfig} />
    </Suspense>
  );
}
