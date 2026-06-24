import type { UploadValidationResult } from '../../types/productionTypes';
import { BRAND } from '../../types/adminTypes';

export default function UploadValidationCenter({ result }: { result: UploadValidationResult }) {
  if (!result.issues.length) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: 12, fontSize: 13, color: '#15803d', marginBottom: 14 }}>
        ✓ File passed validation ({(result.fileSizeBytes / 1024).toFixed(0)} KB)
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.navy, marginBottom: 8 }}>
        Upload Validation {result.valid ? '(warnings only)' : '(blocked)'}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {result.issues.map(issue => (
          <div
            key={issue.code}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 12,
              background: issue.severity === 'error' ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${issue.severity === 'error' ? '#fecaca' : '#fde68a'}`,
              color: issue.severity === 'error' ? '#b91c1c' : '#92400e',
            }}
          >
            <strong>{issue.message}</strong>
            {issue.suggestion && <div style={{ marginTop: 4, opacity: 0.9 }}>{issue.suggestion}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
