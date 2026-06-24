import type { GlobalFilterState, SavedFilterView } from '../types/opsTypes';
import type { SyncContext } from '../types/repositoryTypes';
import { migrateLegacyKey, readScoped, resolveOrgId, writeScoped } from '../services/orgScopedStorage';
import { appendAuditLog } from './auditRepository';
import { hydrateEntity, mergeSavedViews, pushEntityToCloud } from './repositoryCloudSync';

const BASE_KEY = 'vs_saved_views';
const LEGACY_KEY = 'vs_saved_filter_views_v1';

function readLocal(orgId?: string): SavedFilterView[] {
  const org = orgId ?? resolveOrgId();
  return (
    readScoped<SavedFilterView[]>(BASE_KEY, org) ??
    migrateLegacyKey<SavedFilterView>(LEGACY_KEY, BASE_KEY, org) ??
    []
  );
}

function writeLocal(views: SavedFilterView[], orgId?: string): void {
  writeScoped(BASE_KEY, views, orgId ?? resolveOrgId());
}

export const savedViewsRepository = {
  list(_ctx?: SyncContext): SavedFilterView[] {
    return readLocal(_ctx?.organizationId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  create(name: string, filters: GlobalFilterState, _ctx?: SyncContext): SavedFilterView {
    const now = new Date().toISOString();
    const view: SavedFilterView = {
      id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      filters: structuredClone(filters),
      createdAt: now,
      updatedAt: now,
    };
    writeLocal([view, ...readLocal(_ctx?.organizationId)], _ctx?.organizationId);
    appendAuditLog('saved_view', `Saved filter view "${view.name}"`, { viewId: view.id }, _ctx);
    void savedViewsRepository.sync(_ctx);
    return view;
  },

  update(id: string, name: string, _ctx?: SyncContext): SavedFilterView | null {
    const views = readLocal(_ctx?.organizationId);
    const idx = views.findIndex(v => v.id === id);
    if (idx < 0) return null;
    views[idx] = { ...views[idx], name: name.trim(), updatedAt: new Date().toISOString() };
    writeLocal(views, _ctx?.organizationId);
    appendAuditLog('saved_view', `Renamed filter view to "${views[idx].name}"`, { viewId: id }, _ctx);
    void savedViewsRepository.sync(_ctx);
    return views[idx];
  },

  delete(id: string, _ctx?: SyncContext): void {
    const removed = readLocal(_ctx?.organizationId).find(v => v.id === id);
    writeLocal(readLocal(_ctx?.organizationId).filter(v => v.id !== id), _ctx?.organizationId);
    if (removed) {
      appendAuditLog('saved_view', `Deleted filter view "${removed.name}"`, { viewId: id }, _ctx);
    }
    void savedViewsRepository.sync(_ctx);
  },

  getFilters(id: string, _ctx?: SyncContext): GlobalFilterState | null {
    const view = readLocal(_ctx?.organizationId).find(v => v.id === id);
    return view ? structuredClone(view.filters) : null;
  },

  async sync(ctx?: SyncContext): Promise<boolean> {
    const orgId = ctx?.organizationId ?? resolveOrgId();
    return pushEntityToCloud('saved_views', readLocal(orgId), { ...ctx, organizationId: orgId });
  },

  async hydrate(ctx?: SyncContext): Promise<SavedFilterView[]> {
    const orgId = ctx?.organizationId ?? resolveOrgId();
    const local = readLocal(orgId);
    const merged = await hydrateEntity('saved_views', local, mergeSavedViews, { ...ctx, organizationId: orgId });
    writeLocal(merged, orgId);
    return merged;
  },
};

export function listSavedFilterViews(ctx?: SyncContext): SavedFilterView[] {
  return savedViewsRepository.list(ctx);
}

export function saveFilterView(name: string, filters: GlobalFilterState, ctx?: SyncContext): SavedFilterView {
  return savedViewsRepository.create(name, filters, ctx);
}

export function renameFilterView(id: string, name: string, ctx?: SyncContext): SavedFilterView | null {
  return savedViewsRepository.update(id, name, ctx);
}

export function deleteFilterView(id: string, ctx?: SyncContext): void {
  savedViewsRepository.delete(id, ctx);
}

export function loadFilterView(id: string, ctx?: SyncContext): GlobalFilterState | null {
  return savedViewsRepository.getFilters(id, ctx);
}
