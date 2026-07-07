import { useState } from 'react';
import {
  getPendingCorrectionForEmail,
  submitProfileCorrection,
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
  const pending = getPendingCorrectionForEmail(email);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() && !college.trim() && !course.trim() && !year.trim()) {
      setMessage('Please change at least one field.');
      return;
    }
    submitProfileCorrection({
      email,
      studentName,
      fields: {
        phone: phone.trim() || undefined,
        college: college.trim() || undefined,
        course: course.trim() || undefined,
        year: year.trim() || undefined,
      },
    });
    setMessage('Submitted for admin review. You will see updates after approval and the next data sync.');
    setOpen(false);
  };

  return (
    <div className="profile-edit-panel">
      <button type="button" className="profile-edit-panel__toggle" onClick={() => setOpen(v => !v)}>
        {open ? 'Hide' : 'Update my details'}
      </button>
      {pending && !open && (
        <p className="profile-edit-panel__pending" role="status">
          Your correction request is pending admin approval.
        </p>
      )}
      {open && (
        <form className="profile-edit-panel__form" onSubmit={handleSubmit}>
          <p className="profile-edit-panel__hint">
            Wrong phone, college, course, or year? Submit corrections here. An admin will review before the next weekly upload.
          </p>
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
          <button type="submit" className="profile-edit-panel__submit">Submit for approval</button>
          {message && <p className="profile-edit-panel__msg">{message}</p>}
        </form>
      )}
    </div>
  );
}
