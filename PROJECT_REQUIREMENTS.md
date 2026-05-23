# Student Dashboard Requirements

## Dashboard Header

Display:

- VigyanShaala Logo
- Student Name
- College Name
- Program Name
- Cohort Name
- Last Updated Timestamp

Example:

Muskan Gupta
Government Engineering College Pune
Open Cohort 2026

---

## Student Profile Card

Display:

- Student Name
- College Name
- Cohort
- State
- Enrollment Date
- Current Status

Status Values:

- Active
- Inactive
- At Risk

---

## Attendance Summary

Display:

- Overall Attendance Percentage
- Total Hours Conducted
- Total Hours Attended
- Missed Hours

Formula:

Attendance % =
(Total Hours Attended ÷ Total Hours Conducted) × 100

---

## Attendance Pie Chart

Display:

- Attended Hours
- Missed Hours
- Attendance Percentage

Requirements:

- Responsive
- Interactive tooltip
- Animated transitions

---

## Session-wise Attendance Trend

Chart Type:

Line Chart

X-Axis:

- Session Date

Y-Axis:

- Hours Attended

Filters:

- This Week
- Last Week
- Last 30 Days
- Entire Program

Features:

- Hover tooltips
- Responsive layout
- Smooth trend visualization

---

## Assignment Progress

Display:

- Assignment Name
- Submission Status
- Submission Date

Status Values:

- Submitted
- Pending
- Late Submission

Summary Metrics:

- Total Assignments
- Submitted Assignments
- Pending Assignments
- Assignment Completion %

Progress Bar:

Assignment Completion %

---

## Quiz Performance

Display:

- Quiz Name
- Score
- Percentage

Summary Metrics:

- Average Quiz Score
- Highest Quiz Score
- Latest Quiz Score

Visualization:

- Bar Chart showing quiz trend

---

## Performance Snapshot

Display:

- Attendance %
- Assignment Completion %
- Quiz Average %
- Engagement Score

Performance Categories:

- Excellent
- Good
- Needs Improvement
- At Risk

---

## Personalized Recommendations

Automatically generate recommendations such as:

- Attendance is below cohort average.
- Complete pending assignments.
- Attempt upcoming quizzes.
- Excellent performance. Keep it up.
- Improve attendance to achieve engagement goals.

---

# Admin Dashboard Requirements

## Global Filters

Available Across All Reports:

- Cohort
- College
- State
- Program
- Attendance Range
- Assignment Completion Range
- Quiz Score Range
- Engagement Score Range
- Date Range
- Week
- Month

Multiple filters must work simultaneously.

---

## Cohort Overview Dashboard

Display:

- Total Students
- Active Students
- At-Risk Students
- Average Attendance %
- Average Assignment Completion %
- Average Quiz Score %
- Average Engagement Score

Trend comparison:

- Current Week vs Previous Week
- Current Month vs Previous Month

---

## Student Search

Search By:

- Student Name
- Email
- College
- Cohort

Instant search results.

---

## Student Performance Table

Columns:

- Student Name
- College
- Cohort
- Attendance %
- Assignment Completion %
- Quiz Average %
- Engagement Score
- Risk Category

Features:

- Sorting
- Filtering
- Pagination
- Export CSV
- Export Excel

---

## Attendance Analytics

Display:

- Attendance Distribution
- Attendance by College
- Attendance by Cohort
- Weekly Attendance Trends

Visualizations:

- Line Chart
- Bar Chart
- Heatmap

---

## Assignment Analytics

Display:

- Assignment Completion Rate
- Pending Assignments
- Submission Trends
- Assignment Completion by College
- Assignment Completion by Cohort

---

## Quiz Analytics

Display:

- Average Quiz Scores
- Quiz Participation Rate
- Highest Performers
- Lowest Performers
- Quiz Performance Trends

Visualizations:

- Bar Chart
- Trend Line

---

# At-Risk Student Intelligence Module

Automatically identify and categorize students.

## Category 1: Attendance Risk

Conditions:

- Attendance below 70%

Flag:

Low Attendance

Suggested Action:

Call Student

---

## Category 2: Assignment Risk

Conditions:

- Assignment Completion below 50%

Flag:

Assignment Backlog

Suggested Action:

Send Assignment Reminder

---

## Category 3: Quiz Risk

Conditions:

- Average Quiz Score below 50%

Flag:

Low Assessment Performance

Suggested Action:

Academic Support

---

## Category 4: Silent Learners

Conditions:

- Attendance above 80%
- Assignment Completion below 40%

Meaning:

Student attends classes but rarely submits assignments.

Flag:

Attending but Not Submitting

Suggested Action:

Targeted Assignment Follow-up

---

## Category 5: Assessment-Only Students

Conditions:

- Quiz Participation above 70%
- Attendance below 60%

Meaning:

Student attempts quizzes but skips live sessions.

Flag:

Assessment Active / Attendance Low

Suggested Action:

Attendance Follow-up

---

## Category 6: Submission-Only Students

Conditions:

- Assignment Completion above 80%
- Attendance below 60%

Meaning:

Student submits assignments but does not regularly attend sessions.

Flag:

Submission Active / Attendance Low

Suggested Action:

Engagement Call

---

## Category 7: Disengaged Students

Conditions:

- Attendance below 60%
- Assignment Completion below 40%
- Quiz Participation below 40%

Flag:

High Risk

Priority:

Critical

Suggested Action:

Immediate Intervention

---

## Category 8: High Potential Students

Conditions:

- Attendance above 90%
- Assignment Completion above 90%
- Quiz Average above 80%

Flag:

Top Performer

Suggested Action:

Recognition and Leadership Opportunities

---

## Intervention Dashboard

Display:

- Student Name
- College
- Cohort
- Risk Category
- Risk Score
- Suggested Action

Example:

Muskan Gupta
Government Engineering College Pune
Open Cohort 2026
Assignment Risk
Medium
Send Reminder

---

## Engagement Score Calculation

Weightage:

- Attendance = 40%
- Assignment Completion = 30%
- Quiz Performance = 30%

Formula:

Engagement Score =
(Attendance × 0.4)
+
(Assignment Completion × 0.3)
+
(Quiz Average × 0.3)

Categories:

90–100 = Excellent

75–89 = Good

60–74 = Needs Attention

Below 60 = At Risk

---

## Data Synchronization Monitoring

Display:

- Last Sync Date
- Records Imported
- Sync Success Status
- Sync Errors

Actions:

- Sync Now
- Refresh Dashboard
- Download Sync Logs

---

# Updated Student Master Data Structure

Required Fields:

- Student Name
- Student Email
- College Name
- State
- Program
- Cohort
- Enrollment Date
- Current Status

These fields will support filtering, reporting, cohort analytics and intervention tracking throughout the platform.