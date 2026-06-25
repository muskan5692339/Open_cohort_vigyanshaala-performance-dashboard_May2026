import { useState, useRef, useCallback, useMemo } from 'react';
import type { DragEvent } from 'react';
import { parseUploadedFile } from '../../services/excelParser';
import { parseWorkbookSheet } from '../../services/selectedSheetParser';
import { loadClassWiseAttendanceFromFile } from '../../services/classWiseAttendance';
import { validateUploadFile } from '../../services/uploadValidation';
import { previewWorkbook } from '../../services/workbookPreview';
import { loadSyncConfig } from '../../services/oneDriveSync';
import { useUploadedExcel } from '../../context/UploadedExcelContext';
import { generateDynamicAnalytics } from '../../services/dynamicAnalytics';
import type { ParsedStudent, ParsedAttendance, ParsedAssignment, ParsedQuiz, SyncError } from '../../types/syncTypes';
import type { ColumnMapping, DiscoveredColumn, SchemaProfile } from '../../types/dynamicSchema';
import type { SchemaMigrationSummary, UploadValidationResult, WorkbookPreview } from '../../types/productionTypes';
import ColumnMappingTable from './ColumnMappingTable';
import UploadValidationCenter from './UploadValidationCenter';
import FilePreviewPanel from './FilePreviewPanel';
import SchemaMigrationPanel from './SchemaMigrationPanel';
import { saveSchemaProfile } from '../../services/schemaProfileStore';
import {
  applyProfileWithFuzzyMatch,
  resolveProfileForUpload,
} from '../../services/fuzzyHeaderMatching';
import { detectSchemaChanges, latestProfileByHeaders } from '../../services/schemaChangeDetector';
import { appendAuditLog } from '../../services/auditLogStore';
import { recordMappingAttempt, recordUploadAttempt } from '../../services/dashboardHealthMonitor';
import { recordTelemetry } from '../../services/telemetryService';
import { buildDemoPayload } from '../../services/demoDataset';
import type { ClassWiseAttendanceEntry } from '../../services/classWiseAttendance';
import { useAuth } from '../../context/AuthContext';
import { useSyncContext } from '../../hooks/useSyncContext';
import { persistSchemaProfileToCloud, persistUploadToCloud } from '../../services/cloud/uploadPersistence';
import { getActiveOrganizationId, isCloudPersistenceEnabled } from '../../services/cloud/cloudConfig';

/* ── Types ─────────────────────────────────────────────── */

interface ParsedAll {
  students:    { data: ParsedStudent[];    errors: SyncError[] };
  attendance:  { data: ParsedAttendance[]; errors: SyncError[] };
  assignments: { data: ParsedAssignment[]; errors: SyncError[] };
  quiz:        { data: ParsedQuiz[];       errors: SyncError[] };
  _sheetsFound:  string[];
  _sheetMapping: Record<string, string>;
  columnMapping: Record<string, string>;
  headers?: string[];
  rawRows?: Record<string, string>[];
  discoveredColumns?: DiscoveredColumn[];
  fileSignature?: string;
  classWiseAttendance?: ClassWiseAttendanceEntry[];
  classWiseAttendanceColumns?: string[];
}

type TabKey = 'students' | 'attendance' | 'assignments' | 'quiz';

interface Props {
  onDataImported?: (info: { cohortName: string }) => void;
}

/* ── Helpers ────────────────────────────────────────────── */

const BRAND = {
  navy: '#1e2d45', purple: '#863bff', green: '#15803d', greenBg: '#f0fdf4', greenBorder: '#86efac',
  red: '#dc2626', redBg: '#fef2f2', redBorder: '#fca5a5',
  yellow: '#92400e', yellowBg: '#fffbeb', yellowBorder: '#fde68a',
  text: '#111827', textLight: '#6b7280', border: '#e5e7eb', bg: '#f9fafb', card: '#fff',
};

const S: Record<string, React.CSSProperties> = {
  card: { background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: '24px 28px', marginBottom: 18 },
  h3:   { fontSize: 16, fontWeight: 700, color: BRAND.navy, margin: '0 0 4px' },
  sub:  { fontSize: 13, color: BRAND.textLight, margin: '0 0 16px' },
  btn:  { padding: '10px 22px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
};

/* ── Preview table ──────────────────────────────────────── */

function PreviewTable({ rows, cols }: { rows: Record<string, unknown>[]; cols: string[] }) {
  if (!rows.length) return <p style={{ fontSize: 13, color: BRAND.textLight }}>No rows parsed.</p>;
  return (
    <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead style={{ background: BRAND.bg, position: 'sticky', top: 0 }}>
          <tr>
            {cols.map(c => (
              <th key={c} style={{ padding: '7px 10px', textAlign: 'left', color: BRAND.textLight, fontWeight: 700, textTransform: 'uppercase', fontSize: 10, borderBottom: `1px solid ${BRAND.border}` }}>
                {c.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
              {cols.map(c => (
                <td key={c} style={{ padding: '6px 10px', color: BRAND.text, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(row[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 8 && <p style={{ fontSize: 11, color: BRAND.textLight, margin: '6px 10px 0' }}>… and {rows.length - 8} more rows</p>}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */

export default function ExcelUpload({ onDataImported }: Props) {
  const { loadFromParsed } = useUploadedExcel();
  const { session, user, organization, cloudEnabled } = useAuth();
  const syncCtx = useSyncContext();
  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [parsed, setParsed] = useState<ParsedAll | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('students');
  const [visualized, setVisualized] = useState(false);
  const [mappingApplied, setMappingApplied] = useState(false);
  const [schemaColumns, setSchemaColumns] = useState<DiscoveredColumn[]>([]);
  const [matchedProfile, setMatchedProfile] = useState<SchemaProfile | null>(null);
  const [fuzzyMatchCount, setFuzzyMatchCount] = useState(0);
  const [schemaMigration, setSchemaMigration] = useState<SchemaMigrationSummary | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<UploadValidationResult | null>(null);
  const [workbookPreview, setWorkbookPreview] = useState<WorkbookPreview | null>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [cohortName, setCohortName] = useState('Incubator 11.0');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [cloudPublishStatus, setCloudPublishStatus] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg = loadSyncConfig();
  const sheetNames = cfg?.sheetNames ?? { students: 'Student Master', attendance: 'Attendance', assignments: 'Assignments', quiz: 'Quiz' };

  const cloudToken = session?.access_token;
  const cloudUserId = user?.id;
  const canUpload = true;

  const syncToCloud = useCallback(
    async (input: {
      fileName: string;
      cohortName: string;
      source: 'excel' | 'onedrive' | 'demo';
      schemaSignature?: string;
      sheetName?: string;
      rowCount: number;
      changedColumns?: unknown[];
      headers?: string[];
      rawRows?: Record<string, string>[];
      mapping?: ColumnMapping;
      discoveredColumns?: DiscoveredColumn[];
    }) => {
      if (!canUpload) return { ok: false as const, error: 'Upload disabled' };
      return persistUploadToCloud(
        {
          organizationId: organization?.id ?? getActiveOrganizationId(),
          userId: cloudUserId,
          fileName: input.fileName,
          cohortName: input.cohortName,
          source: input.source,
          schemaSignature: input.schemaSignature,
          sheetName: input.sheetName,
          rowCount: input.rowCount,
          changedColumns: input.changedColumns,
          headers: input.headers,
          rawRows: input.rawRows,
          mapping: input.mapping,
          discoveredColumns: input.discoveredColumns,
        },
        cloudToken,
      );
    },
    [canUpload, organization?.id, cloudUserId, cloudToken],
  );

  const resetUploadFlow = useCallback(() => {
    setParsed(null);
    setVisualized(false);
    setError(null);
    setFileName('');
    setMappingApplied(false);
    setSchemaColumns([]);
    setMatchedProfile(null);
    setFuzzyMatchCount(0);
    setSchemaMigration(null);
    setPendingFile(null);
    setValidationResult(null);
    setWorkbookPreview(null);
    setSelectedSheet('');
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!cohortName.trim()) {
      setError('Please enter a cohort name before uploading.');
      return;
    }
    resetUploadFlow();
    setFileName(file.name);
    setPendingFile(file);
    setValidating(true);
    setError(null);

    try {
      const validation = await validateUploadFile(file);
      setValidationResult(validation);

      if (!validation.valid) {
        appendAuditLog('validation', `Upload blocked: ${file.name}`, {
          errors: validation.issues.filter(i => i.severity === 'error').length,
        }, syncCtx);
        recordUploadAttempt(false);
        return;
      }

      const preview = await previewWorkbook(file);
      setWorkbookPreview(preview);
      setSelectedSheet(preview.recommendedSheet ?? preview.sheetNames[0] ?? '');
    } catch (e) {
      setError(`Validation error: ${(e as Error).message}`);
      recordUploadAttempt(false);
    } finally {
      setValidating(false);
    }
  }, [cohortName, resetUploadFlow, syncCtx]);

  const handleConfirmImport = useCallback(async () => {
    if (!pendingFile || !selectedSheet || !cohortName.trim()) return;
    setConfirming(true);
    setParsing(true);
    setError(null);
    const t0 = performance.now();

    try {
      let p = await parseWorkbookSheet(pendingFile, selectedSheet, cohortName.trim());

      if (!p.rawRows.length || p.students.errors.some(e => e.message.includes('not found'))) {
        p = await parseUploadedFile(pendingFile, sheetNames, cohortName.trim());
      }

      const classWise = await loadClassWiseAttendanceFromFile(pendingFile);
      p = {
        ...p,
        classWiseAttendance: classWise?.entries ?? p.classWiseAttendance ?? [],
        classWiseAttendanceColumns: classWise?.sessionColumns ?? p.classWiseAttendanceColumns ?? [],
      };

      setParsed(p);
      const discovered = p.discoveredColumns ?? [];
      const headers = p.headers ?? [];
      const resolved = resolveProfileForUpload(p.fileSignature, headers);
      const previousForMigration = resolved.profile ?? latestProfileByHeaders(headers);
      const { columns: mappedCols, fuzzyMatches } = applyProfileWithFuzzyMatch(
        discovered,
        resolved.profile,
        headers,
      );

      setMatchedProfile(resolved.profile);
      setFuzzyMatchCount(fuzzyMatches.length);
      setSchemaColumns(mappedCols);
      setSchemaMigration(detectSchemaChanges(headers, mappedCols, previousForMigration));

      recordUploadAttempt(true);
      recordTelemetry('upload_duration', {
        durationMs: Math.round(performance.now() - t0),
        success: true,
        metadata: { rows: p.rawRows.length, sheet: selectedSheet },
      });
      appendAuditLog('upload', `Imported ${fileName} — sheet "${selectedSheet}"`, {
        rows: p.rawRows.length,
        columns: headers.length,
        fuzzyMatches: fuzzyMatches.length,
      }, syncCtx);

      setWorkbookPreview(null);
      setValidationResult(null);
    } catch (e) {
      setError(`Parse error: ${(e as Error).message}`);
      recordUploadAttempt(false);
      recordTelemetry('upload_duration', {
        durationMs: Math.round(performance.now() - t0),
        success: false,
        metadata: { error: (e as Error).message },
      });
      appendAuditLog('upload', `Import failed: ${fileName}`, { error: (e as Error).message }, syncCtx);
    } finally {
      setParsing(false);
      setConfirming(false);
    }
  }, [pendingFile, selectedSheet, cohortName, sheetNames, fileName, syncCtx]);

  const handleLoadDemo = useCallback(() => {
    if (!cohortName.trim()) {
      setError('Please enter a cohort name before loading demo data.');
      return;
    }
    setLoadingDemo(true);
    setError(null);
    try {
      const demo = buildDemoPayload(cohortName.trim());
      loadFromParsed(demo);
      setVisualized(true);
      setFileName(demo.fileName);
      recordUploadAttempt(true);
      recordMappingAttempt(true);
      appendAuditLog('demo_load', `Loaded demo dataset for ${cohortName.trim()}`, {
        rows: demo.rawRows?.length ?? 0,
      }, syncCtx);
      void syncToCloud({
        fileName: demo.fileName,
        cohortName: cohortName.trim(),
        source: 'demo',
        schemaSignature: 'demo-signature',
        rowCount: demo.rawRows?.length ?? 0,
        headers: demo.headers,
        rawRows: demo.rawRows,
        mapping: demo.mapping,
        discoveredColumns: demo.discoveredColumns,
      });
      onDataImported?.({ cohortName: cohortName.trim() });
    } catch (e) {
      setError(`Demo load failed: ${(e as Error).message}`);
    } finally {
      setLoadingDemo(false);
    }
  }, [cohortName, loadFromParsed, onDataImported, syncToCloud, syncCtx]);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleVisualize = () => {
    if (!parsed || !mappingApplied) return;
    const mapping: ColumnMapping = Object.fromEntries(
      schemaColumns.map(c => [
        c.name,
        {
          mappedType: c.mappedType,
          mappedRole: c.mappedRole,
          mappedDisplayGroup: c.mappedDisplayGroup,
        },
      ]),
    );
    loadFromParsed({
      cohortName: cohortName.trim(),
      fileName,
      students: parsed.students.data,
      attendance: parsed.attendance.data,
      assignments: parsed.assignments.data,
      quiz: parsed.quiz.data,
      rawRows: parsed.rawRows ?? [],
      headers: parsed.headers ?? [],
      discoveredColumns: schemaColumns,
      mapping,
      classWiseAttendance: parsed.classWiseAttendance ?? [],
      classWiseAttendanceColumns: parsed.classWiseAttendanceColumns ?? [],
    });
    setVisualized(true);
    onDataImported?.({ cohortName: cohortName.trim() });
  };

  const handleApplyMapping = async () => {
    if (!parsed) return;
    const mapping: ColumnMapping = Object.fromEntries(
      schemaColumns.map(c => [
        c.name,
        {
          mappedType: c.mappedType,
          mappedRole: c.mappedRole,
          mappedDisplayGroup: c.mappedDisplayGroup,
        },
      ]),
    );

    let classWiseAttendance = parsed.classWiseAttendance ?? [];
    let classWiseAttendanceColumns = parsed.classWiseAttendanceColumns ?? [];
    if (!classWiseAttendance.length && pendingFile) {
      const classWise = await loadClassWiseAttendanceFromFile(pendingFile);
      classWiseAttendance = classWise?.entries ?? [];
      classWiseAttendanceColumns = classWise?.sessionColumns ?? [];
      if (classWiseAttendance.length) {
        setParsed(prev => prev ? { ...prev, classWiseAttendance, classWiseAttendanceColumns } : prev);
      }
    }

    try {
      loadFromParsed({
        cohortName: cohortName.trim(),
        fileName,
        students: parsed.students.data,
        attendance: parsed.attendance.data,
        assignments: parsed.assignments.data,
        quiz: parsed.quiz.data,
        rawRows: parsed.rawRows ?? [],
        headers: parsed.headers ?? [],
        discoveredColumns: schemaColumns,
        mapping,
        classWiseAttendance,
        classWiseAttendanceColumns,
      });

      generateDynamicAnalytics(parsed.rawRows ?? [], mapping);
      recordMappingAttempt(true);
      appendAuditLog('mapping_change', `Applied column mapping for ${fileName}`, {
        columns: schemaColumns.length,
      }, syncCtx);
      setMappingApplied(true);

      if (isCloudPersistenceEnabled()) {
        if (!cloudToken) {
          setCloudPublishStatus({
            tone: 'warn',
            text: 'Saved in this browser only. Sign in to your admin account, then click Apply Mapping again to publish the roster for students.',
          });
        } else {
          const publish = await syncToCloud({
            fileName,
            cohortName: cohortName.trim(),
            source: 'excel',
            schemaSignature: parsed.fileSignature,
            sheetName: selectedSheet || Object.values(parsed._sheetMapping)[0],
            rowCount: parsed.rawRows?.length ?? 0,
            changedColumns: schemaMigration?.changes ?? [],
            headers: parsed.headers,
            rawRows: parsed.rawRows,
            mapping,
            discoveredColumns: schemaColumns,
          });
          if (publish?.ok) {
            setCloudPublishStatus({
              tone: 'ok',
              text: `Roster published for students (${parsed.rawRows?.length ?? 0} rows). They can open the student page without uploading again.`,
            });
          } else {
            setCloudPublishStatus({
              tone: 'err',
              text: `Cloud publish failed${publish?.error ? `: ${publish.error}` : ''}. Students will not see this upload until publish succeeds.`,
            });
          }
        }
      }
    } catch (e) {
      recordMappingAttempt(false);
      setError(`Mapping failed: ${(e as Error).message}`);
    }
  };

  const handleSaveProfile = () => {
    if (!parsed?.fileSignature || !parsed.headers?.length || !schemaColumns.length) {
      setError('Cannot save schema profile. Missing schema metadata.');
      return;
    }
    const mapping: ColumnMapping = Object.fromEntries(
      schemaColumns.map(c => [
        c.name,
        {
          mappedType: c.mappedType,
          mappedRole: c.mappedRole,
          mappedDisplayGroup: c.mappedDisplayGroup,
        },
      ]),
    );
    saveSchemaProfile({
      fileSignature: parsed.fileSignature,
      headers: parsed.headers,
      mapping,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, syncCtx);
    appendAuditLog('mapping_change', `Saved mapping profile for ${fileName}`, {
      columns: schemaColumns.length,
    }, syncCtx);
    void persistSchemaProfileToCloud(
      {
        organizationId: organization?.id,
        userId: cloudUserId,
        fileSignature: parsed.fileSignature,
        headers: parsed.headers,
        mapping,
      },
      cloudToken,
    );
  };

  const profileSummary = useMemo(() => {
    if (!matchedProfile || !parsed?.headers?.length) return null;
    return {
      fuzzyMatchCount,
      source: matchedProfile.fileSignature,
    };
  }, [matchedProfile, parsed?.headers, fuzzyMatchCount]);

  /* ── tab data ── */
  const TABS: { key: TabKey; label: string; cols: string[] }[] = [
    { key: 'students',    label: 'Students',    cols: ['student_id','name','email','cohort','program','status'] },
    { key: 'attendance',  label: 'Attendance',  cols: ['student_email','session_date','attended','hours_attended','duration_hours'] },
    { key: 'assignments', label: 'Assignments', cols: ['student_email','assignment_name','due_date','status'] },
    { key: 'quiz',        label: 'Quiz',        cols: ['student_email','quiz_name','quiz_date','score','percentage'] },
  ];

  const totalErrors = parsed
    ? parsed.students.errors.length + parsed.attendance.errors.length + parsed.assignments.errors.length + parsed.quiz.errors.length
    : 0;

  /* ── render ── */
  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Cohort selector — always visible */}
      <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: BRAND.navy, whiteSpace: 'nowrap' }}>
          Cohort
        </label>
        <input
          type="text"
          value={cohortName}
          onChange={e => setCohortName(e.target.value)}
          placeholder="e.g. Incubator 12.0"
          disabled={parsing}
          style={{
            flex: 1, minWidth: 200, maxWidth: 340,
            padding: '8px 12px',
            border: `1.5px solid ${cohortName.trim() ? BRAND.border : BRAND.red}`,
            borderRadius: 8,
            fontSize: 14,
            fontFamily: 'inherit',
            color: BRAND.text,
            background: parsing ? BRAND.bg : '#fff',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 12, color: BRAND.textLight }}>
          Parsed data is shown on the dashboard immediately — no database upload required.
        </span>
        <button
          type="button"
          onClick={handleLoadDemo}
          disabled={loadingDemo || validating || parsing}
          style={{
            ...S.btn,
            background: '#f0f4ff',
            color: BRAND.navy,
            border: `1px solid ${BRAND.border}`,
            fontSize: 13,
          }}
        >
          {loadingDemo ? 'Loading demo…' : 'Load Demo Dataset'}
        </button>
      </div>

      {!canUpload && !visualized && (
        <div style={{ ...S.card, background: BRAND.yellowBg, border: `1px solid ${BRAND.yellowBorder}`, fontSize: 13, color: BRAND.yellow }}>
          Your role is read-only. Contact an admin to upload workbooks.
        </div>
      )}

      {!parsed && !parsing && !validating && !workbookPreview && !visualized && canUpload && (
        <div
          onDragEnter={e => { e.preventDefault(); setDragging(true); }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? BRAND.purple : BRAND.border}`,
            borderRadius: 16,
            padding: '52px 40px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? '#faf5ff' : BRAND.bg,
            transition: 'all 0.15s',
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 14 }}>📂</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: BRAND.navy, marginBottom: 6 }}>
            Drag & drop your Excel workbook here
          </div>
          <div style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 20 }}>
            or click to pick a file — <strong>.xlsx</strong> only
          </div>
          <div style={{ display: 'inline-block', padding: '10px 24px', background: BRAND.navy, color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
            Choose file
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {validating && (
        <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: BRAND.navy }}>Validating {fileName}…</div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Checking format, headers, and sheet structure</div>
        </div>
      )}

      {validationResult && !parsed && !workbookPreview && (
        <div style={S.card}>
          <UploadValidationCenter result={validationResult} />
          <button
            type="button"
            onClick={resetUploadFlow}
            style={{ ...S.btn, background: BRAND.navy, color: '#fff', fontSize: 13 }}
          >
            Choose a different file
          </button>
        </div>
      )}

      {workbookPreview && !parsed && validationResult?.valid && (
        <>
          {validationResult.issues.length > 0 && <UploadValidationCenter result={validationResult} />}
          <FilePreviewPanel
            preview={workbookPreview}
            selectedSheet={selectedSheet}
            onSelectSheet={setSelectedSheet}
            onConfirm={handleConfirmImport}
            onCancel={resetUploadFlow}
            confirming={confirming}
          />
        </>
      )}

      {/* Parsing spinner */}
      {parsing && (
        <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: BRAND.navy }}>Parsing {fileName}…</div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Reading workbook sheets</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: BRAND.redBg, border: `1px solid ${BRAND.redBorder}`, borderRadius: 10, padding: '12px 16px', color: BRAND.red, fontSize: 13, marginBottom: 14 }}>
          <strong>Error: </strong>{error}
          <button onClick={() => setError(null)} style={{ marginLeft: 10, background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>Dismiss</button>
        </div>
      )}

      {/* Ready on dashboard */}
      {visualized && (
        <div style={{ background: BRAND.greenBg, border: `1px solid ${BRAND.greenBorder}`, borderRadius: 12, padding: '18px 22px', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.green, marginBottom: 6 }}>
            ✓ {fileName} is live on the dashboard
          </div>
          <div style={{ fontSize: 13, color: BRAND.textLight }}>
            {parsed ? `${parsed.rawRows?.length ?? parsed.students.data.length} rows` : '12 demo students'} · cohort {cohortName.trim()} · open the Dashboard tab to view KPIs and charts.
          </div>
          <button onClick={resetUploadFlow} style={{ ...S.btn, marginTop: 14, background: BRAND.navy, color: '#fff', fontSize: 13 }}>Upload another file</button>
        </div>
      )}

      {/* Preview + schema review */}
      {parsed && !visualized && (
        <>
          {/* Step 2/3: Schema review and mapping */}
          <div style={{ ...S.card }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: BRAND.navy, marginBottom: 6 }}>
              Step 2 — Schema Review
            </div>
            <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 14 }}>
              Review detected schema, edit mapping, apply mapping, and save profile before visualization.
            </div>

            {schemaMigration && <SchemaMigrationPanel summary={schemaMigration} />}

            {profileSummary && profileSummary.fuzzyMatchCount > 0 && (
              <div
                style={{
                  marginBottom: 14,
                  background: '#f0fdf4',
                  border: `1px solid ${BRAND.greenBorder}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontSize: 12,
                  color: BRAND.text,
                }}
              >
                <strong>Fuzzy mapping reuse:</strong> {profileSummary.fuzzyMatchCount} column
                {profileSummary.fuzzyMatchCount !== 1 ? 's' : ''} auto-matched from saved profile
              </div>
            )}

            <ColumnMappingTable columns={schemaColumns} onChange={setSchemaColumns} />

            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={handleApplyMapping}
                style={{ ...S.btn, background: BRAND.navy, color: '#fff' }}
              >
                Step 5 — Apply Mapping
              </button>
              <button
                onClick={handleSaveProfile}
                style={{ ...S.btn, background: '#f0f4ff', color: BRAND.navy, border: `1px solid ${BRAND.border}` }}
              >
                Step 6 — Save Mapping Profile
              </button>
              {mappingApplied && (
                <span style={{ alignSelf: 'center', fontSize: 12, color: BRAND.green }}>
                  Mapping applied
                </span>
              )}
              {cloudPublishStatus && (
                <div
                  style={{
                    flex: '1 1 100%',
                    fontSize: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: cloudPublishStatus.tone === 'ok' ? BRAND.greenBg : cloudPublishStatus.tone === 'warn' ? BRAND.yellowBg : BRAND.redBg,
                    border: `1px solid ${cloudPublishStatus.tone === 'ok' ? BRAND.greenBorder : cloudPublishStatus.tone === 'warn' ? BRAND.yellowBorder : BRAND.redBorder}`,
                    color: cloudPublishStatus.tone === 'ok' ? BRAND.green : cloudPublishStatus.tone === 'warn' ? BRAND.yellow : BRAND.red,
                  }}
                >
                  {cloudPublishStatus.text}
                </div>
              )}
              {cloudEnabled && !session && (
                <div style={{ flex: '1 1 100%', fontSize: 12, color: BRAND.yellow }}>
                  Sign in (top right in Admin) before Apply Mapping so the roster is saved for all students.
                </div>
              )}
            </div>
          </div>

          {/* File info + summary */}
          <div style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.navy }}>📄 {fileName}</div>
              <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 3 }}>
                {parsed.students.data.length} students · {parsed.attendance.data.length} attendance · {parsed.assignments.data.length} assignments · {parsed.quiz.data.length} quiz records
              </div>
              <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: BRAND.textLight }}>Cohort:</span>
                <span style={{ fontWeight: 700, color: BRAND.navy, background: '#f0f4ff', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>
                  {cohortName.trim() || '—'}
                </span>
              </div>
              {parsed._sheetsFound.length > 0 && (
                <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 4 }}>
                  Sheet used: <strong>{Object.values(parsed._sheetMapping)[0]}</strong>
                  {' '}· {parsed._sheetsFound.length} sheet{parsed._sheetsFound.length !== 1 ? 's' : ''} in workbook
                </div>
              )}
              {totalErrors > 0 && (() => {
                const allErrors = [
                  ...parsed.students.errors,
                  ...parsed.attendance.errors,
                  ...parsed.assignments.errors,
                  ...parsed.quiz.errors,
                ];
                return (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 13, color: BRAND.red, cursor: 'pointer', userSelect: 'none' }}>
                      ⚠ {totalErrors} validation error{totalErrors !== 1 ? 's' : ''} — those rows will be skipped (click to expand)
                    </summary>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: BRAND.red, lineHeight: 1.7 }}>
                      {allErrors.map((e, i) => <li key={i}>{e.message}</li>)}
                    </ul>
                  </details>
                );
              })()}
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={resetUploadFlow} style={{ ...S.btn, background: 'transparent', color: BRAND.textLight, border: `1px solid ${BRAND.border}` }}>
                Choose different file
              </button>
              <button
                onClick={handleVisualize}
                disabled={(parsed.rawRows?.length ?? 0) === 0 || !mappingApplied}
                style={{
                  ...S.btn,
                  background: (parsed.rawRows?.length ?? 0) === 0 || !mappingApplied ? '#6b7280' : BRAND.purple,
                  color: '#fff',
                  cursor: (parsed.rawRows?.length ?? 0) === 0 || !mappingApplied ? 'not-allowed' : 'pointer',
                }}
              >
                View on Dashboard
              </button>
            </div>
          </div>

          {/* Column mapping panel */}
          {Object.keys(parsed.columnMapping).length > 0 && (
            <div style={{ ...S.card, marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.navy, marginBottom: 12 }}>
                Column Mapping — detected from your sheet
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: BRAND.bg }}>
                    <th style={{ padding: '7px 12px', textAlign: 'left', color: BRAND.textLight, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${BRAND.border}`, width: '40%' }}>Dashboard field</th>
                    <th style={{ padding: '7px 12px', textAlign: 'left', color: BRAND.textLight, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${BRAND.border}` }}>Excel column</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(parsed.columnMapping).map(([field, header], i) => {
                    const missing = header === '⚠ not found';
                    return (
                      <tr key={field} style={{ background: missing ? '#fef2f2' : i % 2 === 0 ? '#fff' : BRAND.bg }}>
                        <td style={{ padding: '7px 12px', color: missing ? BRAND.red : BRAND.text, borderBottom: `1px solid ${BRAND.border}` }}>{field}</td>
                        <td style={{ padding: '7px 12px', color: missing ? BRAND.red : '#15803d', fontWeight: 600, borderBottom: `1px solid ${BRAND.border}`, fontFamily: 'monospace', fontSize: 12 }}>{header}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sheet preview tabs */}
          <div style={S.card}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${BRAND.border}`, paddingBottom: 0 }}>
              {TABS.map(({ key, label }) => {
                const errCount = parsed[key].errors.length;
                const rowCount = parsed[key].data.length;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    style={{
                      padding: '8px 16px', border: 'none', borderRadius: '8px 8px 0 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      background: activeTab === key ? BRAND.navy : 'transparent',
                      color: activeTab === key ? '#fff' : BRAND.textLight,
                      borderBottom: activeTab === key ? `2px solid ${BRAND.navy}` : '2px solid transparent',
                    }}
                  >
                    {label}
                    <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 10, background: errCount > 0 ? BRAND.redBg : '#f0fdf4', color: errCount > 0 ? BRAND.red : BRAND.green }}>
                      {rowCount} {errCount > 0 ? `· ${errCount} err` : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            <PreviewTable
              rows={parsed[activeTab].data as unknown as Record<string, unknown>[]}
              cols={TABS.find(t => t.key === activeTab)!.cols}
            />

            {parsed[activeTab].errors.length > 0 && (
              <div style={{ marginTop: 14, background: BRAND.redBg, border: `1px solid ${BRAND.redBorder}`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.red, marginBottom: 6 }}>
                  {parsed[activeTab].errors.length} validation error(s) in this sheet — those rows are excluded
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: BRAND.red }}>
                  {parsed[activeTab].errors.slice(0, 8).map((e, i) => <li key={i}>{e.message}</li>)}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
