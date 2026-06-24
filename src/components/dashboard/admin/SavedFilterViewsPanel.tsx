import { useState } from 'react';
import { Bookmark, Pencil, Trash2 } from 'lucide-react';
import type { GlobalFilterState, SavedFilterView } from '../../../types/opsTypes';
import { BRAND } from '../../../types/adminTypes';
import {
  deleteFilterView,
  listSavedFilterViews,
  loadFilterView,
  renameFilterView,
  saveFilterView,
} from '../../../services/savedFilterViewsStore';
import { useSyncContext } from '../../../hooks/useSyncContext';

interface SavedFilterViewsPanelProps {
  currentFilters: GlobalFilterState;
  onLoad: (filters: GlobalFilterState) => void;
}

export default function SavedFilterViewsPanel({ currentFilters, onLoad }: SavedFilterViewsPanelProps) {
  const syncCtx = useSyncContext();
  const [views, setViews] = useState<SavedFilterView[]>(() => listSavedFilterViews(syncCtx));
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const refresh = () => setViews(listSavedFilterViews(syncCtx));

  const handleSave = () => {
    if (!name.trim()) return;
    saveFilterView(name, currentFilters, syncCtx);
    setName('');
    refresh();
  };

  const handleLoad = (id: string) => {
    const filters = loadFilterView(id, syncCtx);
    if (filters) onLoad(filters);
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    renameFilterView(id, editName, syncCtx);
    setEditingId(null);
    setEditName('');
    refresh();
  };

  const handleDelete = (id: string) => {
    deleteFilterView(id, syncCtx);
    refresh();
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
        <Bookmark size={16} /> Saved Filter Views
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder='Save current filters as… e.g. "Telangana Colleges"'
          style={{
            flex: 1,
            minWidth: 220,
            padding: '8px 10px',
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: 8,
            background: BRAND.navy,
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Save View
        </button>
      </div>

      {views.length === 0 ? (
        <div style={{ fontSize: 12, color: BRAND.textLight }}>No saved views yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {views.map(view => (
            <div
              key={view.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                border: `1px solid ${BRAND.border}`,
                borderRadius: 8,
                background: BRAND.bg,
              }}
            >
              {editingId === view.id ? (
                <>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', border: `1px solid ${BRAND.border}`, borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
                  />
                  <button type="button" onClick={() => handleRename(view.id)} style={smallBtn}>Save</button>
                  <button type="button" onClick={() => setEditingId(null)} style={smallBtn}>Cancel</button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleLoad(view.id)}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                      color: BRAND.navy,
                    }}
                  >
                    {view.name}
                  </button>
                  <span style={{ fontSize: 11, color: BRAND.textLight }}>
                    {new Date(view.updatedAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setEditingId(view.id); setEditName(view.name); }}
                    style={iconBtn}
                    title="Rename"
                  >
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => handleDelete(view.id)} style={iconBtn} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  padding: '6px 10px',
  border: `1px solid ${BRAND.border}`,
  borderRadius: 6,
  background: '#fff',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const iconBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 4,
  color: BRAND.textLight,
  display: 'flex',
};
