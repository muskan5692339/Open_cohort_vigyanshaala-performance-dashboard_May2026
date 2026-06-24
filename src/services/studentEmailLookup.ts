import type { ParsedExcelPayload } from './loadMetricsFromParsedExcel';
import type { ParsedStudent } from '../types/syncTypes';
import type { ColumnMapping } from '../types/dynamicSchema';

export function normalizeStudentEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidStudentEmail(email: string): boolean {
  const normalized = normalizeStudentEmail(email);
  return normalized.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.result === 'string' || typeof obj.result === 'number') return String(obj.result).trim();
  }
  return String(v).trim();
}

function columnNamesFromPayload(payload: ParsedExcelPayload): string[] {
  const mapping = payload.mapping ?? {};
  const fromRowKeys = payload.rawRows?.length ? Object.keys(payload.rawRows[0]) : [];
  return [...new Set([...Object.keys(mapping), ...(payload.headers ?? []), ...fromRowKeys])];
}

/** Prefer a header literally named "email" (any casing), then other email-like columns. */
export function resolveEmailColumnKey(payload: ParsedExcelPayload): string | null {
  const names = columnNamesFromPayload(payload);

  const exact = names.find(n => n.toLowerCase().trim() === 'email');
  if (exact) return exact;

  const mapping = payload.mapping ?? {};
  const fromMapping = names.filter(
    n => mapping[n]?.mappedType === 'identifier' || n.toLowerCase().includes('email'),
  );
  if (fromMapping.length) return fromMapping[0];

  const partial = names.find(n => n.toLowerCase().includes('email'));
  return partial ?? null;
}

function emailColumnsFromPayload(payload: ParsedExcelPayload): string[] {
  const primary = resolveEmailColumnKey(payload);
  const mapping = payload.mapping ?? {};
  const rest = columnNamesFromPayload(payload).filter(
    n =>
      n !== primary &&
      (mapping[n]?.mappedType === 'identifier' || n.toLowerCase().includes('email')),
  );
  return primary ? [primary, ...rest] : rest;
}

function rowValueByKeywords(row: Record<string, unknown>, keywords: string[]): string {
  for (const [key, value] of Object.entries(row)) {
    const lk = key.toLowerCase();
    if (keywords.some(k => lk.includes(k))) {
      const text = cellText(value);
      if (text) return text;
    }
  }
  return '';
}

/** All valid emails from the loaded dataset (parsed students + rawRows email column). */
export function getAllStudentEmails(payload: ParsedExcelPayload | null | undefined): string[] {
  if (!payload) return [];

  const byNormalized = new Map<string, string>();

  for (const student of payload.students ?? []) {
    const email = cellText(student.email);
    if (isValidStudentEmail(email)) {
      byNormalized.set(normalizeStudentEmail(email), email);
    }
  }

  const col = resolveEmailColumnKey(payload);
  const rows = payload.rawRows ?? [];
  if (col && rows.length) {
    for (const row of rows) {
      const email = cellText(row[col]);
      if (isValidStudentEmail(email)) {
        const key = normalizeStudentEmail(email);
        if (!byNormalized.has(key)) byNormalized.set(key, email);
      }
    }
  }

  if (byNormalized.size === 0 && rows.length) {
    for (const row of rows) {
      for (const val of Object.values(row)) {
        const email = cellText(val);
        if (isValidStudentEmail(email)) {
          const key = normalizeStudentEmail(email);
          if (!byNormalized.has(key)) byNormalized.set(key, email);
        }
      }
    }
  }

  return [...byNormalized.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

export function getStudentLookupCount(payload: ParsedExcelPayload | null | undefined): number {
  return getAllStudentEmails(payload).length;
}

export function searchStudentEmails(
  payload: ParsedExcelPayload | null | undefined,
  query: string,
  limit = 5,
): string[] {
  const q = normalizeStudentEmail(query);
  if (!q) return [];
  return getAllStudentEmails(payload)
    .filter(email => normalizeStudentEmail(email).includes(q))
    .slice(0, limit);
}

export function getExampleStudentEmails(
  payload: ParsedExcelPayload | null | undefined,
  limit = 5,
): string[] {
  return getAllStudentEmails(payload).slice(0, limit);
}

function buildStudentFromRow(
  row: Record<string, unknown>,
  payload: ParsedExcelPayload,
  email: string,
): ParsedStudent {
  const emailCol = resolveEmailColumnKey(payload);
  const resolvedEmail = emailCol ? cellText(row[emailCol]) : email;

  return {
    student_id: rowValueByKeywords(row, ['student id', 'student_id', 'vs id']) || resolvedEmail,
    name: rowValueByKeywords(row, ['name', 'student name', 'full name']) || 'Unknown',
    email: resolvedEmail,
    college: rowValueByKeywords(row, ['college', 'university', 'institution']),
    program: rowValueByKeywords(row, ['program', 'degree', 'subject']),
    cohort: rowValueByKeywords(row, ['cohort', 'batch']) || payload.cohortName,
    state: rowValueByKeywords(row, ['state']),
    status: 'Active',
  };
}

export function findStudentRawRow(
  payload: ParsedExcelPayload,
  email: string,
): Record<string, unknown> | null {
  const key = normalizeStudentEmail(email);
  if (!key) return null;

  const rows = payload.rawRows ?? [];
  if (!rows.length) return null;

  const emailCols = emailColumnsFromPayload(payload);
  for (const row of rows) {
    for (const col of emailCols) {
      if (normalizeStudentEmail(cellText(row[col])) === key) return row;
    }
  }

  for (const row of rows) {
    for (const val of Object.values(row)) {
      if (normalizeStudentEmail(cellText(val)) === key) return row;
    }
  }

  const student = payload.students?.find(s => normalizeStudentEmail(s.email) === key);
  if (!student) return null;

  for (const row of rows) {
    for (const val of Object.values(row)) {
      const text = cellText(val);
      if (text && (text === student.student_id || text === student.name)) return row;
    }
  }

  return null;
}

export function findParsedStudent(
  payload: ParsedExcelPayload,
  email: string,
): ParsedStudent | undefined {
  const key = normalizeStudentEmail(email);
  if (!key) return undefined;

  const fromStudents = payload.students?.find(s => normalizeStudentEmail(s.email) === key);
  if (fromStudents) return fromStudents;

  const row = findStudentRawRow(payload, email);
  if (row) return buildStudentFromRow(row, payload, email);

  const knownEmail = getAllStudentEmails(payload).find(e => normalizeStudentEmail(e) === key);
  if (knownEmail) {
    return {
      student_id: knownEmail,
      name: 'Unknown',
      email: knownEmail,
      college: '',
      program: '',
      cohort: payload.cohortName,
      state: '',
      status: 'Active',
    };
  }

  return undefined;
}

export interface StudentLookupResult {
  student: ParsedStudent;
  rawRow: Record<string, unknown> | null;
  studentCount: number;
  emailColumn: string | null;
}

export function lookupStudentByEmail(
  payload: ParsedExcelPayload | null | undefined,
  email: string,
): StudentLookupResult | null {
  if (!payload) return null;

  const studentCount = getStudentLookupCount(payload);
  const emailColumn = resolveEmailColumnKey(payload);
  if (import.meta.env.DEV) {
    console.debug('[StudentLookup] records available:', studentCount, emailColumn ? `(email column: "${emailColumn}")` : '');
  }

  const student = findParsedStudent(payload, email);
  if (!student) return null;

  return {
    student,
    rawRow: findStudentRawRow(payload, email),
    studentCount,
    emailColumn,
  };
}

export function hasStudentEmail(
  payload: ParsedExcelPayload | null | undefined,
  email: string,
): boolean {
  if (!payload) return false;
  const key = normalizeStudentEmail(email);
  if (!key) return false;
  return getAllStudentEmails(payload).some(e => normalizeStudentEmail(e) === key);
}

export function getIdentifierColumns(mapping: ColumnMapping): string[] {
  return Object.entries(mapping)
    .filter(([col, entry]) => entry.mappedType === 'identifier' || col.toLowerCase().includes('email'))
    .map(([col]) => col)
    .sort((a, b) => a.localeCompare(b));
}
