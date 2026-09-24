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

  it('accepts Inc 14 Status A1 / Status A2 sub-headers', () => {
    const parsed = parseAssessmentPerfSheets([
      {
        name: 'Assignment_Perf',
        rows: [
          ['', '', 'Career Exploration', 'Career Exploration', 'SWOT', 'SWOT'],
          ['EMAIL', 'NAME', 'Status A1', 'Score A1', 'Status A2', 'Score A2'],
          ['a@x.com', 'A', 'accepted', '90', 'No Submission', '0'],
        ],
      },
    ]);
    expect(parsed.assignmentColumns).toEqual([
      'Assignment1_Career Exploration',
      'Assignment2_SWOT',
    ]);
    expect(parsed.byEmail.get('a@x.com')).toMatchObject({
      'Assignment1_Career Exploration': 'accepted',
      'Assignment2_SWOT': 'No Submission',
    });
  });

  it('omits Quiz_Perf columns when all scores are blank (uncached formulas)', () => {
    const parsed = parseAssessmentPerfSheets([
      {
        name: 'Quiz_Perf',
        rows: [
          ['EMAIL', 'Quiz 1', 'Quiz 2'],
          ['a@x.com', '', ''],
          ['b@x.com', '', ''],
        ],
      },
    ]);
    expect(parsed.quizColumns).toEqual([]);
    expect(parsed.byEmail.get('a@x.com')?.['Quiz 1 Score']).toBeUndefined();
  });

  it('fills new Quiz columns from Quiz_Source when Quiz_Perf already has older quizzes', () => {
    const parsed = parseAssessmentPerfSheets([
      {
        name: 'Quiz_Perf',
        rows: [
          ['EMAIL', 'Quiz 1', 'Quiz 2', 'Quiz 5'],
          ['a@x.com', '80', '90', ''],
        ],
      },
      {
        name: 'Quiz_Source',
        rows: [
          ['EMAIL', 'Quiz 1', 'Quiz 2', 'Quiz 5 Score'],
          ['a@x.com', '80', '90', '95'],
        ],
      },
    ]);
    expect(parsed.quizColumns).toEqual([
      'Quiz 1 Score',
      'Quiz 2 Score',
      'Quiz 5 Score',
    ]);
    expect(parsed.byEmail.get('a@x.com')).toMatchObject({
      'Quiz 1 Score': '80',
      'Quiz 2 Score': '90',
      'Quiz 5 Score': '95',
    });
  });

  it('merges Assignment_Source feedback onto matching assignment columns', () => {
    const merge = parseAssessmentPerfSheets([
      {
        name: 'Assignment_Perf',
        rows: [
          ['', '', 'Career Exploration', 'Career Exploration', 'SWOT', 'SWOT'],
          ['EMAIL', 'NAME', 'Status A1', 'Score A1', 'Status A2', 'Score A2'],
          ['a@x.com', 'A', 'accepted', '90', 'rejected', '0'],
        ],
      },
      {
        name: 'Assignment_Source',
        rows: [
          // Pad to columns C (2), K (10), R (17)
          [
            'S.NO', 'ID', 'Student Email', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
            'feedback_comments', 'L', 'M', 'N', 'O', 'P', 'Q', 'Assignment Name',
          ],
          [
            '1', '1', 'a@x.com', '', '', '', '', '', '', '',
            'Please add more reflection on strengths.', '', '', '', '', '', '', 'Career Exploration',
          ],
          [
            '2', '1', 'a@x.com', '', '', '', '', '', '', '',
            'Revise SWOT threats section.', '', '', '', '', '', '', 'SWOT',
          ],
        ],
      },
    ]);

    expect(merge.feedbackByEmail.get('a@x.com')?.get('careerexploration')).toContain('reflection');
    const result = mergeAssessmentPerfIntoRows(
      ['EMAIL', 'FULL NAME'],
      [{ EMAIL: 'a@x.com', 'FULL NAME': 'A' }],
      merge,
    );
    expect(result.rawRows[0]['Assignment1_Career Exploration_comments']).toContain('reflection');
    expect(result.rawRows[0]['Assignment2_SWOT_comments']).toContain('threats');
    expect(result.headers).toContain('Assignment1_Career Exploration_comments');
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
