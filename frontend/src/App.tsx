import { Routes, Route, Navigate } from 'react-router-dom';
import { useIdentityStore } from '@/lib/identity-store';
import { useActiveIdentity } from '@/lib/hooks';
import { ToastRoot } from '@/components/ui';
import { OnboardingPage } from '@/routes/Onboarding';
import { WorkerHome } from '@/routes/WorkerHome';
import { CitizenHome } from '@/routes/CitizenHome';
import { VerifyPage } from '@/routes/Verify';
import { LabsPage } from '@/routes/Labs';
import { SettingsPage } from '@/routes/Settings';
import { TopBar } from '@/components/TopBar';

function ProtectedSurface({ children }: { children: React.ReactNode }) {
  const activeId = useIdentityStore((s) => s.activeIdentityId);
  const identity = useActiveIdentity();
  // No identity selected → redirect to onboarding.
  if (!activeId || !identity) return <Navigate to="/" replace />;
  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <TopBar identity={identity} />
      {children}
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<OnboardingPage />} />
        <Route
          path="/worker/*"
          element={
            <ProtectedSurface>
              <WorkerHome />
            </ProtectedSurface>
          }
        />
        <Route
          path="/citizen/*"
          element={
            <ProtectedSurface>
              <CitizenHome />
            </ProtectedSurface>
          }
        />
        <Route
          path="/verify"
          element={
            <ProtectedSurface>
              <VerifyPage />
            </ProtectedSurface>
          }
        />
        <Route
          path="/labs"
          element={
            <ProtectedSurface>
              <LabsPage />
            </ProtectedSurface>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedSurface>
              <SettingsPage />
            </ProtectedSurface>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastRoot />
    </>
  );
}
