import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { AppRole, Organization, OrganizationMember, UserProfile } from '../types/cloudTypes';
import { DEFAULT_ORG_ID, roleCan } from '../types/cloudTypes';
import { getActiveOrganizationId, setActiveOrganizationId } from '../services/cloud/cloudConfig';
import { setOrgIdResolver } from '../services/orgScopedStorage';
import { hydrateAllRepositories } from '../hooks/useSyncContext';
import { installOfflineRecoveryListeners, runOfflineRecovery } from '../services/offlineRecovery';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  organization: Organization | null;
  membership: OrganizationMember | null;
  role: AppRole | null;
  loading: boolean;
  cloudEnabled: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  can: (permission: Parameters<typeof roleCan>[1]) => boolean;
  setOrganization: (org: Organization) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadMembership(userId: string): Promise<{
  org: Organization | null;
  member: OrganizationMember | null;
  profile: UserProfile | null;
}> {
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .eq('id', userId)
    .maybeSingle();

  const profile: UserProfile | null = profileRow
    ? { id: profileRow.id, email: profileRow.email, displayName: profileRow.display_name }
    : null;

  const { data: memberRow } = await supabase
    .from('organization_members')
    .select('id, organization_id, user_id, role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!memberRow) {
    return { org: null, member: null, profile };
  }

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('id', memberRow.organization_id)
    .maybeSingle();

  const org: Organization | null = orgRow
    ? { id: orgRow.id, name: orgRow.name, slug: orgRow.slug }
    : { id: memberRow.organization_id, name: 'Organization', slug: 'org' };

  const member: OrganizationMember = {
    id: memberRow.id,
    organizationId: memberRow.organization_id,
    userId: memberRow.user_id,
    role: memberRow.role as AppRole,
    isActive: memberRow.is_active,
  };

  return { org, member, profile };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganizationState] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<OrganizationMember | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const hydrateGeneration = useRef(0);
  const sessionRef = useRef<Session | null>(null);

  const cloudEnabled = isSupabaseConfigured();

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    setOrgIdResolver(() => organization?.id ?? getActiveOrganizationId() ?? DEFAULT_ORG_ID);
  }, [organization?.id]);

  const hydrate = useCallback(async (nextSession: Session | null) => {
    const generation = ++hydrateGeneration.current;
    setLoading(true);

    try {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setProfile(null);
        setMembership(null);
        setOrganizationState(null);
        return;
      }

      const { org, member, profile: p } = await loadMembership(nextSession.user.id);
      if (generation !== hydrateGeneration.current) return;

      setProfile(p);
      setMembership(member);
      if (org) {
        setOrganizationState(org);
        setActiveOrganizationId(org.id);
      }

      const syncCtx = {
        organizationId: org?.id ?? getActiveOrganizationId() ?? DEFAULT_ORG_ID,
        userId: nextSession.user.id,
        accessToken: nextSession.access_token,
      };

      await hydrateAllRepositories(syncCtx);
      if (generation !== hydrateGeneration.current) return;

      await runOfflineRecovery(nextSession.access_token);
    } finally {
      if (generation === hydrateGeneration.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!cloudEnabled) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      void hydrate(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void hydrate(nextSession);
    });

    return () => sub.subscription.unsubscribe();
  }, [cloudEnabled, hydrate]);

  useEffect(() => {
    if (!cloudEnabled) return;

    return installOfflineRecoveryListeners(async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token;
    });
  }, [cloudEnabled]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  }, []);

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    return { error: error?.message };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setMembership(null);
    setOrganizationState(null);
  }, []);

  const setOrganization = useCallback((org: Organization) => {
    setOrganizationState(org);
    setActiveOrganizationId(org.id);

    const active = sessionRef.current;
    if (!active?.user) return;

    const syncCtx = {
      organizationId: org.id,
      userId: active.user.id,
      accessToken: active.access_token,
    };

    void (async () => {
      await hydrateAllRepositories(syncCtx);
      await runOfflineRecovery(active.access_token);
    })();
  }, []);

  const role = membership?.role ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      organization,
      membership,
      role,
      loading,
      cloudEnabled,
      signInWithPassword,
      signInWithMagicLink,
      signOut,
      can: permission => roleCan(role, permission),
      setOrganization,
    }),
    [
      session,
      user,
      profile,
      organization,
      membership,
      role,
      loading,
      cloudEnabled,
      signInWithPassword,
      signInWithMagicLink,
      signOut,
      setOrganization,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      session: null,
      user: null,
      profile: null,
      organization: { id: getActiveOrganizationId() || DEFAULT_ORG_ID, name: 'Local', slug: 'local' },
      membership: null,
      role: null,
      loading: false,
      cloudEnabled: false,
      signInWithPassword: async () => ({ error: 'Auth not initialized' }),
      signInWithMagicLink: async () => ({ error: 'Auth not initialized' }),
      signOut: async () => {},
      can: () => true,
      setOrganization: () => {},
    };
  }
  return ctx;
}
