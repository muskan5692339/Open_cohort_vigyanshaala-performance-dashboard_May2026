import { DEFAULT_ORG_ID } from '../types/cloudTypes';

export type StudentPortalEventType = 'page_view' | 'session_pulse';

export interface StudentPortalEventPayload {
  orgId: string;
  type: StudentPortalEventType;
  sessionId: string;
  path: string;
  studentEmail?: string;
  clickCount?: number;
  activeMs?: number;
  isFinal?: boolean;
}

const SESSION_KEY = 'vs_student_portal_session';
const STUDENT_EMAIL_KEY = 'vs_student_portal_email';
const FLUSH_INTERVAL_MS = 15_000;

/** Anonymous student portal — use build-time org, not admin localStorage. */
function resolveOrgId(): string {
  return import.meta.env.VITE_DEFAULT_ORG_ID || DEFAULT_ORG_ID;
}

export function readPersistedStudentEmail(): string | null {
  try {
    const raw = sessionStorage.getItem(STUDENT_EMAIL_KEY)?.trim().toLowerCase();
    return raw || null;
  } catch {
    return null;
  }
}

export function persistStudentEmail(email: string | null | undefined): void {
  try {
    const normalized = email?.trim().toLowerCase();
    if (normalized) sessionStorage.setItem(STUDENT_EMAIL_KEY, normalized);
    else sessionStorage.removeItem(STUDENT_EMAIL_KEY);
  } catch {
    // ignore
  }
}

export function clearStudentPortalIdentity(): void {
  try {
    sessionStorage.removeItem(STUDENT_EMAIL_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function newSessionId(): string {
  return `sp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = newSessionId();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return newSessionId();
  }
}

export async function sendStudentPortalEvent(payload: StudentPortalEventPayload): Promise<void> {
  try {
    await fetch('/api/student-engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: payload.isFinal === true,
    });
  } catch {
    // non-blocking
  }
}

export function sendStudentPortalEventBeacon(payload: StudentPortalEventPayload): void {
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon('/api/student-engagement', blob);
  } catch {
    void sendStudentPortalEvent(payload);
  }
}

export class StudentPortalSession {
  private sessionId = readSessionId();
  private path: string;
  private studentEmail: string | null = null;
  private clickCount = 0;
  private activeMs = 0;
  private lastTick = Date.now();
  private visible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
  private started = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onClick: ((e: MouseEvent) => void) | null = null;
  private onVisibility: (() => void) | null = null;
  private onPageHide: (() => void) | null = null;

  constructor(path: string) {
    this.path = path;
  }

  setStudentEmail(email: string | null | undefined) {
    const normalized = email?.trim().toLowerCase() || null;
    if (normalized) persistStudentEmail(normalized);
    const resolved = normalized ?? readPersistedStudentEmail();
    const changed = resolved !== this.studentEmail;
    this.studentEmail = resolved;
    if (this.started && changed && this.studentEmail) this.flush(false);
  }

  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    this.lastTick = Date.now();
    this.studentEmail = readPersistedStudentEmail();

    void sendStudentPortalEvent({
      orgId: resolveOrgId(),
      type: 'page_view',
      sessionId: this.sessionId,
      path: this.path,
      studentEmail: this.studentEmail ?? undefined,
    });

    this.onClick = () => {
      this.tick();
      this.clickCount += 1;
      if (this.clickCount % 5 === 0) this.flush(false);
    };
    document.addEventListener('click', this.onClick, true);

    this.onVisibility = () => {
      this.tick();
      this.visible = document.visibilityState === 'visible';
      this.lastTick = Date.now();
      if (!this.visible) this.flush(false);
    };
    document.addEventListener('visibilitychange', this.onVisibility);

    this.onPageHide = () => this.flush(true);
    window.addEventListener('pagehide', this.onPageHide);

    this.intervalId = setInterval(() => {
      this.tick();
      this.flush(false);
    }, FLUSH_INTERVAL_MS);
  }

  stop() {
    this.flush(true);
    if (this.onClick) document.removeEventListener('click', this.onClick, true);
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.onPageHide) window.removeEventListener('pagehide', this.onPageHide);
    if (this.intervalId) clearInterval(this.intervalId);
    this.started = false;
  }

  private tick() {
    const now = Date.now();
    if (this.visible) this.activeMs += now - this.lastTick;
    this.lastTick = now;
  }

  private flush(isFinal: boolean) {
    this.tick();
    const payload: StudentPortalEventPayload = {
      orgId: resolveOrgId(),
      type: 'session_pulse',
      sessionId: this.sessionId,
      path: this.path,
      studentEmail: this.studentEmail ?? undefined,
      clickCount: this.clickCount,
      activeMs: Math.round(this.activeMs),
      isFinal,
    };
    if (isFinal) sendStudentPortalEventBeacon(payload);
    else void sendStudentPortalEvent(payload);
  }
}
