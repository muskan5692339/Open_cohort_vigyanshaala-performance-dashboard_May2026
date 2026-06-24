import { useEffect, useState } from 'react';
import { listCloudUploads } from '../../../services/cloud/uploadPersistence';
import { useAuth } from '../../../context/AuthContext';
import { BRAND } from '../../../types/adminTypes';

export default function UploadHistoryPanel() {
  const { session, organization } = useAuth();
  const [uploads, setUploads] = useState<
    { id: string; file_name: string; cohort_name: string; source: string; row_count: number; created_at: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session || !organization) return;
    setLoading(true);
    void listCloudUploads(organization.id, session.access_token).then((rows: typeof uploads) => {
      setUploads(rows);
      setLoading(false);
    });
  }, [session, organization]);

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Upload History</div>
      {loading && <div style={{ fontSize: 13, color: BRAND.textLight }}>Loading…</div>}
      {!loading && uploads.length === 0 && (
        <div style={{ fontSize: 13, color: BRAND.textLight }}>No cloud uploads yet. Uploads persist when Supabase is configured and you are signed in.</div>
      )}
      {uploads.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: BRAND.bg, textAlign: 'left' }}>
                <th style={{ padding: 8 }}>File</th>
                <th style={{ padding: 8 }}>Cohort</th>
                <th style={{ padding: 8 }}>Source</th>
                <th style={{ padding: 8 }}>Rows</th>
                <th style={{ padding: 8 }}>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map(u => (
                <tr key={u.id} style={{ borderTop: `1px solid ${BRAND.border}` }}>
                  <td style={{ padding: 8 }}>{u.file_name}</td>
                  <td style={{ padding: 8 }}>{u.cohort_name ?? '—'}</td>
                  <td style={{ padding: 8, textTransform: 'capitalize' }}>{u.source}</td>
                  <td style={{ padding: 8 }}>{u.row_count.toLocaleString()}</td>
                  <td style={{ padding: 8 }}>{new Date(u.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
