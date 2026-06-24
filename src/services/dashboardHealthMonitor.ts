import type { DashboardHealthMetrics, HealthStatus } from '../types/productionTypes';

const STORAGE_KEY = 'vs_dashboard_health_v1';

const DEFAULT: DashboardHealthMetrics = {
  uploadSuccessRate: 100,
  uploadAttempts: 0,
  uploadSuccesses: 0,
  mappingSuccessRate: 100,
  mappingAttempts: 0,
  mappingSuccesses: 0,
  analyticsStatus: 'idle',
  analyticsLastMs: null,
  analyticsRowCount: null,
  exportStatus: 'idle',
  exportLastAt: null,
  lastUpdated: new Date().toISOString(),
};

function read(): DashboardHealthMetrics {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

function write(m: DashboardHealthMetrics) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
}

function rate(successes: number, attempts: number): number {
  if (!attempts) return 100;
  return Math.round((successes / attempts) * 100);
}

export function getDashboardHealth(): DashboardHealthMetrics {
  return read();
}

export function recordUploadAttempt(success: boolean): DashboardHealthMetrics {
  const m = read();
  m.uploadAttempts += 1;
  if (success) m.uploadSuccesses += 1;
  m.uploadSuccessRate = rate(m.uploadSuccesses, m.uploadAttempts);
  m.lastUpdated = new Date().toISOString();
  write(m);
  return m;
}

export function recordMappingAttempt(success: boolean): DashboardHealthMetrics {
  const m = read();
  m.mappingAttempts += 1;
  if (success) m.mappingSuccesses += 1;
  m.mappingSuccessRate = rate(m.mappingSuccesses, m.mappingAttempts);
  m.lastUpdated = new Date().toISOString();
  write(m);
  return m;
}

export function recordAnalyticsRun(ms: number, rowCount: number, status: HealthStatus): DashboardHealthMetrics {
  const m = read();
  m.analyticsLastMs = ms;
  m.analyticsRowCount = rowCount;
  m.analyticsStatus = status;
  m.lastUpdated = new Date().toISOString();
  write(m);
  return m;
}

export function recordExport(success: boolean): DashboardHealthMetrics {
  const m = read();
  m.exportStatus = success ? 'ok' : 'error';
  m.exportLastAt = new Date().toISOString();
  m.lastUpdated = new Date().toISOString();
  write(m);
  return m;
}

export function measureAnalytics<T>(rowCount: number, fn: () => T): T {
  const start = performance.now();
  try {
    const result = fn();
    recordAnalyticsRun(Math.round(performance.now() - start), rowCount, rowCount > 8000 ? 'warning' : 'ok');
    return result;
  } catch (e) {
    recordAnalyticsRun(Math.round(performance.now() - start), rowCount, 'error');
    throw e;
  }
}
