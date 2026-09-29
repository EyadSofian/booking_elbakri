import ExcelJS from 'exceljs';
import { agency, hotelKey, mealPlan, nationality, parseWorkbook, pax, sourceKeys, tidyName, type HotelRecord, type TransferRecord } from './sheet-parser';

/** Builds a workbook laid out like the operations sheets (title, header, merged 2-row records). */
async function workbook(sheets: Array<{ name: string; header: string[]; rows: unknown[][] }>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.getCell('A1').value = 'ELBAKRI OVER SEAS';
    ws.getRow(6).values = s.header;
    let r = 8;
    for (const values of s.rows) {
      ws.getRow(r).values = values as ExcelJS.CellValue[];
      // Each record spans two physical rows, as in the real sheets.
      ws.mergeCells(r, 1, r + 1, 1);
      r += 2;
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('value clean-up', () => {
  it('folds agency spellings together', () => {
    expect(agency('sama  tours')).toBe('SAMA TOURS');
    expect(agency('SAMA')).toBe('SAMA TOURS');
    expect(agency('samah')).toBe('SAMAH');
    expect(agency('tazkra')).toBe('TAZKARA');
    expect(agency('yelow')).toBe('YELLOW');
    expect(agency('YALOW')).toBe('YELLOW');
    expect(agency('discover')).toBe('DISCOVERY');
    expect(agency('البكري اوفرسيز')).toBe('ELBAKRI OVERSEAS');
    expect(agency('ELBAKRIOVER ESAS')).toBe('ELBAKRI OVERSEAS');
    expect(agency('NO')).toBeNull();
  });

  it('standardises single-word nationalities only', () => {
    expect(nationality('leb')).toBe('Lebanese');
    expect(nationality('EGY')).toBe('Egyptian');
    expect(nationality('ALAGERIA')).toBe('Algerian');
    expect(nationality('1 Algerian + 1 French')).toBe('1 Algerian + 1 French');
  });

  it('recognises meal plans in English shorthand and Arabic', () => {
    expect(mealPlan('SAI')).toBe('Soft All Inclusive');
    expect(mealPlan('soft all')).toBe('Soft All Inclusive');
    expect(mealPlan('all incluisve')).toBe('All Inclusive');
    expect(mealPlan('B>B')).toBe('Bed & Breakfast');
    expect(mealPlan('H ,B')).toBe('Half Board');
    expect(mealPlan('سـوفت اول انكلوسيف')).toBe('Soft All Inclusive');
  });

  it('reads passenger counts', () => {
    expect(pax('2 + 1 CH')).toEqual({ adults: 2, children: 1, note: null });
    expect(pax('4 Adult + 2 CH')).toEqual({ adults: 4, children: 2, note: null });
    expect(pax(8)).toEqual({ adults: 8, children: null, note: null });
    expect(pax('3 with child')).toEqual({ adults: 3, children: null, note: '3 with child' });
  });

  it('tidies names without losing deliberate casing', () => {
    expect(tidyName('RAMSES HILTON ')).toBe('Ramses Hilton');
    expect(tidyName('IL Mercato')).toBe('IL Mercato');
    expect(tidyName('وايـت هيلــز')).toBe('وايت هيلز');
    expect(hotelKey('Rixos  radamis ')).toBe(hotelKey('RIXOS RADAMIS'));
  });
});

describe('parseWorkbook', () => {
  it('reads a hotel sheet, carrying the guest onto blank-name rows', async () => {
    const buffer = await workbook([
      {
        name: 'Sheet1',
        header: ['NAME', null, null, 'NATIONALITY', null, 'PHONE', null, 'CHECK IN', null, 'CHECK OUT', null, 'HOTEL', null, null, 'TYPE ROOM', null, 'MEAL PLAN', null, 'BOOKING DATE', null, 'TRAVEL AGENCY'] as string[],
        rows: [
          ['test guest one', null, null, 'EGY', null, 1000000001, null, new Date(Date.UTC(2025, 4, 26)), null, new Date(Date.UTC(2025, 4, 30)), null, 'marina wadi degla', null, null, '1 dbl', null, 'half board', null, new Date(Date.UTC(2025, 4, 9)), null, 'albakri overseas'],
          [null, null, null, null, null, null, null, new Date(Date.UTC(2025, 4, 28)), null, new Date(Date.UTC(2025, 4, 30)), null, null, null, null, 'triple room'],
          ['test guest two', null, null, 'lebanes', null, null, null, new Date(Date.UTC(2025, 11, 29)), null, new Date(Date.UTC(2025, 0, 2)), null, 'albatros palace', null, null, '1 dbl', null, 'all', null, null, null, 'sama'],
        ],
      },
    ]);
    const [sheet] = await parseWorkbook(buffer);
    expect(sheet.kind).toBe('HOTEL');
    const records = sheet.records as HotelRecord[];
    // Merged cells must not duplicate a booking.
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      guestName: 'Test Guest One', nationality: 'Egyptian', phone: '+201000000001', hotel: 'Marina Wadi Degla',
      mealPlan: 'Half Board', agency: 'ELBAKRI OVERSEAS', checkIn: '2025-05-26', checkOut: '2025-05-30',
    });
    // The continuation row belongs to the same guest and the same hotel.
    expect(records[1]).toMatchObject({ guestName: 'Test Guest One', hotel: 'Marina Wadi Degla', rooms: 'triple room', checkIn: '2025-05-28' });
    // "29 Dec → 2 Jan" typed with last year on the check-out is read as next year.
    expect(records[2]).toMatchObject({ guestName: 'Test Guest Two', checkIn: '2025-12-29', checkOut: '2026-01-02', agency: 'SAMA TOURS' });
  });

  it('reads a transfer sheet and fixes swapped flight / pickup columns', async () => {
    const buffer = await workbook([
      {
        name: 'TRANSFER',
        header: ['NAME', null, null, 'PHONE', null, 'FROM', null, 'TO', null, 'PAXS', null, 'NATIONALITY', null, 'DATE', null, 'FLIGHT NUMBER', null, 'PICKUP', null, 'TRAVEL AGENCY'] as string[],
        rows: [
          ['Test Guest Three', null, null, 96170000001, null, 'Cairo Airport', null, 'The Muse Pyramids Inn', null, '2 + 1 CH', null, 'leb', null, new Date(Date.UTC(2026, 8, 30)), null, new Date(Date.UTC(1899, 11, 30, 19, 35)), null, 'ME 306', null, 'Yellow'],
          [null, null, null, null, null, 'The Muse Pyramids Inn', null, 'Cairo Airport', null, null, null, null, null, new Date(Date.UTC(2026, 9, 5)), null, 'ME 307', null, new Date(Date.UTC(1899, 11, 30, 20, 35))],
        ],
      },
    ]);
    const [sheet] = await parseWorkbook(buffer);
    expect(sheet.kind).toBe('TRANSFER');
    const [arrival, departure] = sheet.records as TransferRecord[];
    expect(arrival).toMatchObject({ guestName: 'Test Guest Three', flightNo: 'ME 306', time: '19:35', adults: 2, children: 1, agency: 'YELLOW' });
    expect(departure).toMatchObject({ guestName: 'Test Guest Three', fromPlace: 'The Muse Pyramids Inn', flightNo: 'ME 307', time: '20:35', adults: 2 });
  });

  it('gives identical rows distinct fingerprints and repeats them on a re-read', async () => {
    const rec = { kind: 'EXCURSION' as const, row: 1, guestName: 'A', phone: null, nationality: null, hotelName: null, activity: 'Safari', date: '2026-01-01', adults: 2, children: 0, agency: null, notes: null };
    const keys = sourceKeys([rec, { ...rec, row: 2 }]);
    expect(keys[0]).not.toBe(keys[1]);
    expect(sourceKeys([rec, { ...rec, row: 2 }])).toEqual(keys);
  });
});
