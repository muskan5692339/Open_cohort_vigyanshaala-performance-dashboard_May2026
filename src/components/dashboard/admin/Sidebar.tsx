import { useState } from 'react';
import {
  LayoutGrid,
  Users,
  Database,
  ArrowLeft,
  Menu,
  X,
  UserCheck,
  PieChart,
  MousePointerClick,
} from 'lucide-react';
import type { SidebarSection } from '../../../types/adminTypes';
import { BRAND } from '../../../types/adminTypes';

interface SidebarProps {
  active: SidebarSection;
  onChange: (s: SidebarSection) => void;
  onBackToStudent: () => void;
}

interface NavItem {
  id: SidebarSection;
  label: string;
  icon: typeof LayoutGrid;
}

import { countPendingProfileCorrections } from '../../../services/studentProfileCorrections';

const NAV_ITEMS: NavItem[] = [
  { id: 'program-overview', label: 'Program Overview', icon: PieChart },
  { id: 'portal-analytics', label: 'Portal Analytics', icon: MousePointerClick },
  { id: 'dashboard', label: 'Weekly Dashboard', icon: LayoutGrid },
  { id: 'profile-approvals', label: 'Student Updates', icon: UserCheck },
  { id: 'data-source', label: 'Data Sources', icon: Database },
  { id: 'students', label: 'Student Table', icon: Users },
];

export default function Sidebar({ active, onChange, onBackToStudent }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pendingUpdates = countPendingProfileCorrections();

  const sidebarStyle: React.CSSProperties = {
    width: 256,
    minWidth: 256,
    background: BRAND.navy,
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    position: 'sticky',
    top: 0,
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        style={{
          display: 'none',
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 50,
          background: BRAND.navy,
          color: '#fff',
          border: 'none',
          padding: 10,
          borderRadius: 8,
          cursor: 'pointer',
        }}
        className="vs-mobile-only"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <aside style={sidebarStyle}>
        {/* Logo */}
        <div
          style={{
            padding: '24px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: BRAND.yellow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: BRAND.navy,
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              VS
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>VigyanShaala</div>
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>Admin Console</div>
            </div>
          </div>
          {mobileOpen && (
            <button
              onClick={() => setMobileOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                padding: 4,
              }}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onChange(item.id);
                  setMobileOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  border: 'none',
                  borderRadius: 8,
                  background: isActive ? BRAND.yellow : 'transparent',
                  color: isActive ? BRAND.navy : 'rgba(255,255,255,0.85)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  marginBottom: 4,
                  textAlign: 'left',
                  transition: 'background 120ms, color 120ms',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === 'profile-approvals' && pendingUpdates > 0 && (
                  <span style={{
                    marginLeft: 'auto',
                    background: BRAND.yellow,
                    color: BRAND.navy,
                    fontSize: 10,
                    fontWeight: 800,
                    borderRadius: 999,
                    padding: '2px 7px',
                  }}>
                    {pendingUpdates}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '16px 16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={onBackToStudent}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 14px',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 8,
              background: 'transparent',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <ArrowLeft size={16} />
            Back to Student View
          </button>
        </div>
      </aside>
    </>
  );
}
