import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  loadMetricsFromParsedExcel,
  type ParsedExcelPayload,
} from '../services/loadMetricsFromParsedExcel';
import type { MetricsDataset } from '../services/loadMetricsDataset';
import {
  enrichPayloadForStudentLookup,
  getAllStudentEmails,
  getStudentLookupCount,
} from '../services/studentEmailLookup';
import type { ClassWiseAttendanceEntry } from '../services/classWiseAttendance';
import { fetchLatestCohortPayload } from '../services/cloud/uploadPersistence';
import { isCloudPersistenceEnabled } from '../services/cloud/cloudConfig';
import {
  clearCohortIndexedDb,
  readCohortFromIndexedDb,
  writeCohortToIndexedDb,
  type CohortStoredMeta,
} from '../services/cohortRosterStore';

const STORAGE_KEY = 'vs_uploaded_excel_v2';
const LOCAL_STORAGE_KEY = 'vs_uploaded_excel_local_v2';
const CLASS_WISE_KEY = 'vs_class_wise_attendance_v1';
const ROSTER_INDEX_KEY = 'vs_student_roster_index_v1';

export type UploadedExcelMeta = CohortStoredMeta;

interface UploadedExcelContextValue {
  dataset: MetricsDataset | null;
  payload: ParsedExcelPayload | null;
  meta: UploadedExcelMeta | null;
  loadFromParsed: (payload: ParsedExcelPayload) => void;
  clear: () => void;
  datasetLoading: boolean;
  datasetError: string | null;
}

const UploadedExcelContext = createContext<UploadedExcelContextValue | null>(null);

interface StoredClassWise {
  entries: ClassWiseAttendanceEntry[];
  columns: string[];
}

interface RosterIndex {
  emails: string[];
  cohortName: string;
  fileName: string;
  loadedAt: string;
}

function readClassWiseStored(): StoredClassWise | null {
  try {
    const raw = sessionStorage.getItem(CLASS_WISE_KEY) ?? localStorage.getItem(CLASS_WISE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredClassWise;
    if (!parsed.entries?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeClassWiseStored(entries: ClassWiseAttendanceEntry[] | undefined, columns: string[] | undefined) {
  try {
    if (!entries?.length) {
      sessionStorage.removeItem(CLASS_WISE_KEY);
      localStorage.removeItem(CLASS_WISE_KEY);
      return;
    }
    const json = JSON.stringify({ entries, columns: columns ?? [] });
    sessionStorage.setItem(CLASS_WISE_KEY, json);
    localStorage.setItem(CLASS_WISE_KEY, json);
  } catch {
    /* quota — in-memory only */
  }
}

function mergeClassWise(payload: ParsedExcelPayload): ParsedExcelPayload {
  if (payload.classWiseAttendance?.length) return payload;
  const stored = readClassWiseStored();
  if (!stored) return payload;
  return {
    ...payload,
    classWiseAttendance: stored.entries,
    classWiseAttendanceColumns: stored.columns,
  };
}

function payloadFromRosterIndex(index: RosterIndex): ParsedExcelPayload {
  return enrichPayloadForStudentLookup({
    cohortName: index.cohortName,
    fileName: index.fileName,
    students: index.emails.map(email => ({
      student_id: email,
      name: 'Unknown',
      email,
      college: '',
      program: '',
      cohort: index.cohortName,
      state: '',
      status: 'Active' as const,
    })),
    attendance: [],
    assignments: [],
    quiz: [],
  });
}

function readRosterIndex(): RosterIndex | null {
  try {
    const raw = localStorage.getItem(ROSTER_INDEX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RosterIndex;
    if (!parsed.emails?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRosterIndex(payload: ParsedExcelPayload, meta: UploadedExcelMeta) {
  const emails = getAllStudentEmails(payload);
  if (!emails.length) return;
  try {
    localStorage.setItem(ROSTER_INDEX_KEY, JSON.stringify({
      emails,
      cohortName: meta.cohortName,
      fileName: meta.fileName,
      loadedAt: meta.loadedAt,
    } satisfies RosterIndex));
  } catch {
    /* ignore */
  }
}

function tryParseStored(raw: string | null): { payload: ParsedExcelPayload; meta: UploadedExcelMeta } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { payload: ParsedExcelPayload; meta: UploadedExcelMeta };
    const payload = enrichPayloadForStudentLookup(mergeClassWise(parsed.payload));
    if (getStudentLookupCount(payload) === 0) return null;
    return { payload, meta: parsed.meta };
  } catch {
    return null;
  }
}

function readStoredSync(): { payload: ParsedExcelPayload; meta: UploadedExcelMeta } | null {
  const fromSession = tryParseStored(sessionStorage.getItem(STORAGE_KEY));
  if (fromSession) return fromSession;

  const fromLocal = tryParseStored(localStorage.getItem(LOCAL_STORAGE_KEY));
  if (fromLocal) return fromLocal;

  const roster = readRosterIndex();
  if (!roster) return null;

  const payload = mergeClassWise(payloadFromRosterIndex(roster));
  return {
    payload,
    meta: {
      fileName: roster.fileName,
      cohortName: roster.cohortName,
      loadedAt: roster.loadedAt,
      studentCount: roster.emails.length,
      source: 'roster',
    },
  };
}

function writeStored(payload: ParsedExcelPayload, meta: UploadedExcelMeta) {
  const classWise = payload.classWiseAttendance ?? [];
  const classWiseColumns = payload.classWiseAttendanceColumns ?? [];

  writeClassWiseStored(classWise, classWiseColumns);
  writeRosterIndex(payload, meta);
  void writeCohortToIndexedDb(payload, meta);

  const payloadForMainStore: ParsedExcelPayload = {
    ...payload,
    classWiseAttendance: undefined,
    classWiseAttendanceColumns: undefined,
  };

  const bundle = JSON.stringify({ payload: payloadForMainStore, meta });

  try {
    sessionStorage.setItem(STORAGE_KEY, bundle);
  } catch {
    /* quota exceeded */
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, bundle);
  } catch {
    /* quota exceeded — roster index / IndexedDB may still be available */
  }
}

function applyLoadedState(
  payload: ParsedExcelPayload,
  meta: UploadedExcelMeta,
): {
  dataset: MetricsDataset;
  payload: ParsedExcelPayload;
  meta: UploadedExcelMeta;
} {
  const enriched = enrichPayloadForStudentLookup(mergeClassWise(payload));
  const finalMeta: UploadedExcelMeta = {
    ...meta,
    studentCount: getStudentLookupCount(enriched),
    classWiseStudentCount: enriched.classWiseAttendance?.length,
  };
  return {
    dataset: loadMetricsFromParsedExcel(enriched),
    payload: enriched,
    meta: finalMeta,
  };
}

export function UploadedExcelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => {
    const stored = readStoredSync();
    if (!stored) {
      return {
        dataset: null as MetricsDataset | null,
        payload: null as ParsedExcelPayload | null,
        meta: null as UploadedExcelMeta | null,
      };
    }
    const applied = applyLoadedState(stored.payload, stored.meta);
    return applied;
  });
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const bootstrapAttempted = useRef(false);

  const loadFromParsed = useCallback((payload: ParsedExcelPayload) => {
    const merged = mergeClassWise(payload);
    const enriched = enrichPayloadForStudentLookup(merged);
    const meta: UploadedExcelMeta = {
      fileName: enriched.fileName,
      cohortName: enriched.cohortName,
      loadedAt: new Date().toISOString(),
      studentCount: getStudentLookupCount(enriched),
      classWiseStudentCount: enriched.classWiseAttendance?.length,
      source: 'excel',
    };
    writeStored(enriched, meta);
    setDatasetError(null);
    if (import.meta.env.DEV) {
      console.debug('[UploadedExcel] cohort saved:', meta.studentCount, 'students');
    }
    setState(applyLoadedState(enriched, meta));
  }, []);

  useEffect(() => {
    if (bootstrapAttempted.current) return;
    bootstrapAttempted.current = true;

    const hydrate = async () => {
      if (getStudentLookupCount(state.payload) > 0) return;

      setDatasetLoading(true);
      setDatasetError(null);

      try {
        const fromIdb = await readCohortFromIndexedDb();
        if (fromIdb && getStudentLookupCount(fromIdb.payload) > 0) {
          const applied = applyLoadedState(fromIdb.payload, {
            ...fromIdb.meta,
            source: 'indexeddb',
          });
          writeStored(applied.payload, applied.meta);
          setState(applied);
          return;
        }

        if (!isCloudPersistenceEnabled()) {
          setDatasetError('No cohort data on this device. Admin must upload the workbook once from Admin → Data Source.');
          return;
        }

        for (let attempt = 0; attempt < 3; attempt++) {
          const result = await fetchLatestCohortPayload();
          if (result?.payload && getStudentLookupCount(result.payload) > 0) {
            const applied = applyLoadedState(result.payload, {
              ...result.meta,
              source: 'cloud',
            });
            writeStored(applied.payload, applied.meta);
            setState(applied);
            return;
          }
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          }
        }

        setDatasetError(
          'Cohort roster not found in the cloud yet. Admin: open Admin → Data Source, upload the Excel file, and click Apply mapping (once). Students can then return here — no daily upload needed.',
        );
      } finally {
        setDatasetLoading(false);
      }
    };

    void hydrate();
  }, [state.payload]);

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(CLASS_WISE_KEY);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem(CLASS_WISE_KEY);
      localStorage.removeItem(ROSTER_INDEX_KEY);
    } catch {
      /* ignore */
    }
    void clearCohortIndexedDb();
    setState({ dataset: null, payload: null, meta: null });
    setDatasetError(null);
  }, []);

  const value = useMemo(
    () => ({
      dataset: state.dataset,
      payload: state.payload,
      meta: state.meta,
      loadFromParsed,
      clear,
      datasetLoading,
      datasetError,
    }),
    [state.dataset, state.payload, state.meta, loadFromParsed, clear, datasetLoading, datasetError],
  );

  return (
    <UploadedExcelContext.Provider value={value}>{children}</UploadedExcelContext.Provider>
  );
}

export function useUploadedExcel() {
  const ctx = useContext(UploadedExcelContext);
  if (!ctx) throw new Error('useUploadedExcel must be used within UploadedExcelProvider');
  return ctx;
}
