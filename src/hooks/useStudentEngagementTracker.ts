import { useEffect, useRef } from 'react';
import { StudentPortalSession } from '../services/studentEngagementTracker';

/** Track clicks and active time on the student portal (/student-view). */
export function useStudentEngagementTracker(enabled: boolean, path: string, studentEmail?: string | null) {
  const sessionRef = useRef<StudentPortalSession | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const session = new StudentPortalSession(path);
    sessionRef.current = session;
    session.setStudentEmail(studentEmail);
    session.start();
    return () => {
      session.stop();
      sessionRef.current = null;
    };
  }, [enabled, path]);

  useEffect(() => {
    sessionRef.current?.setStudentEmail(studentEmail);
  }, [studentEmail]);
}
