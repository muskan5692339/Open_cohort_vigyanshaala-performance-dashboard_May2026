import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabase';

export interface SyncLog {
  id?: string;
  sync_type: 'Attendance' | 'Assignments' | 'Quiz';
  file_name: string;
  rows_processed: number;
  rows_inserted: number;
  rows_updated: number;
  rows_failed: number;
  error_message?: string;
  sync_status: 'Success' | 'Partial' | 'Failed';
  synced_at?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  stats: {
    inserted: number;
    updated: number;
    failed: number;
    duplicates_prevented: number;
  };
}

/**
 * Parse attendance data from Excel and sync to Supabase
 */
export async function syncAttendanceFromExcel(
  file: File
): Promise<SyncResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  
  const worksheet = workbook.getWorksheet('Attendance');
  if (!worksheet) {
    throw new Error('Attendance sheet not found in workbook');
  }

  const records: any[] = [];
  let inserted = 0,
    updated = 0,
    failed = 0;

  // Parse rows (skip header)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    try {
      const studentId = row.getCell(1).value as string;
      const sessionId = row.getCell(2).value as string;
      const date = row.getCell(3).value;
      const status = row.getCell(4).value as string; // 'Present' | 'Absent'

      if (!studentId || !sessionId || !date) {
        failed++;
        return;
      }

      records.push({
        student_id: studentId,
        session_id: sessionId,
        date: new Date(date as string | number | Date).toISOString().split('T')[0],
        status,
        source: 'OneDrive',
        synced_at: new Date().toISOString(),
      });
    } catch (error) {
      failed++;
    }
  });

  // Upsert to Supabase with duplicate prevention
  for (const record of records) {
    try {
      // Check for existing record
      const { data: existing } = await supabase
        .from('attendance_records')
        .select('id')
        .eq('student_id', record.student_id)
        .eq('session_id', record.session_id)
        .eq('date', record.date)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('attendance_records')
          .update({
            status: record.status,
            synced_at: record.synced_at,
          })
          .eq('id', existing.id);

        if (error) failed++;
        else updated++;
      } else {
        // Insert new
        const { error } = await supabase
          .from('attendance_records')
          .insert([record]);

        if (error) failed++;
        else inserted++;
      }
    } catch (error) {
      failed++;
    }
  }

  // Log sync
  await logSync('Attendance', file.name, records.length, inserted, updated, failed);

  return {
    success: failed === 0,
    message: `Synced attendance: ${inserted} inserted, ${updated} updated, ${failed} failed`,
    stats: { inserted, updated, failed, duplicates_prevented: updated },
  };
}

/**
 * Parse assignments data from Excel and sync to Supabase
 */
export async function syncAssignmentsFromExcel(
  file: File
): Promise<SyncResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const worksheet = workbook.getWorksheet('Assignments');
  if (!worksheet) {
    throw new Error('Assignments sheet not found in workbook');
  }

  const records: any[] = [];
  let inserted = 0,
    updated = 0,
    failed = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    try {
      const studentId = row.getCell(1).value as string;
      const assignmentId = row.getCell(2).value as string;
      const title = row.getCell(3).value as string;
      const submittedDate = row.getCell(4).value;
      const score = row.getCell(5).value as number;
      const maxScore = row.getCell(6).value as number;

      if (!studentId || !assignmentId || !title) {
        failed++;
        return;
      }

      records.push({
        student_id: studentId,
        assignment_id: assignmentId,
        title,
        submitted_date: submittedDate ? new Date(submittedDate as string | number | Date).toISOString().split('T')[0] : null,
        score: score || 0,
        max_score: maxScore || 100,
        percentage: ((score || 0) / (maxScore || 100)) * 100,
        source: 'OneDrive',
        synced_at: new Date().toISOString(),
      });
    } catch (error) {
      failed++;
    }
  });

  // Upsert to Supabase
  for (const record of records) {
    try {
      const { data: existing } = await supabase
        .from('assignment_submissions')
        .select('id')
        .eq('student_id', record.student_id)
        .eq('assignment_id', record.assignment_id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('assignment_submissions')
          .update({
            score: record.score,
            percentage: record.percentage,
            submitted_date: record.submitted_date,
            synced_at: record.synced_at,
          })
          .eq('id', existing.id);

        if (error) failed++;
        else updated++;
      } else {
        const { error } = await supabase
          .from('assignment_submissions')
          .insert([record]);

        if (error) failed++;
        else inserted++;
      }
    } catch (error) {
      failed++;
    }
  }

  await logSync('Assignments', file.name, records.length, inserted, updated, failed);

  return {
    success: failed === 0,
    message: `Synced assignments: ${inserted} inserted, ${updated} updated, ${failed} failed`,
    stats: { inserted, updated, failed, duplicates_prevented: updated },
  };
}

/**
 * Parse quiz data from Excel and sync to Supabase
 */
export async function syncQuizFromExcel(file: File): Promise<SyncResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const worksheet = workbook.getWorksheet('Quiz');
  if (!worksheet) {
    throw new Error('Quiz sheet not found in workbook');
  }

  const records: any[] = [];
  let inserted = 0,
    updated = 0,
    failed = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    try {
      const studentId = row.getCell(1).value as string;
      const quizId = row.getCell(2).value as string;
      const title = row.getCell(3).value as string;
      const attemptDate = row.getCell(4).value;
      const score = row.getCell(5).value as number;
      const maxScore = row.getCell(6).value as number;
      const timeSpentSeconds = row.getCell(7).value as number;

      if (!studentId || !quizId || !title) {
        failed++;
        return;
      }

      records.push({
        student_id: studentId,
        quiz_id: quizId,
        title,
        attempt_date: attemptDate ? new Date(attemptDate as string | number | Date).toISOString() : new Date().toISOString(),
        score: score || 0,
        max_score: maxScore || 100,
        percentage: ((score || 0) / (maxScore || 100)) * 100,
        time_spent_seconds: timeSpentSeconds || 0,
        source: 'OneDrive',
        synced_at: new Date().toISOString(),
      });
    } catch (error) {
      failed++;
    }
  });

  // Upsert to Supabase
  for (const record of records) {
    try {
      const { data: existing } = await supabase
        .from('quiz_results')
        .select('id')
        .eq('student_id', record.student_id)
        .eq('quiz_id', record.quiz_id)
        .eq('attempt_date', record.attempt_date)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('quiz_results')
          .update({
            score: record.score,
            percentage: record.percentage,
            time_spent_seconds: record.time_spent_seconds,
            synced_at: record.synced_at,
          })
          .eq('id', existing.id);

        if (error) failed++;
        else updated++;
      } else {
        const { error } = await supabase
          .from('quiz_results')
          .insert([record]);

        if (error) failed++;
        else inserted++;
      }
    } catch (error) {
      failed++;
    }
  }

  await logSync('Quiz', file.name, records.length, inserted, updated, failed);

  return {
    success: failed === 0,
    message: `Synced quiz results: ${inserted} inserted, ${updated} updated, ${failed} failed`,
    stats: { inserted, updated, failed, duplicates_prevented: updated },
  };
}

/**
 * Log sync operation to sync_logs table
 */
async function logSync(
  syncType: 'Attendance' | 'Assignments' | 'Quiz',
  fileName: string,
  rowsProcessed: number,
  inserted: number,
  updated: number,
  failed: number
) {
  const syncStatus = failed === 0 ? 'Success' : failed < rowsProcessed ? 'Partial' : 'Failed';

  try {
    await supabase.from('sync_logs').insert([
      {
        sync_type: syncType,
        file_name: fileName,
        rows_processed: rowsProcessed,
        rows_inserted: inserted,
        rows_updated: updated,
        rows_failed: failed,
        sync_status: syncStatus,
        synced_at: new Date().toISOString(),
      },
    ]);
  } catch (error) {
    console.error('Failed to log sync:', error);
  }
}

/**
 * Get sync history
 */
export async function getSyncHistory(limit: number = 50) {
  const { data, error } = await supabase
    .from('sync_logs')
    .select('*')
    .order('synced_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

/**
 * Get sync statistics
 */
export async function getSyncStats() {
  const { data, error } = await supabase
    .from('sync_logs')
    .select(
      'sync_type, rows_processed, rows_inserted, rows_updated, rows_failed, sync_status'
    );

  if (error) throw error;

  const stats = {
    totalSyncs: data?.length || 0,
    successfulSyncs: data?.filter((d: any) => d.sync_status === 'Success').length || 0,
    totalRowsProcessed: data?.reduce((sum: number, d: any) => sum + (d.rows_processed || 0), 0) || 0,
    totalRowsInserted: data?.reduce((sum: number, d: any) => sum + (d.rows_inserted || 0), 0) || 0,
    totalRowsUpdated: data?.reduce((sum: number, d: any) => sum + (d.rows_updated || 0), 0) || 0,
    totalRowsFailed: data?.reduce((sum: number, d: any) => sum + (d.rows_failed || 0), 0) || 0,
  };

  return stats;
}
