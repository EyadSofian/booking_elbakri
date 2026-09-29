'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, FileSpreadsheet, Info, Upload } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateText } from '@/components/shared/format';

interface SheetResult {
  name: string;
  kind: string | null;
  rows: number;
  fresh: number;
  existing: number;
  created: number;
  matched: number;
  unmatched: Array<{ row: number; label: string }>;
  skipped: Array<{ row: number; reason: string }>;
  sample: Array<{ row: number; title: string; detail: string; date: string | null }>;
}

interface ImportResult {
  fileName: string;
  applied: boolean;
  sheets: SheetResult[];
}

interface Batch {
  id: string;
  fileName: string;
  kind: string;
  created: number;
  skipped: number;
  createdAt: string;
  user: { id: string; name: string } | null;
}

/**
 * Upload one of the ELBAKRI sheets, see exactly what it contains and what is
 * new, then import. Nothing is written until "Import" is pressed.
 */
export function ImportTab() {
  const { t, locale, errorMessage } = useI18n();
  const qc = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<ImportResult | null>(null);
  const [done, setDone] = React.useState<ImportResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const history = useQuery({ queryKey: ['/imports'], queryFn: () => api.get<Batch[]>('/imports') });

  const check = useMutation({
    mutationFn: (f: File) => api.upload<ImportResult>('/imports/preview', f),
    onSuccess: (r) => {
      setPreview(r);
      setDone(null);
    },
    onError: (e) => {
      setPreview(null);
      toast.error(errorMessage(e));
    },
  });

  const apply = useMutation({
    mutationFn: (f: File) => api.upload<ImportResult>('/imports/apply', f),
    onSuccess: (r) => {
      setDone(r);
      setPreview(null);
      const n = r.sheets.reduce((sum, s) => sum + s.created, 0);
      toast.success(t.settings.imported(n));
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pick = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setDone(null);
    if (f) check.mutate(f);
  };

  const toImport = preview?.sheets.reduce((sum, s) => sum + s.fresh, 0) ?? 0;
  const result = done ?? preview;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <h3 className="font-semibold">{t.settings.importTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t.settings.importHint}</p>
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-sun-subtle px-3 py-2 text-xs text-sun-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {t.settings.importOrder}
          </p>

          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0] ?? null);
            }}
            className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input bg-surface-muted px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-accent/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <span className="grid size-11 place-items-center rounded-full bg-surface text-primary shadow-xs">
              {check.isPending ? <Upload className="size-5 animate-bounce" /> : <FileSpreadsheet className="size-5" />}
            </span>
            <span className="text-sm font-medium">{file ? file.name : t.settings.chooseFile}</span>
            <span className="text-xs text-muted-foreground">{check.isPending ? t.settings.checking : '.xlsx'}</span>
          </label>
        </div>

        {result ? (
          <div className="space-y-3">
            {result.sheets.map((s) => (
              <div key={s.name} className="rounded-xl border bg-card p-4 shadow-xs animate-rise">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {t.settings.sheet}: {s.name}
                  </p>
                  {s.kind ? <Badge variant="brand">{t.settings.kinds[s.kind] ?? s.kind}</Badge> : <Badge variant="outline">{t.settings.notBooking}</Badge>}
                </div>
                {s.kind ? (
                  <>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      {(
                        [
                          [t.settings.rows, s.rows, ''],
                          [done ? t.common.created : t.settings.fresh, done ? s.created : s.fresh, 'text-success'],
                          [t.settings.existing, s.existing, 'text-muted-foreground'],
                          ...(s.kind === 'PAYMENT' ? ([[t.settings.unmatched, s.unmatched.length, 'text-sun-foreground dark:text-sun']] as const) : []),
                        ] as Array<readonly [string, number, string]>
                      ).map(([label, value, cls]) => (
                        <div key={label} className="rounded-lg bg-surface-muted px-3 py-2">
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className={cn('tabular text-lg font-semibold', cls)}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {s.sample.length && !done ? (
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t.settings.sample}</p>
                        <ul className="divide-y rounded-lg border text-sm">
                          {s.sample.map((r) => (
                            <li key={r.row} className="flex items-center gap-3 px-3 py-1.5">
                              <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">#{r.row}</span>
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-medium">{r.title}</span>
                                {r.detail ? <span className="text-muted-foreground"> · {r.detail}</span> : null}
                              </span>
                              <DateText value={r.date} className="text-xs text-muted-foreground" />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {s.unmatched.length ? (
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                          {t.settings.unmatched} ({s.unmatched.length})
                        </summary>
                        <ul className="scroll-thin mt-1.5 max-h-48 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                          {s.unmatched.map((u) => (
                            <li key={u.row}>
                              #{u.row} · {u.label}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    {s.skipped.length ? (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                          {t.settings.skipped} ({s.skipped.length})
                        </summary>
                        <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                          {s.skipped.map((k) => (
                            <li key={k.row}>
                              #{k.row} · {k.reason}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </>
                ) : null}
              </div>
            ))}

            {preview && file ? (
              <div className="flex justify-end">
                <Button size="lg" disabled={!toImport} loading={apply.isPending} onClick={() => apply.mutate(file)}>
                  <Upload />
                  {apply.isPending ? t.settings.importing : t.settings.importNow(toImport)}
                </Button>
              </div>
            ) : null}
            {done ? (
              <p className="flex items-center justify-end gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="size-4" />
                {t.settings.imported(done.sheets.reduce((sum, s) => sum + s.created, 0))}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card shadow-xs">
        <h3 className="border-b px-4 py-3 text-sm font-semibold">{t.settings.history}</h3>
        {history.data?.length ? (
          <ul className="scroll-thin max-h-[32rem] divide-y overflow-y-auto">
            {history.data.map((b) => (
              <li key={b.id} className="px-4 py-2.5 text-sm">
                <p className="truncate font-medium">{b.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {t.settings.kinds[b.kind] ?? b.kind} · +{b.created} · {formatDateTime(b.createdAt, locale)}
                  {b.user ? ` · ${b.user.name}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}
