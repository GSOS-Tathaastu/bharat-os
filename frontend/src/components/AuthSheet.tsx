import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Action, Card, Field, Sheet, useToast } from '@/components/ui';
import { useIdentityStore, type PersonaKind } from '@/lib/identity-store';
import {
  useSignInStart,
  useSignInVerify,
  useSignUpStart,
  useSignUpVerify,
  type OtpSendResponse,
  type RecoveryStartResponse
} from '@/lib/hooks';

// Phase 12.0.1 — generic auth sheet (sign-up + sign-in via phone
// OTP). Launched from the Onboarding hero "Use your account →"
// link. The existing demo persona picker remains the primary
// path for investor demos because seeded personas have full
// state pre-loaded; this sheet is the "I want to use Bharat OS
// for real" route.
//
// Flow:
//   sign-up: phone + display name + role → POST /api/identities,
//            then POST /api/phone-otp/send → enter OTP → POST
//            /api/phone-otp/verify → set active identity →
//            navigate to /worker or /citizen
//   sign-in: phone → POST /api/recovery/start → enter OTP →
//            POST /api/recovery/verify → set active identity →
//            navigate to /worker or /citizen
//
// Dev OTP reveal: when the BE's SMS provider is `log` (the dev
// default), `_devOtpCode` is included in the OTP-send response.
// We show it inline as "DEMO MODE — your code is XXXXXX" so
// the founder + investors aren't reading the server console.

interface AuthSheetProps {
  open: boolean;
  onClose: () => void;
  /** Defaults to 'sign-up' on first open. */
  initialMode?: 'sign-up' | 'sign-in';
}

type Step = 'phone' | 'otp' | 'done';

export function AuthSheet({ open, onClose, initialMode = 'sign-up' }: AuthSheetProps) {
  const navigate = useNavigate();
  const setActive = useIdentityStore((s) => s.setActive);
  const show = useToast((s) => s.show);
  const [mode, setMode] = useState<'sign-up' | 'sign-in'>(initialMode);
  const [step, setStep] = useState<Step>('phone');

  // Sign-up form
  const [displayName, setDisplayName] = useState('');
  const [signUpRole, setSignUpRole] = useState<PersonaKind>('citizen');

  // Shared phone + OTP
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  // After OTP send, we hold the otpId + identity (sign-up) so
  // verify knows what to call.
  const [pendingOtpId, setPendingOtpId] = useState<string | null>(null);
  const [pendingIdentityId, setPendingIdentityId] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const signUpStart = useSignUpStart();
  const signUpVerify = useSignUpVerify();
  const signInStart = useSignInStart();
  const signInVerify = useSignInVerify();

  // Reset state every time the sheet opens.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setStep('phone');
      setDisplayName('');
      setSignUpRole('citizen');
      setPhone('');
      setCode('');
      setPendingOtpId(null);
      setPendingIdentityId(null);
      setPhoneMasked(null);
      setDevCode(null);
    }
  }, [open, initialMode]);

  function rememberOtp(res: OtpSendResponse | RecoveryStartResponse) {
    setPendingOtpId(res.otpId);
    setPhoneMasked(res.phoneMasked);
    setDevCode(res._devOtpCode ?? null);
    setStep('otp');
  }

  function handleSignUpStart() {
    if (!displayName.trim() || !phone.trim()) {
      show('Display name and phone are both required.', 'error');
      return;
    }
    signUpStart.mutate(
      { displayName: displayName.trim(), phone: phone.trim() },
      {
        onSuccess: ({ identity, otp }) => {
          setPendingIdentityId(identity.id);
          rememberOtp(otp);
        },
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  function handleSignInStart() {
    if (!phone.trim()) {
      show('Phone is required.', 'error');
      return;
    }
    signInStart.mutate(
      { phone: phone.trim() },
      {
        onSuccess: (res) => rememberOtp(res),
        onError: (err: Error) => show(err.message, 'error')
      }
    );
  }

  function handleVerify() {
    if (!pendingOtpId || !code.trim()) {
      show('Enter the 6-digit code.', 'error');
      return;
    }
    if (mode === 'sign-up') {
      signUpVerify.mutate(
        { otpId: pendingOtpId, code: code.trim() },
        {
          onSuccess: (res) => {
            if (res.status !== 'verified' || !pendingIdentityId) {
              show('Code did not verify. Try again.', 'error');
              return;
            }
            setActive(pendingIdentityId);
            show('Welcome to Bharat OS.', 'success');
            navigate(signUpRole === 'worker' ? '/worker' : '/citizen');
            onClose();
          },
          onError: (err: Error) => show(err.message, 'error')
        }
      );
    } else {
      signInVerify.mutate(
        { otpId: pendingOtpId, code: code.trim() },
        {
          onSuccess: (res) => {
            if (!res.recoveryBundle?.identity?.id) {
              show('Code did not verify. Try again.', 'error');
              return;
            }
            setActive(res.recoveryBundle.identity.id);
            show(`Welcome back, ${res.recoveryBundle.identity.displayName.split(' ')[0]}.`, 'success');
            // Sign-in doesn't know which surface (worker/citizen);
            // default to citizen — the worker tab is reachable
            // anyway from the home tabs if they identify as one.
            navigate('/citizen');
            onClose();
          },
          onError: (err: Error) => show(err.message, 'error')
        }
      );
    }
  }

  const busy =
    signUpStart.isPending ||
    signUpVerify.isPending ||
    signInStart.isPending ||
    signInVerify.isPending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === 'sign-up' ? 'Create your Bharat OS account' : 'Sign in with your phone'}
    >
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode('sign-up');
            setStep('phone');
          }}
          className={
            'flex-1 rounded-sm border-2 px-3 py-2 text-caption font-semibold transition-colors ' +
            (mode === 'sign-up'
              ? 'border-primary bg-primary-50 text-primary'
              : 'border-border bg-white text-text-muted hover:border-primary')
          }
        >
          Sign up
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('sign-in');
            setStep('phone');
          }}
          className={
            'flex-1 rounded-sm border-2 px-3 py-2 text-caption font-semibold transition-colors ' +
            (mode === 'sign-in'
              ? 'border-trust bg-trust-50 text-trust-700'
              : 'border-border bg-white text-text-muted hover:border-trust')
          }
        >
          Sign in
        </button>
      </div>

      {step === 'phone' && mode === 'sign-up' && (
        <div className="space-y-3">
          <Field
            label="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="What should we call you?"
            autoComplete="name"
          />
          <Field
            label="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210 (or 10-digit)"
            autoComplete="tel"
            type="tel"
            inputMode="tel"
          />
          <div>
            <p className="mb-1 text-caption font-semibold text-text">I want to use Bharat OS to…</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSignUpRole('worker')}
                className={
                  'flex-1 rounded-sm border-2 p-2 text-left text-caption transition-colors ' +
                  (signUpRole === 'worker'
                    ? 'border-primary bg-primary-50 text-primary'
                    : 'border-border bg-white hover:border-primary')
                }
              >
                <span className="font-semibold">Earn</span> — label data, drive, cook, run a shop
              </button>
              <button
                type="button"
                onClick={() => setSignUpRole('citizen')}
                className={
                  'flex-1 rounded-sm border-2 p-2 text-left text-caption transition-colors ' +
                  (signUpRole === 'citizen'
                    ? 'border-trust bg-trust-50 text-trust-700'
                    : 'border-border bg-white hover:border-trust')
                }
              >
                <span className="font-semibold">Use</span> — book a cab, apply for a loan, schemes
              </button>
            </div>
          </div>
          <Action onClick={handleSignUpStart} disabled={busy}>
            {busy ? 'Creating account…' : 'Send me a code'}
          </Action>
        </div>
      )}

      {step === 'phone' && mode === 'sign-in' && (
        <div className="space-y-3">
          <p className="text-body text-text-muted">
            Enter the phone number you signed up with. We will send a 6-digit code.
          </p>
          <Field
            label="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210 (or 10-digit)"
            autoComplete="tel"
            type="tel"
            inputMode="tel"
          />
          <Action onClick={handleSignInStart} disabled={busy}>
            {busy ? 'Looking you up…' : 'Send me a code'}
          </Action>
        </div>
      )}

      {step === 'otp' && (
        <div className="space-y-3">
          <p className="text-body">
            Code sent to <span className="font-mono">{phoneMasked}</span>.
          </p>
          {devCode && (
            <Card tone="warning">
              <p className="text-caption font-semibold uppercase tracking-wide text-orange-700">
                Demo mode — dev SMS provider
              </p>
              <p className="mt-1 text-body">
                Your code is <span className="font-mono text-display">{devCode}</span>
              </p>
              <p className="mt-1 text-caption text-text-muted">
                This is only shown because the server is using the <code>log</code> SMS provider.
                Production SMS providers (Gupshup / Twilio / MSG91) will never carry this field.
              </p>
            </Card>
          )}
          <Field
            label="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
          />
          <div className="flex gap-2">
            <Action onClick={handleVerify} disabled={busy}>
              {busy ? 'Verifying…' : mode === 'sign-up' ? 'Verify + create' : 'Verify + sign in'}
            </Action>
            <Action variant="ghost" onClick={() => setStep('phone')} disabled={busy}>
              ← Change phone
            </Action>
          </div>
        </div>
      )}
    </Sheet>
  );
}
