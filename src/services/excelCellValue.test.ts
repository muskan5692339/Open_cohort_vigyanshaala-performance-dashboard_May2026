import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { excelCellToString, readExcelRow } from './excelCellValue';

describe('excelCellToString', () => {
  it('returns empty string for empty merged cells without throwing', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Merged');
    ws.mergeCells('A1:C1');

    const merged = ws.getRow(1).getCell(2);
    expect(() => excelCellToString(merged)).not.toThrow();
    expect(excelCellToString(merged)).toBe('');
  });

  it('reads cached formula results from value objects', () => {
    expect(
      excelCellToString({
        value: { formula: 'VLOOKUP(A1,B:C,2,FALSE)', result: 'student@example.com' },
      }),
    ).toBe('student@example.com');
  });

  it('reads full rows that contain empty merged cells', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet');
    ws.getRow(1).getCell(1).value = 'Email';
    ws.getRow(1).getCell(2).value = 'Name';
    ws.mergeCells('A2:C2');
    ws.getRow(3).getCell(1).value = 'a@example.com';
    ws.getRow(3).getCell(2).value = 'Ada';

    expect(() => readExcelRow(ws.getRow(2), 2)).not.toThrow();
    expect(readExcelRow(ws.getRow(3), 2)).toEqual(['a@example.com', 'Ada']);
  });
});
