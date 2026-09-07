'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Database, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, type PaginatedResponse } from '@elbakri/shared';
import { api, ApiError } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ImportRun {
  id: string;
  sourceFilename: string;
  checksum: string;
  fileSizeBytes: number;
  status: string;
  createdAt: string;
  appliedAt: string | null;
  rowsScanned: number;
  rowsMaster: number;
  rowsContinuation: number;
  rowsOrphan: number;
  recordsCreated: number;
  recordsMatched: number;
  warningCount: number;
  errorCount: number;
  uploadedBy: { id: string; fullName: string } | null;
  _count: { sheets: number; issues: number };
}

export default function ImportsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const query = useQuery({
    queryKey: ['imports'],
    queryFn: () => api.get<PaginatedResponse<ImportRun>>('/imports', { pageSize: 50 }),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.upload<{ importRunId: string }>('/imports/analyze', file),
    onSuccess: (result) => {
      toast.success(t.imports.steps.analyze);
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
      router.push(`/imports/${result.importRunId}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        toast.error(t.imports.duplicateFile);
        return;
      }
      const code = (err as ApiError).code;
      toast.error((code && (t.errors as Record<string, string>)[code]) || t.errors.INTERNAL_ERROR);
    },
  });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      toast.error(t.errors.VALIDATION_FAILED);
      return;
    }
    upload.mutate(file);
  };

  return (
    <>
      <PageHeader
        title={t.imports.title}
        description={t.imports.uploadHint}
        actions={
          can(PERMISSIONS.IMPORTS_UPLOAD) ? (
            <Button size="sm" onClick={() => fileInput.current?.click()} loading={upload.isPending}>
              <Upload className="size-3.5" aria-hidden />
              {t.imports.newImport}
            </Button>
          ) : null
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {can(PERMISSIONS.IMPORTS_UPLOAD) ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`mb-4 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? 'border-brand-400 bg-accent/40' : 'border-border bg-card'
          }`}
        >
          <FileSpreadsheet className="mx-auto size-7 text-muted-foreground/60" aria-hidden />
          <p className="mt-2 text-sm font-medium">{t.imports.newImport}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.imports.uploadHint}</p>
        </div>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t.imports.title}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : (query.data?.data.length ?? 0) === 0 ? (
            <div className="py-14 text-center">
              <Database className="mx-auto size-7 text-muted-foreground/50" aria-hidden />
              <p className="mt-2 text-xs text-muted-foreground">{t.common.noResults}</p>
            </div>
          ) : (
            <ul className="divide-y">
              {query.data!.data.map((run) => {
                // Reconciliation holds when every meaningful row was mapped or
                // explicitly left unresolved — never silently dropped.
                const accounted = run.rowsMaster + run.rowsContinuation + run.rowsOrphan;
                return (
                  <li key={run.id}>
                    <Link
                      href={`/imports/${run.id}`}
                      className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{run.sourceFilename}</span>
                          <Badge variant={statusVariant(run.status)}>
                            {t.status[run.status as keyof typeof t.status] ?? run.status}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block text-2xs text-muted-foreground">
                          {formatDateTime(run.createdAt, locale)}
                          {run.uploadedBy ? ` · ${run.uploadedBy.fullName}` : ''}
                          {` · ${(run.fileSizeBytes / 1024).toFixed(0)} KB`}
                          {` · ${run._count.sheets} ${t.imports.sheets.toLowerCase()}`}
                        </span>
                      </span>

                      <span className="flex flex-wrap items-center gap-3 text-2xs">
                        <span className="text-muted-foreground">
                          {t.imports.rowsScanned}:{' '}
                          <span className="font-medium tabular-nums text-foreground">{run.rowsScanned}</span>
                        </span>
                        <span className="text-muted-foreground">
                          {t.imports.masterRecords}:{' '}
                          <span className="font-medium tabular-nums text-foreground">{run.rowsMaster}</span>
                        </span>
                        <span className="text-muted-foreground">
                          {t.imports.continuationRows}:{' '}
                          <span className="font-medium tabular-nums text-foreground">{run.rowsContinuation}</span>
                        </span>
                        {run.errorCount > 0 ? (
                          <Badge variant="danger">
                            {run.errorCount} {t.imports.errors.toLowerCase()}
                          </Badge>
                        ) : null}
                        {run.warningCount > 0 ? (
                          <Badge variant="warning">
                            {run.warningCount} {t.imports.warnings.toLowerCase()}
                          </Badge>
                        ) : null}
                        {run.rowsOrphan > 0 ? (
                          <Badge variant="danger">
                            <TriangleAlert className="size-3" aria-hidden />
                            {run.rowsOrphan} {t.imports.orphanRows.toLowerCase()}
                          </Badge>
                        ) : (
                          <Badge variant="success" title={t.imports.balanced}>
                            <CheckCircle2 className="size-3" aria-hidden />
                            {accounted}
                          </Badge>
                        )}
                        {run.status === 'APPLIED' ? (
                          <span className="text-muted-foreground">
                            {t.imports.recordsCreated}:{' '}
                            <span className="font-medium tabular-nums text-foreground">{run.recordsCreated}</span>
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
