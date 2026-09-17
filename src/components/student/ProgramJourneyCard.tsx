import { useMemo } from 'react';
import type { StudentAssignmentItem } from '../../services/studentAssignmentDisplay';
import type { ClassWiseAttendanceEntry } from '../../services/classWiseAttendance';
import {
  normalizeSessionHours,
  parseDurationFromPreRecordedHeader,
  preRecordedChartLabel,
  preRecordedCompletionPct,
} from '../../services/classWiseAttendance';
import './ProgramJourneyCard.css';

type MilestoneStatus = 'done' | 'active' | 'upcoming';

type Milestone = {
  id: string;
  title: string;
  dateLabel: string;
  status: MilestoneStatus;
  hint?: string;
};

type GapGroup = {
  id: string;
  title: string;
  names: string[];
  tone: 'warn' | 'danger';
};

/** Open Cohort Incubator 12 calendar (2026). */
const PROGRAM_START = new Date(2026, 5, 13); // 13 June
const PROGRAM_END = new Date(2026, 7, 8); // 8 August
const CERTIFICATE_BY = new Date(2026, 8, 10); // 10 September

/** Incubator 14.0 — inaugural 22 Aug; Week 1 starts Monday 24 Aug; 8 weeks. */
const INC14_START = new Date(2026, 7, 22);
const INC14_WEEK1 = new Date(2026, 7, 24);
const INC14_WEEKS = 8;

const LIVE_HOURS_GAP = 0.7;
const PRE_PCT_GAP = 70;
const QUIZ_PCT_GAP = 70;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isIncubator14(cohortName?: string | null): boolean {
  return /incubator\s*14|inc\s*14/i.test(cohortName ?? '');
}

export function incubator14WeekIndex(asOf: Date): number {
  const start = startOfDay(INC14_WEEK1).getTime();
  const day = startOfDay(asOf).getTime();
  if (day < start) return 0;
  const days = Math.floor((day - start) / 86_400_000);
  return Math.min(INC14_WEEKS, Math.floor(days / 7) + 1);
}

export function incubator14WeekRange(week: number): { start: Date; end: Date } | null {
  if (week < 1 || week > INC14_WEEKS) return null;
  const start = new Date(INC14_WEEK1);
  start.setDate(start.getDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function resolveMilestones(now = new Date()): Milestone[] {
  const today = startOfDay(now).getTime();
  const start = startOfDay(PROGRAM_START).getTime();
  const end = startOfDay(PROGRAM_END).getTime();
  const cert = startOfDay(CERTIFICATE_BY).getTime();

  let startStatus: MilestoneStatus = 'upcoming';
  let endStatus: MilestoneStatus = 'upcoming';
  let certStatus: MilestoneStatus = 'upcoming';

  if (today < start) {
    startStatus = 'active';
  } else if (today < end) {
    startStatus = 'done';
    endStatus = 'active';
  } else if (today <= cert) {
    startStatus = 'done';
    endStatus = 'done';
    certStatus = 'active';
  } else {
    startStatus = 'done';
    endStatus = 'done';
    certStatus = 'done';
  }

  return [
    {
      id: 'start',
      title: 'Program started',
      dateLabel: '13th June',
      status: startStatus,
      hint: 'Welcome aboard',
    },
    {
      id: 'end',
      title: 'Program ended',
      dateLabel: '8th August',
      status: endStatus,
      hint: 'Live classes wrapped',
    },
    {
      id: 'cert',
      title: 'Completion certificate',
      dateLabel: 'by 10th Sept',
      status: certStatus,
      hint: 'Close remaining gaps',
    },
  ];
}

/** Keep labels short for mobile chips. */
export function shortenGapLabel(raw: string, max = 28): string {
  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

function liveSessionGapNames(classWise: ClassWiseAttendanceEntry | null | undefined): string[] {
  if (!classWise?.sessions?.length) return [];
  return classWise.sessions
    .filter(s => normalizeSessionHours(s.hours) < LIVE_HOURS_GAP)
    .map(s => shortenGapLabel(s.key));
}

function preRecordedGapNames(classWise: ClassWiseAttendanceEntry | null | undefined): string[] {
  if (!classWise?.preRecorded?.length) return [];
  return classWise.preRecorded
    .filter(s => {
      const durationMin = s.durationMin ?? parseDurationFromPreRecordedHeader(s.key);
      const maxCredit =
        s.maxCreditHours && s.maxCreditHours > 0
          ? s.maxCreditHours
          : durationMin && durationMin > 0
            ? Math.round((durationMin / 60) * 1000) / 1000
            : 0;
      const pct = preRecordedCompletionPct(s.hours, maxCredit);
      return pct < PRE_PCT_GAP;
    })
    .map(s => {
      const durationMin = s.durationMin ?? parseDurationFromPreRecordedHeader(s.key);
      const maxCredit =
        s.maxCreditHours && s.maxCreditHours > 0
          ? s.maxCreditHours
          : durationMin && durationMin > 0
            ? Math.round((durationMin / 60) * 1000) / 1000
            : 0;
      const pct = Math.round(preRecordedCompletionPct(s.hours, maxCredit));
      return `${shortenGapLabel(preRecordedChartLabel(s.key), 22)} · ${pct}%`;
    });
}

function quizGapNames(
  quizBarData: { name: string; score: number | null }[],
): string[] {
  return quizBarData
    .filter(q => q.score == null || q.score < QUIZ_PCT_GAP)
    .map(q => {
      const label = shortenGapLabel(q.name, 18);
      return q.score == null ? `${label} · no score` : `${label} · ${q.score}%`;
    });
}

function assignmentGapNames(rows: StudentAssignmentItem[]): string[] {
  return rows
    .filter(a => a.kind !== 'accepted')
    .map(a => {
      const label = shortenGapLabel(a.name, 22);
      if (a.kind === 'rejected') return `${label} · redo`;
      if (a.kind === 'pending') return `${label} · pending`;
      return label;
    });
}

export function buildGapGroups(input: {
  classWise?: ClassWiseAttendanceEntry | null;
  assignmentRows: StudentAssignmentItem[];
  quizBarData: { name: string; score: number | null; display?: string }[];
}): GapGroup[] {
  const groups: GapGroup[] = [];

  const live = liveSessionGapNames(input.classWise);
  if (live.length) {
    groups.push({
      id: 'live',
      title: 'Live classes (< 0.7 hr)',
      names: live,
      tone: 'warn',
    });
  }

  const videos = preRecordedGapNames(input.classWise);
  if (videos.length) {
    groups.push({
      id: 'video',
      title: 'Pre-recorded (< 70%)',
      names: videos,
      tone: 'warn',
    });
  }

  const quizzes = quizGapNames(input.quizBarData);
  if (quizzes.length) {
    groups.push({
      id: 'quiz',
      title: 'Quizzes (< 70%)',
      names: quizzes,
      tone: 'warn',
    });
  }

  const assignments = assignmentGapNames(input.assignmentRows);
  if (assignments.length) {
    groups.push({
      id: 'asg',
      title: 'Assignments (not accepted)',
      names: assignments,
      tone: 'danger',
    });
  }

  return groups;
}

type Props = {
  classWise?: ClassWiseAttendanceEntry | null;
  assignmentRows: StudentAssignmentItem[];
  quizBarData: { name: string; score: number | null; display: string }[];
  liveSessions: number;
  preRecordedTotalHours: number;
  cohortName?: string | null;
  /** Data-source upload time. Current week follows this, not the phone clock. */
  dataAsOf?: string | null;
};

export default function ProgramJourneyCard({
  classWise,
  assignmentRows,
  quizBarData,
  liveSessions,
  preRecordedTotalHours,
  cohortName,
  dataAsOf,
}: Props) {
  const asOf = useMemo(() => {
    const parsed = dataAsOf ? new Date(dataAsOf) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [dataAsOf]);
  const inc14 = isIncubator14(cohortName);
  const weekIndex = useMemo(() => incubator14WeekIndex(asOf), [asOf]);
  const weekRange = incubator14WeekRange(weekIndex);
  const week8 = incubator14WeekRange(INC14_WEEKS);
  const milestones = useMemo(() => resolveMilestones(asOf), [asOf]);
  const gapGroups = useMemo(
    () => buildGapGroups({ classWise, assignmentRows, quizBarData }),
    [classWise, assignmentRows, quizBarData],
  );

  const sessionsLabel = (() => {
    if (liveSessions <= 0 && preRecordedTotalHours <= 0) return null;
    const preText = Number.isInteger(preRecordedTotalHours)
      ? String(preRecordedTotalHours)
      : preRecordedTotalHours.toFixed(2);
    return `(${liveSessions} live-session + ${preText} Pre-recorded)`;
  })();

  const allClear = gapGroups.length === 0;
  const gapCount = gapGroups.reduce((n, g) => n + g.names.length, 0);

  return (
    <div className="program-journey" aria-label="Program journey and gaps">
      <div className="program-journey__card">
        <div className="program-journey__head">
          <div>
            <p className="program-journey__eyebrow">Your program path</p>
            <h2 className="program-journey__title">Where you are in the journey</h2>
          </div>
          {sessionsLabel && (
            <span className="program-journey__hours-pill" title="Program session hours">
              {sessionsLabel}
            </span>
          )}
        </div>

        {inc14 ? (
          <div className="program-journey__inc14">
            <div className="program-journey__inc14-meta">
              <span>Program started {formatShortDate(INC14_START)}</span>
              <span>Week 8 ends {week8 ? formatShortDate(week8.end) : '18 Oct'}</span>
            </div>
            <div className="program-journey__weeks-head">
              <strong>{weekIndex < 1 ? 'Before Week 1' : `Week ${weekIndex} of ${INC14_WEEKS}`}</strong>
              <span>
                {weekRange ? `${formatShortDate(weekRange.start)} – ${formatShortDate(weekRange.end)}` : 'Week 1 starts 24 Aug'}
                {dataAsOf ? ` · as of data uploaded ${formatShortDate(asOf)}` : ''}
              </span>
            </div>
            <div className="program-journey__weeks-track" aria-label={weekIndex < 1 ? 'Before week 1 of 8' : `Week ${weekIndex} of ${INC14_WEEKS}`}>
              {Array.from({ length: INC14_WEEKS }, (_, i) => {
                const n = i + 1;
                const state = weekIndex >= n ? (weekIndex === n ? 'current' : 'done') : 'upcoming';
                return <span key={n} className={`program-journey__week-seg program-journey__week-seg--${state}`} />;
              })}
              {weekIndex >= 1 && (
                <span
                  className="program-journey__week-live"
                  style={{ left: `${((weekIndex - 0.5) / INC14_WEEKS) * 100}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="program-journey__week-labels">
              {Array.from({ length: INC14_WEEKS }, (_, i) => (
                <span key={i} className={weekIndex === i + 1 ? 'is-current' : ''}>W{i + 1}</span>
              ))}
            </div>
          </div>
        ) : (
        <ol className="program-journey__track" aria-label="Program timeline">
          {milestones.map((m, index) => (
            <li
              key={m.id}
              className={`program-journey__step program-journey__step--${m.status}`}
            >
              {index > 0 && <span className="program-journey__rail" aria-hidden="true" />}
              <div className="program-journey__dot-wrap" aria-hidden="true">
                {m.status === 'active' && (
                  <>
                    <span className="program-journey__ping program-journey__ping--outer" />
                    <span className="program-journey__ping program-journey__ping--mid" />
                  </>
                )}
                <span className="program-journey__dot">
                  {m.status === 'done' ? '✓' : index + 1}
                </span>
              </div>
              <div className="program-journey__step-copy">
                <span className="program-journey__step-title">{m.title}</span>
                <span className="program-journey__step-date">{m.dateLabel}</span>
                {m.hint && m.status === 'active' && (
                  <span className="program-journey__step-hint">{m.hint}</span>
                )}
                {m.status === 'done' && (
                  <span className="program-journey__step-hint program-journey__step-hint--done">Done</span>
                )}
              </div>
            </li>
          ))}
        </ol>
        )}
      </div>

      <div
        className={`program-journey__miss ${allClear ? 'program-journey__miss--clear' : ''}`}
        aria-live="polite"
      >
        <div className="program-journey__miss-head">
          <h3 className="program-journey__miss-title">
            {allClear ? 'All clear' : 'Your open gaps'}
          </h3>
          <p className="program-journey__miss-sub">
            {allClear
              ? 'Nothing below the cut-offs right now.'
              : `${gapCount} item${gapCount === 1 ? '' : 's'} below cut-off — fix these.`}
          </p>
        </div>

        {allClear ? (
          <div className="program-journey__all-clear">
            <span className="program-journey__all-clear-dot" aria-hidden="true" />
            Live, videos, quizzes, and assignments look fine on this sync.
          </div>
        ) : (
          <div className="program-journey__gap-groups">
            {gapGroups.map(group => (
              <section
                key={group.id}
                className={`program-journey__gap-group program-journey__gap-group--${group.tone}`}
              >
                <h4 className="program-journey__gap-title">{group.title}</h4>
                <ul className="program-journey__chips">
                  {group.names.map(name => (
                    <li key={`${group.id}-${name}`} className="program-journey__chip">
                      {name}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
