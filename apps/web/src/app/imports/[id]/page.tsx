'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@elbakri/shared';
import { api, ApiError } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DisabledReason } from '@/components/help/help-tip';
import { TabBar, TabPanel, useActiveTab, useResolvedTabs } from '@/components/layout/tabs';
import { IMPORT_TABS } from '@/components/imports/tab-registry';
import type { ImportRunDetail, ImportTabContext } from '@/components/imports/types';
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

function ImportDetailContent() {
  const params = useParams<{ id: string }>();
  const { t, locale, errorMessage } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const [confirmApply, setConfirmApply] = useState(false);

  const query = useQuery({
    queryKey: ['import', params.id],
    queryFn: () => api.get<ImportRunDetail>(`/imports/${params.id}`),
  });

  const run = query.data;
  const context = useMemo<ImportTabContext>(
    () => ({ run: run as ImportRunDetail, runId: params.id }),
    [run, params.id],
  );

  const tabs = useResolvedTabs(IMPORT_TABS, context, Boolean(run));
  const { active, activeKey, setTab } = useActiveTab(tabs);

  const apply = useMutation({
    mutationFn: () =>
      api.post<{ recordsCreated: number; recordsMatched: number; issuesRaised: number }>(
        `/imports/${params.id}/apply`,
      ),
    onSuccess: (result) => {
      toast.success(`${t.imports.applied}: ${result.recordsCreated}`);
      setConfirmApply(false);
      void queryClient.invalidateQueries({ queryKey: ['import', params.id] });
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
      void queryClient.invalidateQueries({ queryKey: ['data-quality'] });
    },
    onError: (err) => toast.error(errorMessage(err as ApiError)),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-72" />
        <div className="skeleton h-10 w-full max-w-2xl" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">{t.errors.NOT_FOUND}</p>
        <Link href="/imports" className="mt-2 inline-block text-xs text-primary hover:underline">
          {t.imports.title}
        </Link>
      </div>
    );
  }

  // Apply is a deliberate, controlled action. Where it is unavailable the
  // button says why rather than sitting there greyed out.
  const applyBlockedReason: string | null = !can(PERMISSIONS.IMPORTS_APPLY)
    ? t.errors.FORBIDDEN
    : run.status === 'APPLIED'
      ? t.imports.applyAlreadyDone
      : run.status !== 'ANALYZED' && run.status !== 'PREVIEWED'
        ? t.imports.applyNotAnalysed
        : run.rowsOrphan > 0
          ? t.imports.applyBlocked
          : null;

  return (
    <>
      <PageHeader
        guideKey="page.imports"
        breadcrumb={
          <Link href="/imports" className="hover:text-foreground">
            {t.imports.title}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate">{run.sourceFilename}</span>
            <Badge variant={statusVariant(run.status)}>
              {t.status[run.status as keyof typeof t.status] ?? run.status}
            </Badge>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3">
            <span>{formatDateTime(run.createdAt, locale)}</span>
            {run.uploadedBy ? <span>· {run.uploadedBy.fullName}</span> : null}
            <span>· {(run.fileSizeBytes / 1024).toFixed(0)} KB</span>
          </span>
        }
        actions={
          <span className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={Boolean(applyBlockedReason)}
              onClick={() => setConfirmApply(true)}
            >
              <PlayCircle className="size-3.5" aria-hidden />
              {t.imports.apply}
            </Button>
            <DisabledReason reason={applyBlockedReason} />
          </span>
        }
      />

      <TabBar tabs={tabs} activeKey={activeKey} onSelect={setTab} />
      <TabPanel tab={active} context={context} />

      <Dialog open={confirmApply} onOpenChange={setConfirmApply}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.imports.apply}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">{t.imports.applyConfirm}</p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li>
                {t.imports.masterRecords}:{' '}
                <span className="font-medium tabular-nums">{run.rowsMaster}</span>
              </li>
              <li>
                {t.imports.continuationRows}:{' '}
                <span className="font-medium tabular-nums">{run.rowsContinuation}</span>
              </li>
              <li>
                {t.imports.warnings}:{' '}
                <span className="font-medium tabular-nums">{run.warningCount}</span> ·{' '}
                {t.imports.errors}:{' '}
                <span className="font-medium tabular-nums">{run.errorCount}</span>
              </li>
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApply(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => apply.mutate()} loading={apply.isPending}>
              {t.imports.apply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ImportDetailPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <ImportDetailContent />
    </Suspense>
  );
}
