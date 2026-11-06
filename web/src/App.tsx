import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import PublicBuilder from './pages/PublicBuilder';
import Jobs from './pages/Jobs';
import Applications from './pages/Applications';

export default function App() {
  return (
    <Routes>
      {/* Primary Public, Login-Free CV & ATS Workflows */}
      <Route path="/" element={<Landing />} />
      <Route path="/builder" element={<PublicBuilder />} />
      <Route path="/ats" element={<Navigate to="/builder?mode=ats" replace />} />
      <Route path="/check-ats" element={<Navigate to="/builder?mode=ats" replace />} />
      <Route path="/tailor" element={<Navigate to="/builder?mode=improve" replace />} />

      {/* Public Job Discovery & Application Tracking (Phase 9E) - 100% Free, No Login Required */}
      <Route path="/jobs" element={<Jobs />} />
      <Route path="/jobs-discovery" element={<Navigate to="/jobs" replace />} />
      <Route path="/applications" element={<Applications />} />
      <Route path="/tracker" element={<Navigate to="/applications" replace />} />

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
