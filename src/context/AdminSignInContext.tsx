import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import AdminSignInModal from '../components/dashboard/admin/AdminSignInModal';

interface AdminSignInContextValue {
  openSignIn: () => void;
}

const AdminSignInContext = createContext<AdminSignInContextValue | null>(null);

export function AdminSignInProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSignIn = useCallback(() => setOpen(true), []);

  const value = useMemo(() => ({ openSignIn }), [openSignIn]);

  return (
    <AdminSignInContext.Provider value={value}>
      {children}
      <AdminSignInModal open={open} onClose={() => setOpen(false)} />
    </AdminSignInContext.Provider>
  );
}

export function useAdminSignIn(): AdminSignInContextValue {
  const ctx = useContext(AdminSignInContext);
  if (!ctx) {
    return { openSignIn: () => {} };
  }
  return ctx;
}
