/**
 * Imports the ELBAKRI workbooks from a folder, using the same importer as the
 * Settings → Import screen.
 *
 *   npm run import:sheets -w @elbakri/api -- --dir ~/Downloads/sheets          # preview only
 *   npm run import:sheets -w @elbakri/api -- --dir ~/Downloads/sheets --apply  # import
 *
 * Hotel bookings are imported before the payment sheet, because payment rows
 * are matched to hotel bookings that must already exist.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ImportsService } from '../src/modules/imports/imports.module';
import { parseWorkbook } from '../src/modules/imports/sheet-parser';

const APPLY = process.argv.includes('--apply');
const dirFlag = process.argv.indexOf('--dir');
const DIR = resolve(dirFlag > -1 ? process.argv[dirFlag + 1] : resolve(__dirname, '../../../data/legacy'));

const ORDER = ['HOTEL', 'TRANSFER', 'VISA', 'EXCURSION', 'SALES', 'PAYMENT'];

async function main(): Promise<void> {
  const files = readdirSync(DIR).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'));
  const ranked: Array<{ file: string; rank: number }> = [];
  for (const file of files) {
    const sheets = await parseWorkbook(readFileSync(resolve(DIR, file)));
    const kinds = sheets.map((s) => s.kind).filter(Boolean) as string[];
    if (!kinds.length) {
      console.log(`skip  ${file} (no booking sheet recognised)`);
      continue;
    }
    ranked.push({ file, rank: Math.min(...kinds.map((k) => ORDER.indexOf(k))) });
  }
  ranked.sort((a, b) => a.rank - b.rank);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const imports = app.get(ImportsService);
  for (const { file } of ranked) {
    const result = await imports.run(readFileSync(resolve(DIR, file)), basename(file), APPLY, null);
    console.log(`\n${APPLY ? 'IMPORTED' : 'PREVIEW '}  ${file}`);
    for (const s of result.sheets) {
      if (!s.kind) {
        console.log(`  - ${s.name}: not a booking sheet`);
        continue;
      }
      const extra = s.kind === 'PAYMENT' ? ` matched=${s.matched} unmatched=${s.unmatched.length}` : '';
      console.log(`  - ${s.name} [${s.kind}] rows=${s.rows} new=${s.fresh} existing=${s.existing} created=${s.created}${extra} skipped=${s.skipped.length}`);
      for (const k of s.skipped.slice(0, 5)) console.log(`      skipped row ${k.row}: ${k.reason}`);
      for (const u of s.unmatched.slice(0, 5)) console.log(`      unmatched row ${u.row}: ${u.label}`);
    }
  }
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
