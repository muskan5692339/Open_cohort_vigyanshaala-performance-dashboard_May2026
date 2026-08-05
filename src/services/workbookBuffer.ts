/** Read an Excel file once; reuse the buffer for preview + import (avoids stale File handles on Windows). */
export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer();
  } catch {
    throw new Error(
      'Could not read the file. Please choose it again — close Excel if it is open, save a local copy, and re-upload.',
    );
  }
}

export async function loadWorkbookFromBuffer(buffer: ArrayBuffer) {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}
