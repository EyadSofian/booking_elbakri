'use client';

import { Suspense } from 'react';
import { useI18n } from '@/lib/providers';
import { PageHeader } from '@/components/layout/page-header';
import { MatchingQueue } from '@/components/imports/matching-queue';

/**
 * The matching queue across every import.
 *
 * The same component the Import Center embeds, without a run filter — this is
 * where someone works through the backlog rather than one workbook.
 */
function MatchingContent() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        guideKey="page.matching"
        title={t.imports.steps.matching}
        description={t.masterData.aliasSuggestionsHint}
      />
      <MatchingQueue />
    </>
  );
}

export default function MatchingPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <MatchingContent />
    </Suspense>
  );
}
