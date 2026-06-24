import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import HomePage from './HomePage';
import StudentDashboard from './Studentdashboard';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import { UploadedExcelProvider } from './context/UploadedExcelContext';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/system/ErrorBoundary';

type View = 'home' | 'student' | 'admin';

/** When true, hide Admin tab on home (staff can still open /admin). */
const STUDENT_ONLY_HOME = import.meta.env.VITE_STUDENT_ONLY === 'true';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<View>(() =>
    location.pathname.startsWith('/admin') ? 'admin' : 'home',
  );
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setView('admin');
      setEmail(null);
      return;
    }
    if (location.pathname === '/' && view === 'admin') {
      setView('home');
    }
  }, [location.pathname, view]);

  const goHome = () => {
    setEmail(null);
    setView('home');
    navigate('/');
  };

  const goAdmin = () => {
    setEmail(null);
    setView('admin');
    navigate('/admin');
  };

  const openStudentDashboard = (studentEmail: string) => {
    setEmail(studentEmail);
    setView('student');
    navigate('/');
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
      onAdminView={STUDENT_ONLY_HOME ? undefined : goAdmin}
      showAdminNav={!STUDENT_ONLY_HOME}
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
              <Route path="/admin/*" element={<AppContent />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
      </UploadedExcelProvider>
    </AuthProvider>
  );
}

export default App;
