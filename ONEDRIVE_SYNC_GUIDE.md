# OneDrive Synchronization System

## Overview

This system enables automatic synchronization of student performance data from OneDrive Excel workbooks to the Supabase database. It supports three main data types: Attendance, Assignments, and Quiz results.

## Features

✅ **Multi-sheet Excel parsing** - Supports Attendance, Assignments, and Quiz sheets
✅ **Automatic duplicate detection** - Prevents re-insertion of existing records
✅ **Upsert logic** - Updates existing records and inserts new ones
✅ **Sync logging** - Complete audit trail of all sync operations
✅ **Error handling** - Partial sync success with detailed failure reporting
✅ **Statistics tracking** - Real-time sync metrics and history

## Architecture

```
OneDrive Sync System
│
├── ondriveSync.ts (Core Service)
│   ├── syncAttendanceFromExcel()
│   ├── syncAssignmentsFromExcel()
│   ├── syncQuizFromExcel()
│   ├── getSyncHistory()
│   └── getSyncStats()
│
├── SyncManager.tsx (UI Component)
│   ├── File Upload
│   ├── Sync Controls
│   ├── Statistics Dashboard
│   └── Sync History Table
│
└── Database (Supabase)
    ├── attendance_records
    ├── assignment_submissions
    ├── quiz_results
    └── sync_logs
```

## Excel File Format

### Required Structure

Your Excel workbook should have these three sheets:

#### 1. **Attendance Sheet**
```
| Column A         | Column B    | Column C | Column D  |
|------------------|-------------|----------|-----------|
| student_id       | session_id  | date     | status    |
| S001             | SES001      | 1/15/26  | Present   |
| S002             | SES001      | 1/15/26  | Absent    |
```

#### 2. **Assignments Sheet**
```
| Column A    | Column B       | Column C | Column D         | Column E | Column F  |
|-------------|----------------|----------|------------------|----------|-----------|
| student_id  | assignment_id  | title    | submitted_date   | score    | max_score |
| S001        | A001           | HW-1     | 1/20/26          | 85       | 100       |
| S002        | A001           | HW-1     | 1/25/26          | 92       | 100       |
```

#### 3. **Quiz Sheet**
```
| Column A    | Column B  | Column C | Column D       | Column E | Column F  | Column G            |
|-------------|-----------|----------|-----------------|----------|-----------|---------------------|
| student_id  | quiz_id   | title    | attempt_date   | score    | max_score | time_spent_seconds |
| S001        | Q001      | Quiz-1   | 1/16/26 10:30  | 78       | 100       | 1800                |
| S002        | Q001      | Quiz-1   | 1/17/26 14:15  | 88       | 100       | 2100                |
```

## Installation

1. **Install dependencies:**
```bash
npm install
npm install exceljs
```

2. **The following components are included:**
   - `src/services/ondriveSync.ts` - Core sync logic
   - `src/components/SyncManager.tsx` - UI component
   - `src/styles/SyncManager.css` - Styles

## Usage

### In React Component

```typescript
import SyncManager from './components/SyncManager';

function App() {
  return <SyncManager />;
}
```

### Programmatic Usage

```typescript
import {
  syncAttendanceFromExcel,
  getSyncHistory,
  getSyncStats,
} from './services/ondriveSync';

// Sync a file
const result = await syncAttendanceFromExcel(excelFile);
console.log(result);
// Output:
// {
//   success: true,
//   message: "Synced attendance: 45 inserted, 10 updated, 0 failed",
//   stats: { inserted: 45, updated: 10, failed: 0, duplicates_prevented: 10 }
// }

// Get history
const history = await getSyncHistory();
console.log(history);

// Get stats
const stats = await getSyncStats();
console.log(stats);
```

## Duplicate Prevention

The system prevents duplicates by checking for existing records with the same composite key:

- **Attendance:** `student_id + session_id + date`
- **Assignments:** `student_id + assignment_id`
- **Quiz:** `student_id + quiz_id + attempt_date`

If a duplicate is found, the record is **updated** instead of inserted.

## Sync Log Structure

Every sync operation is logged in the `sync_logs` table:

```sql
{
  id: uuid,
  sync_type: 'Attendance' | 'Assignments' | 'Quiz',
  file_name: string,
  rows_processed: number,
  rows_inserted: number,
  rows_updated: number,
  rows_failed: number,
  error_message?: string,
  sync_status: 'Success' | 'Partial' | 'Failed',
  synced_at: timestamp
}
```

## Statistics Tracked

```typescript
{
  totalSyncs: number,              // Total sync operations
  successfulSyncs: number,         // Fully successful syncs
  totalRowsProcessed: number,      // All rows across all syncs
  totalRowsInserted: number,       // Total new records added
  totalRowsUpdated: number,        // Total records updated
  totalRowsFailed: number          // Total failed records
}
```

## Error Handling

The system handles errors gracefully:

1. **Row-level errors** - One failing row doesn't stop the entire sync
2. **Partial success** - Logs which rows failed and why
3. **Validation errors** - Catches missing/invalid data
4. **Database errors** - Reports connection or constraint violations

Sync statuses:
- `Success` - All rows processed without errors
- `Partial` - Some rows failed, some succeeded
- `Failed` - All rows failed

## Best Practices

1. **Validate data before uploading:**
   - Ensure all required columns are present
   - Use correct date formats (YYYY-MM-DD or spreadsheet date format)
   - Verify student/assignment/quiz IDs exist in the database

2. **Regular syncs:**
   - Schedule weekly or daily syncs
   - Monitor the sync history dashboard
   - Check statistics for anomalies

3. **Backup strategy:**
   - Keep original Excel files as backups
   - Review sync logs before deleting source files
   - Maintain version history in OneDrive

4. **Data quality:**
   - Remove duplicate rows manually
   - Use consistent naming conventions
   - Document any data transformations

## Future Enhancements

- [ ] Automated scheduled syncs from OneDrive
- [ ] Webhook integration for real-time sync triggers
- [ ] Advanced conflict resolution strategies
- [ ] Data reconciliation reports
- [ ] Bulk data validation before sync
- [ ] Email notifications on sync completion
- [ ] Rollback functionality for failed syncs
- [ ] Data transformation/mapping UI

## Troubleshooting

### Issue: "Attendance sheet not found"
**Solution:** Ensure your Excel file has a sheet named exactly "Attendance"

### Issue: Rows not syncing
**Solution:** Check that all required columns (A-D) are populated and in correct order

### Issue: High failure rate
**Solution:** Verify that referenced student/assignment/quiz IDs exist in the database

### Issue: Duplicates not being updated
**Solution:** Ensure the composite key values match exactly (case-sensitive)

## Support

For issues or questions:
1. Check the sync history table for detailed error messages
2. Review the statistics dashboard
3. Examine the sync logs in Supabase
4. Check browser console for JavaScript errors
