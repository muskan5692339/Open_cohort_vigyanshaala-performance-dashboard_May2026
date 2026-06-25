import type { ParsedExcelPayload } from './loadMetricsFromParsedExcel';
import type { ClassWiseAttendanceEntry } from './classWiseAttendance';

const DB_NAME = 'vs_cohort_roster_db';
const DB_VERSION = 1;
const PAYLOAD_STORE = 'payload';
const CLASS_WISE_STORE = 'class_wise';
const MAIN_KEY = 'active';

export interface CohortStoredMeta {
  fileName: string;
  cohortName: string;
  loadedAt: string;
  studentCount: number;
  classWiseStudentCount?: number;
  source?: 'excel' | 'cloud' | 'roster' | 'indexeddb';
}

interface StoredBundle {
  payload: ParsedExcelPayload;
  meta: CohortStoredMeta;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PAYLOAD_STORE)) {
        db.createObjectStore(PAYLOAD_STORE);
      }
      if (!db.objectStoreNames.contains(CLASS_WISE_STORE)) {
        db.createObjectStore(CLASS_WISE_STORE);
      }
    };
  });
}

function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  return openDb().then(
    db =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
        tx.oncomplete = () => db.close();
      }),
  );
}

function idbSet(storeName: string, key: string, value: unknown): Promise<void> {
  return openDb().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('IndexedDB write failed'));
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function readCohortFromIndexedDb(): Promise<StoredBundle | null> {
  try {
    const bundle = await idbGet<StoredBundle>(PAYLOAD_STORE, MAIN_KEY);
    if (!bundle?.payload) return null;

    const classWise = await idbGet<{
      entries: ClassWiseAttendanceEntry[];
      columns: string[];
    }>(CLASS_WISE_STORE, MAIN_KEY);

    if (classWise?.entries?.length && !bundle.payload.classWiseAttendance?.length) {
      return {
        ...bundle,
        payload: {
          ...bundle.payload,
          classWiseAttendance: classWise.entries,
          classWiseAttendanceColumns: classWise.columns,
        },
      };
    }

    return bundle;
  } catch {
    return null;
  }
}

export async function writeCohortToIndexedDb(
  payload: ParsedExcelPayload,
  meta: CohortStoredMeta,
): Promise<boolean> {
  try {
    const classWise = payload.classWiseAttendance ?? [];
    const classWiseColumns = payload.classWiseAttendanceColumns ?? [];

    const payloadForStore: ParsedExcelPayload = {
      ...payload,
      classWiseAttendance: undefined,
      classWiseAttendanceColumns: undefined,
    };

    await idbSet(PAYLOAD_STORE, MAIN_KEY, { payload: payloadForStore, meta } satisfies StoredBundle);

    if (classWise.length) {
      await idbSet(CLASS_WISE_STORE, MAIN_KEY, { entries: classWise, columns: classWiseColumns });
    }

    return true;
  } catch {
    return false;
  }
}

export async function clearCohortIndexedDb(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([PAYLOAD_STORE, CLASS_WISE_STORE], 'readwrite');
      tx.objectStore(PAYLOAD_STORE).delete(MAIN_KEY);
      tx.objectStore(CLASS_WISE_STORE).delete(MAIN_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
