import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  loadMetricsFromParsedExcel,
  type ParsedExcelPayload,
} from '../services/loadMetricsFromParsedExcel';
import type { MetricsDataset } from '../services/loadMetricsDataset';
import { getStudentLookupCount } from '../services/studentEmailLookup';
import type { ClassWiseAttendanceEntry } from '../services/classWiseAttendance';

const STORAGE_KEY = 'vs_uploaded_excel_v2';
const CLASS_WISE_KEY = 'vs_class_wise_attendance_v1';

export interface UploadedExcelMeta {
  fileName: string;
  cohortName: string;
  loadedAt: string;
  studentCount: number;
  classWiseStudentCount?: number;
}

interface UploadedExcelContextValue {
  dataset: MetricsDataset | null;
  payload: ParsedExcelPayload | null;
  meta: UploadedExcelMeta | null;
  loadFromParsed: (payload: ParsedExcelPayload) => void;
  clear: () => void;
}

const UploadedExcelContext = createContext<UploadedExcelContextValue | null>(null);

interface StoredClassWise {
  entries: ClassWiseAttendanceEntry[];
  columns: string[];
}

function readClassWiseStored(): StoredClassWise | null {
  try {
    const raw = sessionStorage.getItem(CLASS_WISE_KEY);
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
      return;
    }
    sessionStorage.setItem(CLASS_WISE_KEY, JSON.stringify({
      entries,
      columns: columns ?? [],
    }));
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

function readStored(): { payload: ParsedExcelPayload; meta: UploadedExcelMeta } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { payload: ParsedExcelPayload; meta: UploadedExcelMeta };
    const payload = mergeClassWise(parsed.payload);
    if (getStudentLookupCount(payload) === 0) return null;
    return { payload, meta: parsed.meta };
  } catch {
    return null;
  }
}

function writeStored(payload: ParsedExcelPayload, meta: UploadedExcelMeta) {
  const classWise = payload.classWiseAttendance ?? [];
  const classWiseColumns = payload.classWiseAttendanceColumns ?? [];

  writeClassWiseStored(classWise, classWiseColumns);

  const payloadForMainStore: ParsedExcelPayload = {
    ...payload,
    classWiseAttendance: undefined,
    classWiseAttendanceColumns: undefined,
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ payload: payloadForMainStore, meta }));
  } catch {
    /* quota exceeded — class-wise may still be stored separately */
  }
}

export function UploadedExcelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => {
    const stored = readStored();
    if (!stored) {
      return {
        dataset: null as MetricsDataset | null,
        payload: null as ParsedExcelPayload | null,
        meta: null as UploadedExcelMeta | null,
      };
    }
    return {
      dataset: loadMetricsFromParsedExcel(stored.payload),
      payload: stored.payload,
      meta: stored.meta,
    };
  });

  const loadFromParsed = useCallback((payload: ParsedExcelPayload) => {
    const classWiseCount = payload.classWiseAttendance?.length ?? 0;
    const meta: UploadedExcelMeta = {
      fileName: payload.fileName,
      cohortName: payload.cohortName,
      loadedAt: new Date().toISOString(),
      studentCount: getStudentLookupCount(payload),
      classWiseStudentCount: classWiseCount,
    };
    writeStored(payload, meta);
    if (import.meta.env.DEV) {
      console.debug('[UploadedExcel] class-wise students stored:', classWiseCount);
    }
    setState({ dataset: loadMetricsFromParsedExcel(payload), payload, meta });
  }, []);

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(CLASS_WISE_KEY);
    } catch {
      /* ignore */
    }
    setState({ dataset: null, payload: null, meta: null });
  }, []);

  const value = useMemo(
    () => ({
      dataset: state.dataset,
      payload: state.payload,
      meta: state.meta,
      loadFromParsed,
      clear,
    }),
    [state.dataset, state.payload, state.meta, loadFromParsed, clear],
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
