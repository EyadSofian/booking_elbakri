'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { SaleDetail } from '@elbakri/shared';
import { useRecord } from '@/lib/queries';
import { SaleForm } from '@/components/sales/sale-form';
import { ErrorState, RowsSkeleton } from '@/components/shared/feedback';

export default function EditSalePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sale = useRecord<SaleDetail>('/sales', id);
  // A sales supervisor can read someone else's sale but not change it: back to the sale.
  const readOnly = sale.data ? !sale.data.canEdit : false;
  React.useEffect(() => {
    if (readOnly) router.replace(`/sales/${id}`);
  }, [readOnly, router, id]);

  if (sale.isLoading || readOnly) return <RowsSkeleton rows={10} cols={4} />;
  if (sale.isError || !sale.data) return <ErrorState error={sale.error} onRetry={() => sale.refetch()} />;
  // Keyed on the record so a fresh copy of the sale starts a fresh form.
  return <SaleForm key={sale.data.updatedAt} sale={sale.data} />;
}
