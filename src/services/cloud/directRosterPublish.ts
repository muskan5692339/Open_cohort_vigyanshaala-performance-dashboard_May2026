import type { ColumnMapping, DiscoveredColumn } from '../../types/dynamicSchema';
import { supabase } from '../../lib/supabase';
import { getActiveOrganizationId } from './cloudConfig';

export interface RosterPublishInput {
  organizationId?: string;
  cohortName: string;
  fileName: string;
  headers: string[];
  rawRows: Record<string, string>[];
  mapping?: ColumnMapping;
  discoveredColumns?: DiscoveredColumn[];
}

async function gzipString(json: string): Promise<Blob> {
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([json], { type: 'application/json' }).stream().pipeThrough(
      new CompressionStream('gzip'),
    );
    return new Response(stream).blob();
  }
  throw new Error('Browser cannot compress roster (CompressionStream unavailable)');
}

/** Upload roster directly to public Supabase Storage — no Vercel API body limit. */
export async function publishRosterDirectToStorage(
  input: RosterPublishInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!input.rawRows?.length || !input.headers?.length) {
    return { ok: false, error: 'No roster rows to publish' };
  }

  const orgId = input.organizationId ?? getActiveOrganizationId();
  const payloadObj = {
    headers: input.headers,
    rawRows: input.rawRows,
    mapping: input.mapping ?? {},
    discoveredColumns: input.discoveredColumns ?? [],
    cohortName: input.cohortName,
    fileName: input.fileName,
  };

  try {
    const blob = await gzipString(JSON.stringify(payloadObj));
    const paths = [`${orgId}/latest.json.gz`, 'latest.json.gz'];

    for (const path of paths) {
      const { error } = await supabase.storage
        .from('student-roster-public')
        .upload(path, blob, { contentType: 'application/gzip', upsert: true });
      if (error) {
        return { ok: false, error: `${path}: ${error.message}` };
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
