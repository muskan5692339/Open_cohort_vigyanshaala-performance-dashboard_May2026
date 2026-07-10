import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import HomePage from './HomePage';
import StudentDashboard from './Studentdashboard';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import { UploadedExcelProvider } from './context/UploadedExcelContext';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/system/ErrorBoundary';
import { useStudentEngagementTracker } from './hooks/useStudentEngagementTracker';
import { clearStudentPortalIdentity, persistStudentEmail, readPersistedStudentEmail } from './services/studentEngagementTracker';

type View = 'home' | 'student' | 'admin';

/** When true, hide Admin tab on home (staff can still open /admin). */
const STUDENT_ONLY_HOME = import.meta.env.VITE_STUDENT_ONLY === 'true';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const isStudentOnlyRoute = location.pathname.startsWith('/student-view');
  const isStudentPortalRoute =
    isStudentOnlyRoute || (STUDENT_ONLY_HOME && location.pathname === '/');
  const homePath = isStudentOnlyRoute ? '/student-view' : '/';

  const [view, setView] = useState<View>(() =>
    location.pathname.startsWith('/admin') ? 'admin' : 'home',
  );
  const [email, setEmail] = useState<string | null>(null);

  const trackedEmail =
    (view === 'student' ? email : null) ?? readPersistedStudentEmail();

  useStudentEngagementTracker(
    isStudentPortalRoute && view !== 'admin',
    isStudentOnlyRoute ? '/student-view' : location.pathname,
    trackedEmail,
  );

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setView('admin');
      setEmail(null);
      return;
    }
    if ((location.pathname === '/' || isStudentOnlyRoute) && view === 'admin') {
      setView('home');
    }
  }, [location.pathname, view, isStudentOnlyRoute]);

  const goHome = () => {
    clearStudentPortalIdentity();
    setEmail(null);
    setView('home');
    navigate(homePath);
  };

  const goAdmin = () => {
    clearStudentPortalIdentity();
    setEmail(null);
    setView('admin');
    navigate('/admin');
  };

  const openStudentDashboard = (studentEmail: string) => {
    persistStudentEmail(studentEmail);
    setEmail(studentEmail);
    setView('student');
    navigate(homePath);
  };

  if (view === 'admin') {
    return <AdminDashboardPage onBackToStudent={goHome} />;
  }

  if (view === 'student' && email) {
    return (
      <StudentDashboard
        email={email}
        onBack={goHome}
      />
    );
  }

  return (
    <HomePage
      onViewDashboard={openStudentDashboard}
      onAdminView={isStudentOnlyRoute || STUDENT_ONLY_HOME ? undefined : goAdmin}
      showAdminNav={!isStudentOnlyRoute && !STUDENT_ONLY_HOME}
      studentOnly={isStudentOnlyRoute}
    />
  );
}

function App() {
  return (
    <AuthProvider>
      <UploadedExcelProvider>
        <ErrorBoundary title="Application error">
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<AppContent />} />
              <Route path="/student-view" element={<AppContent />} />
              <Route path="/admin/*" element={<AppContent />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
      </UploadedExcelProvider>
    </AuthProvider>
  );
}

export default App;
