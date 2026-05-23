import { useState } from 'react';
import HomePage from './HomePage';
import StudentDashboard from './Studentdashboard';

function App() {
  const [email, setEmail] = useState<string | null>(null);

  if (email) {
    return <StudentDashboard email={email} onBack={() => setEmail(null)} />;
  }
  return <HomePage onViewDashboard={setEmail} />;
}

export default App;
