/**
 * Runs the real import pipeline over the supplied legacy workbooks:
 * upload -> analyse -> apply -> reconcile.
 *
 * This is the migration entry point and the acceptance check in one: it prints
 * the reconciliation report proving that every meaningful source row is
 * accounted for.
 *
 *   npm run import:legacy -w @elbakri/api -- [--apply] [--dir <path>]
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/common/services/prisma.service';
import { ReferenceService } from '../src/common/services/reference.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AliasResolverService } from '../src/modules/master-data/alias-resolver.service';
import { DataQualityService } from '../src/modules/data-quality/data-quality.service';
import { ImportAnalyzerService } from '../src/modules/imports/import-analyzer.service';
import { ImportApplierService } from '../src/modules/imports/import-applier.service';
import { ImportsService } from '../src/modules/imports/imports.service';

const APPLY = process.argv.includes('--apply');
const dirFlag = process.argv.indexOf('--dir');
const LEGACY_DIR = dirFlag > -1 ? process.argv[dirFlag + 1] : resolve(__dirname, '../../../data/legacy');

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

async function main(): Promise<void> {
  if (!existsSync(LEGACY_DIR)) {
    console.error(`Legacy directory not found: ${LEGACY_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(LEGACY_DIR).filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith('~$'));
  if (!files.length) {
    console.error(`No .xlsx workbooks found in ${LEGACY_DIR}`);
    process.exit(1);
  }

  const prisma = new PrismaService();
  await prisma.$connect();

  const config = new ConfigService({ STORAGE_ROOT: process.env.STORAGE_ROOT ?? './storage' });
  const audit = new AuditService(prisma);
  const references = new ReferenceService(prisma);
  const aliases = new AliasResolverService(prisma);
  const dataQuality = new DataQualityService(prisma, audit);
  const analyzer = new ImportAnalyzerService();
  const applier = new ImportApplierService(prisma, references, aliases, dataQuality);
  const imports = new ImportsService(prisma, config, analyzer, applier, aliases, dataQuality, audit);

  // The importer records who ran the migration, like any other mutation.
  const admin = await prisma.user.findFirst({
    where: { isActive: true, deletedAt: null, roles: { some: { role: { key: 'SUPER_ADMIN' } } } },
    select: { id: true, email: true },
  });
  if (!admin) {
    console.error('No active Super Admin found. Run the seed first.');
    process.exit(1);
  }

  console.log(`Legacy import ${APPLY ? '(APPLY)' : '(DRY RUN — analysis only)'}`);
  console.log(`Directory: ${LEGACY_DIR}`);
  console.log(`Actor:     ${admin.email}\n`);

  const summaries: Array<Record<string, unknown>> = [];

  for (const filename of files) {
    const buffer = readFileSync(resolve(LEGACY_DIR, filename));
    console.log('='.repeat(100));
    console.log(`WORKBOOK: ${filename}  (${(buffer.length / 1024).toFixed(0)} KB)`);

    let runId: string;
    try {
      const uploaded = await imports.upload(
        { originalname: filename, buffer, size: buffer.length },
        admin.id,
      );
      runId = uploaded.importRunId;
    } catch (err) {
      console.log(`  SKIPPED: ${(err as Error).message}\n`);
      continue;
    }

    const run = (await imports.reconciliation(runId)) as { reconciliation: ReconciliationReport };
    const report = run.reconciliation;

    console.log(
      `  ${pad('SHEET', 22)}${pad('LAYOUT', 20)}${pad('SCANNED', 9)}${pad('BLANK', 8)}` +
        `${pad('STRUCT', 8)}${pad('MASTER', 8)}${pad('CONT', 7)}${pad('UNRES', 7)}${pad('WARN', 6)}${pad('ERR', 6)}BALANCED`,
    );
    for (const s of report.sheets) {
      console.log(
        `  ${pad(s.sheet, 22)}${pad(s.detectedKind, 20)}${pad(s.rowsScanned, 9)}${pad(s.rowsIgnoredAsBlank, 8)}` +
          `${pad(s.headerAndSectionRows, 8)}${pad(s.masterRecords, 8)}${pad(s.continuationRows, 7)}` +
          `${pad(s.unresolvedRows, 7)}${pad(s.warnings, 6)}${pad(s.errors, 6)}${s.balanced ? 'yes' : 'NO'}`,
      );
    }
    console.log(
      `  TOTALS: scanned=${report.totals.rowsScanned} meaningful=${report.totals.meaningfulRows} ` +
        `accountedFor=${report.totals.accountedFor} balanced=${report.totals.balanced}`,
    );

    if (APPLY) {
      const result = await imports.apply(runId, admin.id);
      console.log(
        `  APPLIED: created=${result.recordsCreated} matched=${result.recordsMatched} issues=${result.issuesRaised}`,
      );
      summaries.push({ filename, ...result, runId });
    } else {
      summaries.push({ filename, runId, reconciliation: report.totals });
    }
    console.log();
  }

  if (APPLY) {
    console.log('='.repeat(100));
    console.log('POST-IMPORT COUNTS');
    const counts = {
      travelers: await prisma.traveler.count(),
      tripFiles: await prisma.tripFile.count(),
      hotelBookings: await prisma.hotelBooking.count(),
      hotelStaySegments: await prisma.hotelStaySegment.count(),
      transferBookings: await prisma.transferBooking.count(),
      transferLegs: await prisma.transferLeg.count(),
      excursionBookings: await prisma.excursionBooking.count(),
      excursionItems: await prisma.excursionItem.count(),
      visaOrders: await prisma.visaOrder.count(),
      financialDocuments: await prisma.financialDocument.count(),
      payments: await prisma.paymentTransaction.count(),
      settlements: await prisma.settlement.count(),
      dataQualityIssues: await prisma.dataQualityIssue.count(),
      aliasSuggestions: await prisma.aliasMapping.count({ where: { status: 'SUGGESTED' } }),
    };
    for (const [key, value] of Object.entries(counts)) {
      console.log(`  ${pad(key, 24)}${value}`);
    }

    console.log('\nDATA QUALITY ISSUES BY CATEGORY');
    const byCategory = await prisma.dataQualityIssue.groupBy({
      by: ['category', 'severity'],
      _count: { _all: true },
      orderBy: { category: 'asc' },
    });
    for (const row of byCategory) {
      console.log(`  ${pad(row.category, 40)}${pad(row.severity, 10)}${row._count._all}`);
    }
  }

  await prisma.$disconnect();
}

interface ReconciliationReport {
  sheets: Array<{
    sheet: string;
    detectedKind: string;
    rowsScanned: number;
    rowsIgnoredAsBlank: number;
    headerAndSectionRows: number;
    masterRecords: number;
    continuationRows: number;
    unresolvedRows: number;
    warnings: number;
    errors: number;
    balanced: boolean;
  }>;
  totals: {
    rowsScanned: number;
    meaningfulRows: number;
    accountedFor: number;
    balanced: boolean;
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
