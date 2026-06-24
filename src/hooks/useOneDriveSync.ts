import { useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { SyncLog } from '../types/syncTypes';
import { loadSyncConfig } from '../services/oneDriveSync';

export interface ApiSyncResult {
  status: 'success' | 'partial' | 'error';
  durationMs: number;
  totalInserted: number;
  totalUpdated: number;
  totalFailed: number;
  sheets: Record<string, { rowsRead: number; inserted: number; updated: number; failed: number }>;
  errors: { message: string }[];
}

export interface SyncState {
  isRunning: boolean;
  result: ApiSyncResult | null;
  error: string | null;
  logs: SyncLog[];
}

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export function useOneDriveSync() {
  const [state, setState] = useState<SyncState>({ isRunning: false, result: null, error: null, logs: [] });

  const refreshLogs = useCallback(async () => {
    const { data } = await supabase
      .from('sync_logs')
      .select('*')
      .order('run_at', { ascending: false })
      .limit(20);
    if (data) setState(s => ({ ...s, logs: data as SyncLog[] }));
  }, []);

  const triggerSync = useCallback(async () => {
    const cfg = loadSyncConfig();

    setState(s => ({ ...s, isRunning: true, error: null, result: null }));

    try {
      const body: Record<string, unknown> = {};
      if (cfg?.oneDriveFileId)  body.fileId  = cfg.oneDriveFileId;
      if (cfg?.oneDriveDriveId) body.driveId = cfg.oneDriveDriveId;
      if (cfg?.sheetNames)      body.sheetNames = cfg.sheetNames;

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const text = await res.text();

      if (!text.trim()) {
        throw new Error(
          res.status === 404
            ? 'API route not found. Run "vercel dev" (not "npm run dev") to serve /api/ routes locally.'
            : `Server returned an empty response (HTTP ${res.status}). Check Vercel function logs.`,
        );
      }

      let data: ApiSyncResult & { error?: string };
      try {
        data = JSON.parse(text) as ApiSyncResult & { error?: string };
      } catch {
        throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setState(s => ({ ...s, isRunning: false, result: data }));
      await refreshLogs();
    } catch (err) {
      setState(s => ({ ...s, isRunning: false, error: (err as Error).message }));
    }
  }, [refreshLogs]);

  const reset = useCallback(() => {
    setState(s => ({ ...s, result: null, error: null }));
  }, []);

  return { state, triggerSync, refreshLogs, reset };
}
