import type { WorkbookPreview } from '../../types/productionTypes';
import { BRAND } from '../../types/adminTypes';

interface FilePreviewPanelProps {
  preview: WorkbookPreview;
  selectedSheet: string;
  onSelectSheet: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}

export default function FilePreviewPanel({
  preview,
  selectedSheet,
  onSelectSheet,
  onConfirm,
  onCancel,
  confirming,
}: FilePreviewPanelProps) {
  const sheet = preview.sheets.find(s => s.name === selectedSheet) ?? preview.sheets[0];

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.navy, marginBottom: 8 }}>File Preview — confirm before import</div>
      <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>
        {preview.sheetNames.length} sheet(s) found · select the data sheet to import
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {preview.sheets.map(s => (
          <button
            key={s.name}
            type="button"
            onClick={() => onSelectSheet(s.name)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${selectedSheet === s.name ? BRAND.navy : BRAND.border}`,
              background: selectedSheet === s.name ? '#eff6ff' : '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 12,
            }}
          >
            {s.name}
            <span style={{ marginLeft: 6, color: BRAND.textLight }}>
              ({s.rowCount} rows · {s.columnCount} cols)
            </span>
          </button>
        ))}
      </div>

      {sheet && (
        <>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <strong>{sheet.rowCount.toLocaleString()}</strong> rows · <strong>{sheet.columnCount}</strong> columns
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 280, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead style={{ background: BRAND.bg, position: 'sticky', top: 0 }}>
                <tr>
                  {sheet.headers.map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `1px solid ${BRAND.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.previewRows.map((r, i) => (
                  <tr key={i}>
                    {sheet.headers.map((_, j) => (
                      <td key={j} style={{ padding: '5px 8px', borderBottom: `1px solid ${BRAND.borderLight}`, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r[j] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button type="button" onClick={onConfirm} disabled={confirming || !selectedSheet} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: BRAND.navy, color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {confirming ? 'Processing…' : 'Confirm & Import Sheet'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 8, border: `1px solid ${BRAND.border}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
