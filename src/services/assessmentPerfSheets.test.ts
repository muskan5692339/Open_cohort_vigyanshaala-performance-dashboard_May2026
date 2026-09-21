import { describe, expect, it } from 'vitest';
import {
  mergeAssessmentPerfIntoRows,
  parseAssessmentPerfSheets,
} from './assessmentPerfSheets';

describe('parseAssessmentPerfSheets', () => {
  it('maps Assignment_Perf status and Quiz_Perf scores by email', () => {
    const parsed = parseAssessmentPerfSheets([
      {
        name: 'Assignment_Perf',
        rows: [
          ['', '', '', '', '', '', '', '', '', '', '', '', '', 'Career Exploration', 'Career Exploration', 'SWOT', 'SWOT'],
          ['S.NO', 'STUDENT_ID', 'EMAIL', 'FULL NAME', 'PHONE', 'LOCATION', 'COLLEGE', 'UNI', 'CAT', 'PARTNER', 'ATT', 'Total', 'Overall', 'Status', 'Score', 'Status', 'Score'],
          ['1', '1', 'a@x.com', 'A', '', '', '', '', '', '', '', '', '', 'No Submission', '0', 'accepted', '80'],
          ['2', '2', 'b@x.com', 'B', '', '', '', '', '', '', '', '', '', 'under review', '', 'draft', ''],
        ],
      },
      {
        name: 'Quiz_Perf',
        rows: [
          ['S.NO', 'STUDENT_ID', 'EMAIL', 'FULL NAME', 'PHONE', 'LOCATION', 'COLLEGE', 'UNI', 'CAT', 'PARTNER', 'ATT', 'Total', 'Overall', 'Quiz 1', 'Quiz 2', 'Quiz 3', 'Quiz 4'],
          ['1', '1', 'a@x.com', 'A', '', '', '', '', '', '', '', '', '', '86.67', '100', '0', ''],
          ['2', '2', 'b@x.com', 'B', '', '', '', '', '', '', '', '', '', '0', '0', '0', '0'],
        ],
      },
    ]);

    expect(parsed.assignmentColumns).toEqual([
      'Assignment1_Career Exploration',
      'Assignment2_SWOT',
    ]);
    expect(parsed.quizColumns).toEqual([
      'Quiz 1 Score',
      'Quiz 2 Score',
      'Quiz 3 Score',
      'Quiz 4 Score',
    ]);
    expect(parsed.byEmail.get('a@x.com')).toMatchObject({
      'Assignment1_Career Exploration': 'No Submission',
      'Assignment2_SWOT': 'accepted',
      'Quiz 1 Score': '86.67',
      'Quiz 2 Score': '100',
    });
  });

  it('merges fields into Overall Performance rows', () => {
    const merge = parseAssessmentPerfSheets([
      {
        name: 'Assignment_Perf',
        rows: [
          ['', '', '', 'Career Exploration', 'Career Exploration'],
          ['EMAIL', 'NAME', 'X', 'Status', 'Score'],
          ['a@x.com', 'A', '', 'accepted', '90'],
        ],
      },
      {
        name: 'Quiz_Perf',
        rows: [
          ['EMAIL', 'Quiz 1'],
          ['a@x.com', '75'],
        ],
      },
    ]);
    const result = mergeAssessmentPerfIntoRows(
      ['EMAIL', 'FULL NAME', 'Attendance %'],
      [{ EMAIL: 'a@x.com', 'FULL NAME': 'A', 'Attendance %': '80' }],
      merge,
    );
    expect(result.headers).toContain('Assignment1_Career Exploration');
    expect(result.headers).toContain('Quiz 1 Score');
    expect(result.rawRows[0]['Assignment1_Career Exploration']).toBe('accepted');
    expect(result.rawRows[0]['Quiz 1 Score']).toBe('75');
  });
});
