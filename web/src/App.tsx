import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import PublicBuilder from './pages/PublicBuilder';
import Jobs from './pages/Jobs';
import Applications from './pages/Applications';
import Interview from './pages/Interview';
import LinkedIn from './pages/LinkedIn';
import PrepareApplication from './pages/PrepareApplication';

export default function App() {
  return (
    <Routes>
      {/* Primary Public, Login-Free CV & ATS Workflows */}
      <Route path="/" element={<Landing />} />
      <Route path="/builder" element={<PublicBuilder />} />
      <Route path="/ats" element={<Navigate to="/builder?mode=ats" replace />} />
      <Route path="/check-ats" element={<Navigate to="/builder?mode=ats" replace />} />
      <Route path="/tailor" element={<Navigate to="/builder?mode=improve" replace />} />

      {/* Unified Application Workflow (Phase 9O) */}
      <Route path="/prepare-application" element={<PrepareApplication />} />
      <Route path="/prepare" element={<Navigate to="/prepare-application" replace />} />

      {/* Public Job Discovery & Application Tracking (Phase 9E) - 100% Free, No Login Required */}
      <Route path="/jobs" element={<Jobs />} />
      <Route path="/jobs-discovery" element={<Navigate to="/jobs" replace />} />
      <Route path="/applications" element={<Applications />} />
      <Route path="/tracker" element={<Navigate to="/applications" replace />} />

      {/* Public AI Interview Preparation & Mock Interview Coach (Phase 9F) */}
      <Route path="/interview" element={<Interview />} />
      <Route path="/interview/:id" element={<Interview />} />
      <Route path="/interview-prep" element={<Navigate to="/interview" replace />} />

      {/* Public LinkedIn Profile Optimization (Phase 9G) */}
      <Route path="/linkedin" element={<LinkedIn />} />
      <Route path="/linkedin-optimizer" element={<Navigate to="/linkedin" replace />} />

      {/* Redirect obsolete auth and stateful routes cleanly to the public builder */}
      <Route path="/login" element={<Navigate to="/builder" replace />} />
      <Route path="/signup" element={<Navigate to="/builder" replace />} />
      <Route path="/onboarding" element={<Navigate to="/builder" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/builder" replace />} />
      <Route path="/reset-password" element={<Navigate to="/builder" replace />} />
      <Route path="/verify-email" element={<Navigate to="/builder" replace />} />
      <Route path="/app/*" element={<Navigate to="/builder" replace />} />
      <Route path="/app" element={<Navigate to="/builder" replace />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
