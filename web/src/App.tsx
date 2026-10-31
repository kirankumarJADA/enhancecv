import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import PublicBuilder from './pages/PublicBuilder';

export default function App() {
  return (
    <Routes>
      {/* Primary Public, Login-Free CV & ATS Workflows */}
      <Route path="/" element={<Landing />} />
      <Route path="/builder" element={<PublicBuilder />} />
      <Route path="/ats" element={<Navigate to="/builder?mode=ats" replace />} />
      <Route path="/check-ats" element={<Navigate to="/builder?mode=ats" replace />} />

      {/* Redirect obsolete auth and stateful routes cleanly to the public builder */}
      <Route path="/login" element={<Navigate to="/builder" replace />} />
      <Route path="/signup" element={<Navigate to="/builder" replace />} />
      <Route path="/onboarding" element={<Navigate to="/builder" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/builder" replace />} />
      <Route path="/reset-password" element={<Navigate to="/builder" replace />} />
      <Route path="/verify-email" element={<Navigate to="/builder" replace />} />
      <Route path="/tailor" element={<Navigate to="/builder?mode=improve" replace />} />
      <Route path="/app/*" element={<Navigate to="/builder" replace />} />
      <Route path="/app" element={<Navigate to="/builder" replace />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
