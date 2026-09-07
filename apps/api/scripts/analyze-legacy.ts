/**
 * Dry-run the import analyzer over the supplied legacy workbooks and print the
 * reconciliation report. Reads only; writes nothing to the database.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ImportAnalyzerService } from '../src/modules/imports/import-analyzer.service';

const FILES = [
  'ELBAKRI OVER SEAS BOOKING .xlsx',
  'ُELBAKRI OVER SEAS EX.xlsx',
  'ELBAKRI OVER SEAS FOR TRANSFER .xlsx',
  'PYAMNT.xlsx',
];

async function main() {
  const root = resolve(__dirname, '../../../data/legacy');
  const analyzer = new ImportAnalyzerService();

  for (const file of FILES) {
    const buf = readFileSync(resolve(root, file));
    const result = await analyzer.analyze(buf, file);
    console.log('='.repeat(90));
    console.log(`WORKBOOK: ${file}`);
    for (const s of result.sheets) {
      const r = s.reconciliation;
      console.log(`  SHEET "${s.sheetName}"  kind=${s.detectedKind}  header=${s.headerRow}  label=${s.label}`);
      console.log(`    scanned=${r.scanned} accountedFor=${r.accountedFor} balanced=${r.balanced}`);
      console.log(`    masters=${r.masterRecords} continuations=${r.continuationRows} structural=${r.structuralRows} blank=${r.blankRows} orphans=${r.orphanRows}`);
      console.log(`    mapping=${JSON.stringify(s.columnMapping)}`);
      console.log(`    unmappedColumns=${JSON.stringify(s.unmappedColumns)}`);
      const bySeverity = s.issues.reduce<Record<string, number>>((a, i) => { a[i.severity] = (a[i.severity] ?? 0) + 1; return a; }, {});
      const byCategory = s.issues.reduce<Record<string, number>>((a, i) => { a[i.category] = (a[i.category] ?? 0) + 1; return a; }, {});
      console.log(`    issues=${s.issues.length} ${JSON.stringify(bySeverity)}`);
      console.log(`    categories=${JSON.stringify(byCategory)}`);
      for (const i of s.issues.filter((x) => x.severity === 'ERROR').slice(0, 6)) {
        console.log(`      ERROR r${i.rowNumber} ${i.field}: ${i.message}`);
      }
    }
    console.log(`  TOTALS ${JSON.stringify(result.totals)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
