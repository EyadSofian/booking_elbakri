'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { todayIso } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface ReportDefinition {
  key: string;
  title: string;
  titleAr?: string | null;
  description: string | null;
  /** Whether the report also offers the original spreadsheet column layout. */
  supportsLegacyLayout: boolean;
  supportsDateRange: boolean;
}

export default function ReportsPage() {
  const { t, locale, errorMessage } = useI18n();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['reports'],
    queryFn: () => api.get<ReportDefinition[]>('/reports'),
  });

  const download = async (report: ReportDefinition, legacy: boolean) => {
    const id = `${report.key}-${legacy}`;
    setBusy(id);
    try {
      await api.download(`/reports/${report.key}.xlsx`, {
        dateFrom: report.supportsDateRange && dateFrom ? dateFrom : undefined,
        dateTo: report.supportsDateRange && dateTo ? dateTo : undefined,
        legacyLayout: legacy ? 'true' : undefined,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title={t.reports.title} description={t.reports.legacyLayoutHint} />

      <Card className="mb-4">
        <CardHeader className="border-b">
          <CardTitle>{t.reports.dateRange}</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dateFrom">{t.common.from}</Label>
              <Input
                id="dateFrom" type="date" value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateTo">{t.common.to}</Label>
              <Input
                id="dateTo" type="date" value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={() => { setDateFrom(todayIso()); setDateTo(todayIso()); }}
            >
              {t.common.today}
            </Button>
            {dateFrom || dateTo ? (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                {t.common.clearFilters}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(query.data ?? []).map((report) => (
            <Card key={report.key} className="flex flex-col">
              <CardHeader className="flex-1">
                <CardTitle className="flex items-start gap-2">
                  <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{(locale === 'ar' && report.titleAr) || report.title}</span>
                </CardTitle>
                {report.description ? (
                  <p className="text-xs text-muted-foreground">{report.description}</p>
                ) : null}
                {report.supportsDateRange && (dateFrom || dateTo) ? (
                  <Badge variant="outline" className="mt-1 w-fit">
                    {dateFrom || '…'} → {dateTo || '…'}
                  </Badge>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pt-0">
                <Button
                  size="sm"
                  onClick={() => download(report, false)}
                  loading={busy === `${report.key}-false`}
                >
                  <Download className="size-3.5" aria-hidden />
                  {t.reports.download}
                </Button>
                {report.supportsLegacyLayout ? (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => download(report, true)}
                    loading={busy === `${report.key}-true`}
                    title={t.reports.legacyLayoutHint}
                  >
                    {t.reports.legacyLayout}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!query.isLoading && (query.data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="mx-auto size-6 text-muted-foreground/50" aria-hidden />
            <p className="mt-2 text-xs text-muted-foreground">{t.common.noResults}</p>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
