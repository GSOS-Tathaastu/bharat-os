import { Routes, Route, Navigate } from 'react-router-dom';
import { useIdentityStore } from '@/lib/identity-store';
import { useActiveIdentity } from '@/lib/hooks';
import { useQueueDrainer } from '@/lib/use-queue-drainer';
import { ToastRoot, useToast } from '@/components/ui';
import { OnboardingPage } from '@/routes/Onboarding';
import { WorkerHome } from '@/routes/WorkerHome';
import { CitizenHome } from '@/routes/CitizenHome';
import { CitizenServices } from '@/routes/CitizenServices';
import { ProviderSurface } from '@/routes/provider/ProviderSurface';
import { VerifyPage } from '@/routes/Verify';
import { LabsPage } from '@/routes/Labs';
import { LabelsPage } from '@/routes/Labels';
import { ProviderOnboardingPage } from '@/routes/ProviderOnboarding';
import { KycLevel1Page } from '@/routes/onboarding/KycLevel1Page';
import { SettingsPage } from '@/routes/Settings';
import { SponsorSurface } from '@/routes/sponsor/SponsorSurface';
import { TopBar } from '@/components/TopBar';

// Phase 12.1b.2 — Mount the offline-queue drainer once at the
// session level. Drainer is a no-op when there's no active
// identity OR when offline; it auto-fires on offline→online
// transitions and on first mount.
function GlobalQueueDrainer() {
  const identity = useActiveIdentity();
  const show = useToast((s) => s.show);
  useQueueDrainer(identity?.id ?? null, {
    onDrainSuccess: (n: number) =>
      show(`Sent ${n} queued intent${n === 1 ? '' : 's'}. Check your activity feed.`, 'success')
  });
  return null;
}

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
      <GlobalQueueDrainer />
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
        {/* Phase 12.1a.1 — citizen marketplace browse. Must come
            BEFORE /citizen/* so the more-specific path wins. */}
        <Route
          path="/citizen/services/*"
          element={
            <ProtectedSurface>
              <CitizenServices />
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
        {/* /verify is public — MFI staff don't have a Bharat OS persona */}
        <Route path="/verify" element={<VerifyPage />} />
        <Route
          path="/labs"
          element={
            <ProtectedSurface>
              <LabsPage />
            </ProtectedSurface>
          }
        />
        <Route
          path="/labels"
          element={
            <ProtectedSurface>
              <LabelsPage />
            </ProtectedSurface>
          }
        />
        <Route
          path="/earn/provider-onboarding"
          element={
            <ProtectedSurface>
              <ProviderOnboardingPage />
            </ProtectedSurface>
          }
        />
        {/* Phase 12.2.2 — KYC Level 1 wizard (citizen-driven submission
            consumed by the operator review queue). Standalone route so
            future personas (labelers, citizen data-revenue) can reuse it. */}
        <Route
          path="/onboarding/kyc-level-1"
          element={
            <ProtectedSurface>
              <KycLevel1Page />
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
        {/* Phase 12.1a.2 — provider surface; auth via root identity + provider-context-store */}
        <Route
          path="/provider/*"
          element={
            <ProtectedSurface>
              <ProviderSurface />
            </ProtectedSurface>
          }
        />
        {/* Phase 12.0.5 — sponsor console; auth lives inside SponsorSurface */}
        <Route path="/sponsor/*" element={<SponsorSurface />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastRoot />
    </>
  );
}
