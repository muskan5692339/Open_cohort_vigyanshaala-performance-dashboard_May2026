import { describe, expect, it } from 'vitest';
import {
  discoverNumberedAssignmentHeaders,
  discoverQuizScoreHeaders,
  extractAssessmentNumber,
  formatAssignmentLabel,
  formatQuizLabel,
  sortAssessmentColumns,
  parseQuizScoreCell,
  buildQuizBarData,
  detectQuizOneCategoryContamination,
} from './assessmentColumnOrder';
import { findCommentColumnForAssignment } from './studentAssignmentDisplay';

const USER_HEADERS = [
  'Email',
  'Full Name',
  'Quiz 3 Score',
  'Quiz 1 Score',
  'Quiz 7 Score',
  'Quiz 2 Score',
  'Quiz 5 Score',
  'Quiz 4 Score',
  'Quiz 6 Score',
  'Assignment1_Career_Exploration',
  'Assignment1_Career_Exploration_comments',
  'Assignment2_SWOT',
  'Comments_Assignment_SWOT',
  'Assignment3_Career_Planner',
  'Comments_Assignment_Career_Planner',
  'Assignment4_Career_Vision_Board',
  'Final Score',
];

describe('assessmentColumnOrder', () => {
  it('sorts quiz score columns 1 through 7', () => {
    const quizCols = discoverQuizScoreHeaders(USER_HEADERS);
    expect(quizCols.map(formatQuizLabel)).toEqual([
      'Quiz 1',
      'Quiz 2',
      'Quiz 3',
      'Quiz 4',
      'Quiz 5',
      'Quiz 6',
      'Quiz 7',
    ]);
  });

  it('sorts numbered assignment columns 1 through 4 and excludes comments', () => {
    const assignCols = discoverNumberedAssignmentHeaders(USER_HEADERS);
    expect(assignCols).toEqual([
      'Assignment1_Career_Exploration',
      'Assignment2_SWOT',
      'Assignment3_Career_Planner',
      'Assignment4_Career_Vision_Board',
    ]);
    expect(assignCols.map(formatAssignmentLabel)).toEqual([
      'Assignment 1: Career Exploration',
      'Assignment 2: SWOT',
      'Assignment 3: Career Planner',
      'Assignment 4: Career Vision Board',
    ]);
  });

  it('pairs Comments_Assignment_SWOT with Assignment2_SWOT', () => {
    const comment = findCommentColumnForAssignment('Assignment2_SWOT', USER_HEADERS);
    expect(comment).toBe('Comments_Assignment_SWOT');
  });

  it('pairs Assignment1_Career_Exploration_comments with assignment 1', () => {
    const comment = findCommentColumnForAssignment('Assignment1_Career_Exploration', USER_HEADERS);
    expect(comment).toBe('Assignment1_Career_Exploration_comments');
  });

  it('extracts assessment numbers from mixed header names', () => {
    expect(extractAssessmentNumber('Quiz 4 Score')).toBe(4);
    expect(extractAssessmentNumber('Assignment3_Career_Planner')).toBe(3);
  });

  it('sortAssessmentColumns respects sheet order when numbers tie', () => {
    const cols = ['Quiz B', 'Quiz A'];
    expect(sortAssessmentColumns(cols, cols)).toEqual(['Quiz B', 'Quiz A']);
  });

  it('treats student_category text in Quiz 1 as missing score', () => {
    const parsed = parseQuizScoreCell('Individual', { studentCategory: 'Individual' });
    expect(parsed.score).toBeNull();
    expect(parsed.display).toBe('N/A');
  });

  it('parses numeric quiz scores normally', () => {
    expect(parseQuizScoreCell('100', { studentCategory: 'Individual' }).score).toBe(100);
    expect(parseQuizScoreCell('90', { studentCategory: 'USF' }).score).toBe(90);
  });

  it('infers Quiz 1 from Quiz 2-7 when Quiz 1 contains student_category (Avani case)', () => {
    const row = {
      student_category: 'FFE',
      'Quiz 1 Score': 'FFE',
      'Quiz 2 Score': '100',
      'Quiz 3 Score': '100',
      'Quiz 4 Score': '100',
      'Quiz 5 Score': '100',
      'Quiz 6 Score': '100',
      'Quiz 7 Score': '100',
    };
    const cols = discoverQuizScoreHeaders(Object.keys(row));
    const bars = buildQuizBarData(cols, row, 'FFE');
    expect(bars[0]).toEqual({ name: 'Quiz 1', score: 100, display: '100' });
  });

  it('detects Quiz 1 category contamination in bulk rows', () => {
    const stats = detectQuizOneCategoryContamination([
      { 'Quiz 1 Score': 'Individual', student_category: 'Individual' },
      { 'Quiz 1 Score': '100', student_category: 'Individual' },
    ]);
    expect(stats.contaminatedRows).toBe(1);
    expect(stats.totalRows).toBe(2);
  });
});
