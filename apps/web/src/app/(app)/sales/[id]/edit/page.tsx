'use client';

import { useParams } from 'next/navigation';
import type { SaleDetail } from '@elbakri/shared';
import { useRecord } from '@/lib/queries';
import { SaleForm } from '@/components/sales/sale-form';
import { ErrorState, RowsSkeleton } from '@/components/shared/feedback';

export default function EditSalePage() {
  const { id } = useParams<{ id: string }>();
  const sale = useRecord<SaleDetail>('/sales', id);
  if (sale.isLoading) return <RowsSkeleton rows={10} cols={4} />;
  if (sale.isError || !sale.data) return <ErrorState error={sale.error} onRetry={() => sale.refetch()} />;
  // Keyed on the record so a fresh copy of the sale starts a fresh form.
  return <SaleForm key={sale.data.updatedAt} sale={sale.data} />;
}
