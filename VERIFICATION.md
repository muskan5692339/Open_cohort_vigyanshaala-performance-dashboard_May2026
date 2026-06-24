# Excel → Dashboard verification checklist

Use after implementing the import pipeline. Run the app with `npm run dev:api`.

## 1. Environment

- [ ] `.env.local` has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `npm run dev:api` is running (not `npm run dev` alone)

## 2. Upload

- [ ] Data Sources → Excel Upload → set cohort (e.g. `Incubator 11.0`)
- [ ] Upload `.xlsx` → preview shows student/attendance/assignment/quiz row counts
- [ ] Import returns success or partial with non-zero inserted/updated
- [ ] Result shows cohort name badge

## 3. Supabase tables

- [ ] `students` count ≈ Excel roster rows
- [ ] `attendance_records` has rows for imported students
- [ ] `assignment_submissions` has rows (including Pending for empty assignment cells)
- [ ] `quiz_results` has numeric scores (not only 0/60)
- [ ] `engagement_metrics` has latest row per student (wide-format)
- [ ] `sync_logs` latest entry `status = success`

## 4. Dashboard

- [ ] After import, app navigates to **Dashboard** (or open manually)
- [ ] Cohort filter auto-set to imported cohort
- [ ] Banner shows last import time and student count
- [ ] KPI cards: attendance, assignment, quiz averages > 0 for active cohort
- [ ] Student table lists imported students with plausible %
- [ ] Changing cohort filter updates KPIs and charts

## 5. Re-import

- [ ] Re-upload same file updates rows (upsert), dashboard refreshes without hard refresh

## Optional: SQL matview refresh

If `student_performance_summary` is stale, run migration `005_refresh_matview_fn.sql` in Supabase, or:

```sql
REFRESH MATERIALIZED VIEW public.student_performance_summary;
```
