import { describe, expect, it } from 'vitest';
import {
  findOverallSheetName,
  isAllowedCohortSheetName,
  isClassWiseAttendanceSheetName,
  isClassWiseOnlySheet,
  isOverallSheetName,
  recommendImportSheet,
  sheetHasPerformanceColumns,
} from './sheetSelection';

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

describe('allowed cohort sheets', () => {
  it('accepts only Overall and Class-wise Attendance by name', () => {
    expect(isOverallSheetName('Overall')).toBe(true);
    expect(isOverallSheetName('Overall_to_be_graduated')).toBe(false);
    expect(isClassWiseAttendanceSheetName('Class-wise Attendance')).toBe(true);
    expect(isAllowedCohortSheetName('Overall_to_be_graduated')).toBe(false);
    expect(findOverallSheetName(['Overall_to_be_graduated', 'Overall', 'Notes'])).toBe('Overall');
  });

  it('recommends Overall over Overall_to_be_graduated', () => {
    const recommended = recommendImportSheet({
      sheetNames: ['Overall_to_be_graduated', 'Overall', 'Class-wise Attendance'],
      sheets: [
        {
          name: 'Overall_to_be_graduated',
          rowCount: 10,
          columnCount: 5,
          headers: ['email', 'name'],
          previewRows: [],
          isEmpty: false,
        },
        {
          name: 'Overall',
          rowCount: 100,
          columnCount: 20,
          headers: ['email', 'Assignment1_SWOT', 'Quiz 1 Score'],
          previewRows: [],
          isEmpty: false,
        },
        {
          name: 'Class-wise Attendance',
          rowCount: 100,
          columnCount: 30,
          headers: ['email', 'WK0_SUK', 'WK1_WS'],
          previewRows: [],
          isEmpty: false,
        },
      ],
      recommendedSheet: null,
    });
    expect(recommended).toBe('Overall');
  });
});
