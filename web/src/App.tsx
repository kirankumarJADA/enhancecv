import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state/AuthContext';
import { PageSpinner } from './components/ui';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { ForgotPassword, ResetPassword, VerifyEmailLanding } from './pages/AuthFlows';
import Onboarding from './pages/Onboarding';
import AppLayout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MasterCVPage from './pages/MasterCV';
import Resumes from './pages/Resumes';
import ResumeEditor from './pages/ResumeEditor';
import JobAnalyses from './pages/JobAnalyses';
import Profile from './pages/Profile';
import Tailor from './pages/Tailor';
import Applications from './pages/Applications';
import Templates from './pages/Templates';
import AITools from './pages/AITools';
import Billing from './pages/Billing';
import Admin from './pages/Admin';
import Interview from './pages/Interview';
import Jobs from './pages/Jobs';
import HealthCenter from './pages/HealthCenter';

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
      <Route path="/verify-email" element={<VerifyEmailLanding />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
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
        <Route path="jobs-discovery" element={<Jobs />} />
        <Route path="interview" element={<Interview />} />
        <Route path="interview/:id" element={<Interview />} />
        <Route path="health" element={<HealthCenter />} />
        <Route path="applications" element={<Applications />} />
        <Route path="templates" element={<Templates />} />
        <Route path="ai-tools" element={<AITools />} />
        <Route path="billing" element={<Billing />} />
        <Route path="profile" element={<Profile />} />
        <Route path="admin" element={<Admin />} />
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
