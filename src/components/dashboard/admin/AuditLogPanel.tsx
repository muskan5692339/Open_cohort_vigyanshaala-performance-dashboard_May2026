import { useState } from 'react';
import { listAuditLog } from '../../../services/auditLogStore';
import { useSyncContext } from '../../../hooks/useSyncContext';
import { BRAND } from '../../../types/adminTypes';

export default function AuditLogPanel() {
  const syncCtx = useSyncContext();
  const [query, setQuery] = useState('');
  const entries = listAuditLog(query, 80, syncCtx);

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Audit Log</div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search uploads, exports, mappings, risk actions…"
        style={{ width: '100%', maxWidth: 420, padding: '8px 10px', border: `1px solid ${BRAND.border}`, borderRadius: 8, marginBottom: 12, fontFamily: 'inherit', fontSize: 13 }}
      />
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: BRAND.textLight }}>No audit entries yet.</div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto', display: 'grid', gap: 8 }}>
          {entries.map(e => (
            <div key={e.id} style={{ padding: 10, background: BRAND.bg, borderRadius: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 700, color: BRAND.navy, textTransform: 'uppercase', fontSize: 10 }}>{e.type.replace('_', ' ')}</span>
                <span style={{ color: BRAND.textLight }}>{new Date(e.timestamp).toLocaleString()}</span>
              </div>
              <div style={{ marginTop: 4 }}>{e.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
