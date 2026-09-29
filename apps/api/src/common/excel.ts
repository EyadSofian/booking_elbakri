import ExcelJS from 'exceljs';
import type { Response } from 'express';

export interface SheetColumn<T> {
  header: string;
  width?: number;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Streams a single-sheet workbook laid out like the original operations
 * sheets, so an exported list opens the way people are used to seeing it.
 */
export async function sendWorkbook<T>(
  res: Response,
  fileName: string,
  sheetName: string,
  columns: SheetColumn<T>[],
  rows: T[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ELBAKRI OVERSEAS';
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 16 }));
  for (const row of rows) sheet.addRow(columns.map((c) => c.value(row) ?? ''));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2352' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(Buffer.from(buffer));
}
