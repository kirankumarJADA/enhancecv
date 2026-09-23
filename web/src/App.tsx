import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state/AuthContext';
import { PageSpinner } from './components/ui';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Onboarding from './pages/Onboarding';
import AppLayout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MasterCVPage from './pages/MasterCV';
import Resumes from './pages/Resumes';
import ResumeEditor from './pages/ResumeEditor';
import JobAnalyses from './pages/JobAnalyses';
import Profile from './pages/Profile';
import Tailor from './pages/Tailor';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <PageSpinner />;

  return (
    <Routes>
      <Route path="/" element={user && user.onboarded ? <Navigate to="/app" replace /> : <Landing />} />
      <Route path="/login" element={user ? <Navigate to={user.onboarded ? '/app' : '/onboarding'} replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to={user.onboarded ? '/app' : '/onboarding'} replace /> : <Signup />} />
      <Route
        path="/onboarding"
        element={user ? <Onboarding /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app"
        element={
          <Protected>
            {user && !user.onboarded ? <Navigate to="/onboarding" replace /> : <AppLayout />}
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="master" element={<MasterCVPage />} />
        <Route path="resumes" element={<Resumes />} />
        <Route path="resumes/:id/edit" element={<ResumeEditor />} />
        <Route path="jobs" element={<JobAnalyses />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route
        path="/tailor"
        element={
          <Protected>
            {user && !user.onboarded ? <Navigate to="/onboarding" replace /> : <Tailor />}
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
