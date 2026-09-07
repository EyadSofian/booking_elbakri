import { ImportRowKind } from '../domain/enums';
import { groupLegacyRows, looksLikeSectionLabel, reconcileGrouping, RawRow } from './rows';

const TRANSFER_OPTS = {
  masterField: 'name',
  serviceFields: ['from', 'to', 'date', 'flight', 'pickup', 'pax', 'phone', 'nationality', 'agency', 'notes'],
  headerRow: 6,
};

/** Mirrors rows 6-14 of the real TRANSFER worksheet. */
const transferRows: RawRow[] = [
  { rowNumber: 1, values: { name: 'ELBAKRI OVER SEAS TRANSFER' } },
  { rowNumber: 6, values: { name: 'NAME', from: 'FROM', to: 'TO' } },
  { rowNumber: 8, values: { name: 'ANDRE JO BEILY', from: 'AIRPORT SHARM', to: 'SUNRISE ARABIAN', date: '2025-05-04', flight: 'ME3700', pickup: '19 : 20', agency: 'TAZKARA' } },
  { rowNumber: 9, values: {} },
  { rowNumber: 10, values: { from: 'SUNRISE ARABIAN', to: 'AIRPORT SHARM', date: '2025-05-09', flight: 'LX 8141', pickup: '9 :30 AM' } },
  { rowNumber: 11, values: { name: 'CATHERINE AZER', from: 'SHARM AIRPORT', to: 'THE GRAND HOTEL', date: '2025-05-22', flight: 'UF004', pickup: '13 : 00' } },
  { rowNumber: 12, values: { from: 'THE GRAND HOTEL', to: 'SHARM AIRPORT', date: '2025-05-26', flight: 'UF001', pickup: '11 : 30' } },
];

describe('groupLegacyRows — TRANSFER return legs', () => {
  const result = groupLegacyRows(transferRows, TRANSFER_OPTS);

  it('creates one master per named traveller, never one per leg', () => {
    expect(result.records).toHaveLength(2);
    expect(result.records.map((r) => r.master.values.name)).toEqual(['ANDRE JO BEILY', 'CATHERINE AZER']);
  });

  it('attaches the blank-name return leg to the traveller above it', () => {
    expect(result.records[0].continuations).toHaveLength(1);
    expect(result.records[0].continuations[0].values.to).toBe('AIRPORT SHARM');
    expect(result.records[1].continuations).toHaveLength(1);
  });

  it('never produces an anonymous traveller', () => {
    const anonymous = result.records.filter((r) => !r.master.values.name);
    expect(anonymous).toHaveLength(0);
  });

  it('classifies the banner and header rows as structure', () => {
    expect(result.rows.find((r) => r.rowNumber === 1)!.kind).toBe(ImportRowKind.BANNER);
    expect(result.rows.find((r) => r.rowNumber === 6)!.kind).toBe(ImportRowKind.HEADER);
  });

  it('does not break a group across the blank spacer row', () => {
    expect(result.rows.find((r) => r.rowNumber === 9)!.kind).toBe(ImportRowKind.BLANK);
    expect(result.rows.find((r) => r.rowNumber === 10)!.kind).toBe(ImportRowKind.CONTINUATION);
    expect(result.rows.find((r) => r.rowNumber === 10)!.masterRowNumber).toBe(8);
  });

  it('accounts for every scanned row', () => {
    const rec = reconcileGrouping(result);
    expect(rec.balanced).toBe(true);
    expect(rec.accountedFor).toBe(rec.scanned);
  });
});

describe('groupLegacyRows — EX multi-activity orders', () => {
  /** Mirrors rows 12-16 of the real excursions worksheet. */
  const rows: RawRow[] = [
    { rowNumber: 6, values: { name: 'NAME', ex: 'EX' } },
    { rowNumber: 12, values: { name: 'NAWEL BELHADI', pax: 3, hotel: 'NOVOTEL BEACH', ex: 'RAS MOHAMED', date: '2025-05-14' } },
    { rowNumber: 13, values: {} },
    { rowNumber: 14, values: { ex: 'GLASS BOAT', date: '2025-05-15' } },
    { rowNumber: 15, values: { ex: 'SAFRI DBL', date: '2025-05-15' } },
    { rowNumber: 16, values: { ex: 'DAHAB', date: '2025-05-16' } },
  ];
  const result = groupLegacyRows(rows, {
    masterField: 'name',
    serviceFields: ['pax', 'child', 'phone', 'nationality', 'hotel', 'ex', 'date', 'rest', 'agency', 'notes'],
    headerRow: 6,
  });

  it('produces one order with four activities, not four anonymous customers', () => {
    expect(result.records).toHaveLength(1);
    expect(result.records[0].continuations).toHaveLength(3);
    const activities = [
      result.records[0].master.values.ex,
      ...result.records[0].continuations.map((c) => c.values.ex),
    ];
    expect(activities).toEqual(['RAS MOHAMED', 'GLASS BOAT', 'SAFRI DBL', 'DAHAB']);
  });
});

describe('groupLegacyRows — section rows', () => {
  /** Row 18 of the real VISA worksheet reads "new 2026" and is not a traveller. */
  const rows: RawRow[] = [
    { rowNumber: 6, values: { name: 'NAME' } },
    { rowNumber: 16, values: { name: 'ELIAS', from: 'BEURIT', to: 'CAIRO', pax: 1 } },
    { rowNumber: 18, values: { name: '                                        new 2026 ' } },
    { rowNumber: 20, values: { name: 'celine', from: 'BEURIT', to: 'CAIRO', pax: 1 } },
  ];
  const result = groupLegacyRows(rows, {
    masterField: 'name',
    serviceFields: ['phone', 'from', 'to', 'pax', 'nationality', 'date', 'agency', 'net', 'sell'],
    headerRow: 6,
  });

  it('does not create a traveller called "new 2026"', () => {
    expect(result.records.map((r) => r.master.values.name)).toEqual(['ELIAS', 'celine']);
  });

  it('records the divider as a section', () => {
    expect(result.sections).toEqual([{ rowNumber: 18, label: 'new 2026' }]);
    expect(result.rows.find((r) => r.rowNumber === 18)!.kind).toBe(ImportRowKind.SECTION);
  });

  it('stamps rows after the divider with the section label', () => {
    expect(result.records[1].sectionLabel).toBe('new 2026');
    expect(result.records[0].sectionLabel).toBeNull();
  });
});

describe('groupLegacyRows — orphan continuation rows', () => {
  const rows: RawRow[] = [
    { rowNumber: 6, values: { name: 'NAME' } },
    { rowNumber: 8, values: { from: 'AIRPORT', to: 'HOTEL', date: '2025-05-01' } },
  ];
  const result = groupLegacyRows(rows, {
    masterField: 'name', serviceFields: ['from', 'to', 'date'], headerRow: 6,
  });

  it('raises an orphan rather than inventing a nameless traveller', () => {
    expect(result.records).toHaveLength(0);
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0].rowNumber).toBe(8);
  });

  it('still balances the reconciliation', () => {
    expect(reconcileGrouping(result).balanced).toBe(true);
  });
});

describe('groupLegacyRows — a long gap closes the active record', () => {
  const rows: RawRow[] = [
    { rowNumber: 1, values: { name: 'NAME' } },
    { rowNumber: 2, values: { name: 'AHMED', from: 'A', to: 'B' } },
    { rowNumber: 3, values: {} }, { rowNumber: 4, values: {} },
    { rowNumber: 5, values: {} }, { rowNumber: 6, values: {} },
    { rowNumber: 7, values: {} }, { rowNumber: 8, values: {} },
    { rowNumber: 9, values: { from: 'X', to: 'Y' } },
  ];
  const result = groupLegacyRows(rows, {
    masterField: 'name', serviceFields: ['from', 'to'], headerRow: 1, maxBlankGap: 3,
  });

  it('does not attach a far-away row to a stale master', () => {
    expect(result.records[0].continuations).toHaveLength(0);
    expect(result.orphans).toHaveLength(1);
  });
});

describe('looksLikeSectionLabel', () => {
  it('recognises year dividers', () => {
    expect(looksLikeSectionLabel('new 2026', true)).toBe(true);
    expect(looksLikeSectionLabel('2026', true)).toBe(true);
  });
  it('never treats a value as a divider when the row carries service data', () => {
    expect(looksLikeSectionLabel('new 2026', false)).toBe(false);
  });
  it('does not mistake a traveller name for a divider', () => {
    expect(looksLikeSectionLabel('JOSEPH FAKHRY', true)).toBe(false);
    expect(looksLikeSectionLabel('celine', true)).toBe(false);
  });
});
