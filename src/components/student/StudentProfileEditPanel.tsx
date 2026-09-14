import { useEffect, useState } from 'react';
import {
  fetchPendingProfileCorrectionCloud,
  getPendingCorrectionForEmail,
  submitProfileCorrectionCloud,
  type StudentProfileCorrection,
} from '../../services/studentProfileCorrections';
import './StudentProfileEditPanel.css';

interface Props {
  email: string;
  studentName: string;
  current: {
    phone: string;
    college: string;
    course: string;
    year: string;
  };
}

export default function StudentProfileEditPanel({ email, studentName, current }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(current.phone === '—' ? '' : current.phone);
  const [college, setCollege] = useState(current.college === '—' ? '' : current.college);
  const [course, setCourse] = useState(current.course === '—' ? '' : current.course);
  const [year, setYear] = useState(current.year === '—' ? '' : current.year);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingLocal, setPendingLocal] = useState<StudentProfileCorrection | null>(() =>
    getPendingCorrectionForEmail(email),
  );
  const [checkingPending, setCheckingPending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCheckingPending(true);
    void fetchPendingProfileCorrectionCloud(email).then(item => {
      if (cancelled) return;
      setPendingLocal(item);
      setCheckingPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() && !college.trim() && !course.trim() && !year.trim()) {
      setError('Please change at least one field.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    const result = await submitProfileCorrectionCloud({
      email,
      studentName,
      fields: {
        phone: phone.trim() || undefined,
        college: college.trim() || undefined,
        course: course.trim() || undefined,
        year: year.trim() || undefined,
      },
    });
    setSubmitting(false);
    if (result.item) setPendingLocal(result.item);
    if (result.error) {
      setError(result.error);
      setMessage('Request saved on this device. Ask admin to enable cloud Student Updates if this keeps happening.');
    } else {
      setMessage('Submitted for admin review. You will see updates after approval and the next data sync.');
    }
    setOpen(false);
  };

  return (
    <div className="profile-edit-panel">
      <button type="button" className="profile-edit-panel__toggle" onClick={() => setOpen(v => !v)}>
        {open ? 'Hide' : pendingLocal ? 'View submitted details' : 'Update my details'}
      </button>
      {checkingPending && !pendingLocal && !open && (
        <p className="profile-edit-panel__pending" role="status">
          Checking approval status…
        </p>
      )}
      {pendingLocal && !open && (
        <p className="profile-edit-panel__pending" role="status">
          Your correction request is pending admin approval.
        </p>
      )}
      {open && (
        <form className="profile-edit-panel__form" onSubmit={e => void handleSubmit(e)}>
          <p className="profile-edit-panel__hint">
            Wrong phone, college, course, or year? Submit corrections here. An admin will review before the next weekly upload.
          </p>
          {pendingLocal && (
            <p className="profile-edit-panel__pending" role="status">
              A request is already pending. Submitting again replaces it.
            </p>
          )}
          <label>
            Phone
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
          </label>
          <label>
            College / University
            <input type="text" value={college} onChange={e => setCollege(e.target.value)} />
          </label>
          <label>
            Course
            <input type="text" value={course} onChange={e => setCourse(e.target.value)} />
          </label>
          <label>
            Year
            <input type="text" value={year} onChange={e => setYear(e.target.value)} />
          </label>
          <button type="submit" className="profile-edit-panel__submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
          {error && <p className="profile-edit-panel__msg" role="alert">{error}</p>}
          {message && <p className="profile-edit-panel__msg">{message}</p>}
        </form>
      )}
      {!open && message && <p className="profile-edit-panel__msg">{message}</p>}
    </div>
  );
}
