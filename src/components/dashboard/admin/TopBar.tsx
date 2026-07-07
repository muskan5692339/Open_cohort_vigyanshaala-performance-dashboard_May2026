import { RefreshCw, LogOut } from 'lucide-react';
import type { SidebarSection } from '../../../types/adminTypes';
import { BRAND } from '../../../types/adminTypes';
import { useAuth } from '../../../context/AuthContext';
import { useAdminSignIn } from '../../../context/AdminSignInContext';

interface TopBarProps {
  section: SidebarSection;
  lastSync: string;
  onSync: () => void;
  syncing: boolean;
}

const TITLES: Record<SidebarSection, { title: string; subtitle: string }> = {
  'program-overview': { title: 'Program Overview', subtitle: 'Activity tiers, assignments, quizzes — by category with student drill-down' },
  dashboard: { title: 'Weekly Dashboard', subtitle: 'Assignment trends by intervention group — one readable screen' },
  'profile-approvals': { title: 'Student Updates', subtitle: 'Approve profile corrections submitted by students' },
  students: { title: 'Student Table', subtitle: 'Search and export — use Weekly Dashboard for insights' },
  'data-source': { title: 'Data Sources', subtitle: 'Upload your weekly Excel workbook' },
  'cohort-overview': { title: 'Cohort Overview', subtitle: 'Legacy view' },
  attendance: { title: 'Attendance', subtitle: 'Legacy view' },
  assignments: { title: 'Assignments', subtitle: 'Legacy view' },
  quizzes: { title: 'Quizzes', subtitle: 'Legacy view' },
  risk: { title: 'Risk', subtitle: 'Legacy view' },
  'weekly-ops': { title: 'Weekly Ops', subtitle: 'Legacy view' },
  'cohort-comparison': { title: 'Cohort Comparison', subtitle: 'Legacy view' },
  'help-center': { title: 'Help Center', subtitle: 'Guides for uploads and mapping' },
  'system-health': { title: 'System Health', subtitle: 'Diagnostics and audit log' },
  sync: { title: 'Sync Monitoring', subtitle: 'Last run, history and reliability of OneDrive sync' },
  settings: { title: 'Settings', subtitle: 'Configure admin console preferences' },
};

export default function TopBar({ section, lastSync, onSync, syncing }: TopBarProps) {
  const meta = TITLES[section];
  const { user, profile, role, cloudEnabled, signOut } = useAuth();
  const { openSignIn } = useAdminSignIn();
  const initials = (profile?.displayName ?? profile?.email ?? 'AD').slice(0, 2).toUpperCase();
  const roleLabel = role ?? (cloudEnabled ? 'guest' : 'local');
  const signedIn = Boolean(user);
  return (
    <div
      style={{
        background: BRAND.card,
        borderBottom: `1px solid ${BRAND.border}`,
        padding: '16px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.text, lineHeight: 1.1 }}>
          {meta.title}
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>{meta.subtitle}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: BRAND.textLight, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Last Sync
          </div>
          <div style={{ fontSize: 12, color: BRAND.text, fontWeight: 600 }}>{lastSync}</div>
        </div>

        <button
          onClick={onSync}
          disabled={syncing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: BRAND.yellow,
            color: BRAND.navy,
            border: 'none',
            padding: '10px 16px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            cursor: syncing ? 'progress' : 'pointer',
            opacity: syncing ? 0.7 : 1,
            fontFamily: 'inherit',
          }}
        >
          <RefreshCw size={15} style={syncing ? { animation: 'vs-spin 1s linear infinite' } : undefined} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingLeft: 14,
            borderLeft: `1px solid ${BRAND.border}`,
          }}
        >
          {cloudEnabled && !signedIn && (
            <button
              type="button"
              onClick={openSignIn}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: BRAND.navy,
                color: '#fff',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              Sign in
            </button>
          )}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: BRAND.navy,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {initials}
          </div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.text }}>
              {profile?.displayName ?? user?.email?.split('@')[0] ?? (signedIn ? 'Admin' : 'Admin Guest')}
            </div>
            <div style={{ fontSize: 11, color: BRAND.textLight, marginTop: 2, textTransform: 'capitalize' }}>{roleLabel}</div>
          </div>
          {cloudEnabled && signedIn && (
            <button
              type="button"
              onClick={() => void signOut()}
              title="Sign out"
              style={{ marginLeft: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: BRAND.textLight, display: 'flex' }}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>

      <style>{`@keyframes vs-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
