import { describe, expect, it } from 'vitest';
import {
  discoverNumberedAssignmentHeaders,
  discoverQuizScoreHeaders,
  extractAssessmentNumber,
  formatAssignmentLabel,
  formatQuizLabel,
  sortAssessmentColumns,
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
});
