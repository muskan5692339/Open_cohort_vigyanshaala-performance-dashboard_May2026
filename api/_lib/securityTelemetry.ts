import type { SupabaseClient } from '@supabase/supabase-js';

export type SecurityEventName = 'unauthorized_org_access' | 'forbidden_org_access';

export interface SecurityEventDetails {
  route: string;
  organizationId?: string;
  userId?: string;
  reason: string;
  method?: string;
}

/** Server-side security audit — never log tokens or full auth headers. */
export async function recordSecurityEvent(
  sb: SupabaseClient,
  event: SecurityEventName,
  details: SecurityEventDetails,
): Promise<void> {
  const safeDetails = {
    event,
    route: details.route,
    organizationId: details.organizationId ?? null,
    userId: details.userId ?? null,
    reason: details.reason,
    method: details.method ?? null,
  };

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[security]', JSON.stringify(safeDetails));
  }

  if (!details.organizationId) return;

  try {
    await sb.from('audit_logs').insert({
      organization_id: details.organizationId,
      event_type: 'security',
      message: event,
      details: safeDetails,
      created_by: details.userId ?? null,
    });
  } catch {
    // non-blocking
  }
}
