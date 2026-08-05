import { describe, expect, it } from 'vitest';
import { isClassWiseOnlySheet, sheetHasPerformanceColumns } from './sheetSelection';

describe('isClassWiseOnlySheet', () => {
  it('detects class-wise attendance headers', () => {
    const headers = [
      'S.No',
      'email',
      'Full Name',
      'WK0_SUK_Saturday',
      'WK1_WS_Monday',
      'Pre-recorded_WK3_V1',
      'Count',
    ];
    expect(isClassWiseOnlySheet(headers)).toBe(true);
    expect(sheetHasPerformanceColumns(headers)).toBe(false);
  });

  it('detects performance sheet headers', () => {
    const headers = ['Email', 'Name', 'Assignment SWOT', 'Quiz 1 Career Exploration', 'Final Score'];
    expect(isClassWiseOnlySheet(headers)).toBe(false);
    expect(sheetHasPerformanceColumns(headers)).toBe(true);
  });
});
