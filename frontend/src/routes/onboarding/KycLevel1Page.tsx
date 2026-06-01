// Phase 12.2.2 — KYC Level 1 wizard page.
//
// Multi-step citizen-driven KYC submission. Launched from
// the post-onboarding redirect OR from the provider profile
// "Complete KYC L1" CTA when a citizen resumed without
// finishing.
//
// Steps:
//   1. Identity     — full legal name + Aadhaar last-4 + PAN last-4
//   2. Address      — PIN code → auto-resolve city/state via the
//                     India Post adapter, then citizen confirms +
//                     fills the address line
//   3. Review       — show everything + submit
//
// §15 bindings honored at the UI:
//   - Aadhaar input is `inputMode=numeric maxLength=4` + a
//     visible hint "Only the LAST 4 digits". The BE
//     validator still defensively rejects a 12-digit input.
//   - PAN input uppercases on change + maxLength=4 + similar
//     hint.
//   - The wizard never persists drafts to localStorage
//     (would leak last-4 IDs to the device on logout). All
//     state is React component state only.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Action, Badge, Card, Field, useToast } from '@/components/ui';
import {
  useActiveIdentity,
  useProviderIdentities,
  useSubmitKycLevel1,
  type ProviderIdentity
} from '@/lib/hooks';
import { usePincodeLookup, isValidPincode } from '@/lib/use-pincode-lookup';

type Step = 'identity' | 'address' | 'review';

interface FormState {
  fullLegalName: string;
  aadhaarLast4: string;
  panLast4: string;
  addressPinCode: string;
  addressLine: string;
}

const EMPTY: FormState = {
  fullLegalName: '',
  aadhaarLast4: '',
  panLast4: '',
  addressPinCode: '',
  addressLine: ''
};

function trimToMax(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

// §15 — when a citizen pastes a number longer than 4 characters
// (almost certainly the full 12-digit Aadhaar or 10-char PAN),
// keep the TRAILING 4 not the leading 4. Pairs with a warning
// toast so the citizen knows we trimmed.
function keepLast4Digits(raw: string): { value: string; trimmedFullId: boolean } {
  const onlyDigits = raw.replace(/[^0-9]/g, '');
  const trimmedFullId = onlyDigits.length > 4;
  return { value: onlyDigits.slice(-4), trimmedFullId };
}

function keepLast4PanChars(raw: string): { value: string; trimmedFullId: boolean } {
  const upperAlnum = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const trimmedFullId = upperAlnum.length > 4;
  return { value: upperAlnum.slice(-4), trimmedFullId };
}

export function KycLevel1Page() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const providerId = params.get('providerId');
  const returnTo = params.get('returnTo') || '/provider';
  const identity = useActiveIdentity();
  const show = useToast((s) => s.show);

  const providersQuery = useProviderIdentities(identity?.id ?? null);
  const provider: ProviderIdentity | null = useMemo(() => {
    if (!providerId || !providersQuery.data) return null;
    return providersQuery.data.find((p) => p.providerIdentityId === providerId) ?? null;
  }, [providerId, providersQuery.data]);

  const [step, setStep] = useState<Step>('identity');
  const [form, setForm] = useState<FormState>(EMPTY);
  // Phase 12.2.2 fix L2-2 — pre-fill ONCE per mount. Without
  // this guard, a background TanStack refetch could overwrite
  // the user's in-progress edits when the server returns a
  // fresh provider object.
  //
  // Also fix OWNER-LIST-UNAUTHENTICATED — the owner-list
  // projection now returns "••••" for last-4 + redacted
  // addressLine. We MUST NOT pre-fill those placeholder values
  // into the input — the citizen would submit "••••" and the
  // BE would reject. So skip them on hydrate and force the
  // citizen to re-enter on edit (intentional; last-4 IDs
  // shouldn't survive a session boundary).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!provider?.kycLevel1Submission) return;
    const s = provider.kycLevel1Submission;
    setForm({
      fullLegalName: s.fullLegalName,
      aadhaarLast4: /^[0-9]{4}$/.test(s.aadhaarLast4) ? s.aadhaarLast4 : '',
      panLast4: /^[A-Z0-9]{4}$/.test(s.panLast4) ? s.panLast4 : '',
      addressPinCode: s.addressPinCode,
      addressLine: /^••••/.test(s.addressLine) ? '' : s.addressLine
    });
    hydratedRef.current = true;
  }, [provider?.kycLevel1Submission]);

  const pincodeQuery = usePincodeLookup(form.addressPinCode, {
    enabled: step !== 'identity' && isValidPincode(form.addressPinCode)
  });
  const resolved = pincodeQuery.data?.place;
  // Phase 12.2.2 fix stub-pin-pune-for-all — the stub adapter
  // returns the Pune fixture for EVERY PIN. A Mumbai citizen
  // entering 400069 would see "Pune, Maharashtra" with a quiet
  // greyed badge. Treat stub mode as "lookup not available" and
  // force the citizen to type city/state by hand.
  const inStubMode = pincodeQuery.data?.mode === 'stub';
  const [manualCity, setManualCity] = useState('');
  const [manualState, setManualState] = useState('');
  const effectiveCity = inStubMode ? manualCity.trim() : (resolved?.city ?? '');
  const effectiveState = inStubMode ? manualState.trim() : (resolved?.state ?? '');

  // Distinguish a "fresh submission, awaiting operator review"
  // from a "rejected — operator bounced you back to draft."
  // A rejection on the substrate today is modeled as a
  // submitted→draft transition; we detect it via lastTransition.
  const wasRejected = useMemo(() => {
    const t = provider?.lastTransition;
    return Boolean(t && t.from === 'submitted' && t.to === 'draft');
  }, [provider]);

  const submitMutation = useSubmitKycLevel1();

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function canAdvanceFromIdentity(): boolean {
    if (!form.fullLegalName.trim()) return false;
    if (!/^[0-9]{4}$/.test(form.aadhaarLast4)) return false;
    if (!/^[A-Z0-9]{4}$/.test(form.panLast4)) return false;
    return true;
  }
  function canAdvanceFromAddress(): boolean {
    if (!isValidPincode(form.addressPinCode)) return false;
    if (!form.addressLine.trim()) return false;
    if (!effectiveCity || !effectiveState) return false;
    return true;
  }

  async function handleSubmit() {
    if (!identity?.id || !providerId || !effectiveCity || !effectiveState) return;
    try {
      await submitMutation.mutateAsync({
        rootIdentityId: identity.id,
        providerIdentityId: providerId,
        fullLegalName: form.fullLegalName.trim(),
        aadhaarLast4: form.aadhaarLast4,
        panLast4: form.panLast4,
        addressPinCode: form.addressPinCode,
        addressLine: form.addressLine.trim(),
        cityFromPincode: effectiveCity,
        stateFromPincode: effectiveState
      });
      show('KYC submitted. An operator will review and elevate your provider profile.', 'success');
      navigate(returnTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submission failed.';
      show(msg, 'error');
    }
  }

  if (!identity) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <p className="text-body text-text-muted">Loading…</p>
      </main>
    );
  }
  if (!providerId) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Card title="Missing provider">
          <p className="text-body text-text">No provider identifier in the URL.</p>
          <Action onClick={() => navigate('/provider')}>Back to provider home</Action>
        </Card>
      </main>
    );
  }
  if (providersQuery.isPending) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <p className="text-body text-text-muted">Loading your provider profile…</p>
      </main>
    );
  }
  if (!provider) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Card title="Provider not found">
          <p className="text-body text-text">That provider identifier isn't yours.</p>
          <Action onClick={() => navigate('/provider')}>Back to provider home</Action>
        </Card>
      </main>
    );
  }
  if (provider.status !== 'draft') {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Card title="KYC already submitted">
          <p className="text-body text-text">
            Your provider profile is already <strong>{provider.status}</strong>.
            KYC Level 1 only runs while the profile is a draft.
          </p>
          <Action onClick={() => navigate(returnTo)}>Back</Action>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-4 flex items-center gap-3">
        <h1 className="text-h2 font-semibold text-text">KYC Level 1</h1>
        <Badge variant="pending">Step {step === 'identity' ? 1 : step === 'address' ? 2 : 3} of 3</Badge>
      </header>
      <p className="mb-4 text-body text-text-muted">
        A short, citizen-controlled identity + address record so an operator can verify
        your provider profile. Only the <strong>last 4 digits</strong> of your Aadhaar
        and PAN — never the full number.
      </p>
      {wasRejected && (
        <div className="mb-4 rounded-md border border-warning/30 bg-warning/10 p-3">
          <p className="text-body text-text">
            <strong>An operator sent this submission back for changes.</strong>{' '}
            Please review the fields, make any corrections, and resubmit.
            {provider?.lastTransition?.reason ? (
              <>
                {' '}Reason: <em>&ldquo;{provider.lastTransition.reason}&rdquo;</em>
              </>
            ) : null}
          </p>
        </div>
      )}

      {step === 'identity' && (
        <Card title="Identity">
          <Field
            label="Full legal name (as on your Aadhaar)"
            placeholder="Aarav Kumar"
            value={form.fullLegalName}
            onChange={(e) => setField('fullLegalName', trimToMax(e.target.value, 120))}
            maxLength={120}
            autoComplete="name"
          />
          <Field
            label="Last 4 digits of your Aadhaar"
            helper="Never enter the full 12-digit Aadhaar."
            inputMode="numeric"
            placeholder="••••"
            value={form.aadhaarLast4}
            onChange={(e) => {
              const { value, trimmedFullId } = keepLast4Digits(e.target.value);
              setField('aadhaarLast4', value);
              if (trimmedFullId) {
                show('We detected a full Aadhaar — only the last 4 digits were kept.', 'error');
              }
            }}
            maxLength={4}
            containerClassName="mt-3"
          />
          <Field
            label="Last 4 of your PAN"
            helper="Last 4 characters only — e.g. for AAAPL1234C enter 234C."
            placeholder="••••"
            value={form.panLast4}
            onChange={(e) => {
              const { value, trimmedFullId } = keepLast4PanChars(e.target.value);
              setField('panLast4', value);
              if (trimmedFullId) {
                show('We detected a full PAN — only the last 4 characters were kept.', 'error');
              }
            }}
            maxLength={4}
            containerClassName="mt-3"
          />
          <div className="mt-4 flex justify-end">
            <Action onClick={() => setStep('address')} disabled={!canAdvanceFromIdentity()}>
              Next: address
            </Action>
          </div>
        </Card>
      )}

      {step === 'address' && (
        <Card title="Address">
          <Field
            label="PIN code"
            helper="6 digits. We'll auto-fill your city + state when the lookup is live."
            inputMode="numeric"
            placeholder="411005"
            value={form.addressPinCode}
            onChange={(e) => setField('addressPinCode', e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            maxLength={6}
          />
          {isValidPincode(form.addressPinCode) && (
            <div className="mt-2">
              {pincodeQuery.isPending ? (
                <p className="text-caption text-text-muted">Looking up city / state…</p>
              ) : pincodeQuery.isError ? (
                <p className="text-caption text-error">
                  Couldn't resolve that PIN code. Check the digits and try again.
                </p>
              ) : inStubMode ? (
                <div className="rounded-md border border-warning/30 bg-warning/10 p-2">
                  <p className="text-caption text-text">
                    PIN lookup isn't connected in this build — please type the city
                    and state yourself.
                  </p>
                </div>
              ) : resolved?.city && resolved?.state ? (
                <p className="text-caption text-text">
                  <Badge variant="trust">Resolved</Badge>{' '}
                  {resolved.city}, {resolved.state}
                </p>
              ) : (
                <p className="text-caption text-error">
                  PIN found but no city / state on record. Pick a different PIN.
                </p>
              )}
            </div>
          )}
          {inStubMode && (
            <>
              <Field
                label="City"
                placeholder="Pune"
                value={manualCity}
                onChange={(e) => setManualCity(trimToMax(e.target.value, 120))}
                maxLength={120}
                containerClassName="mt-3"
              />
              <Field
                label="State"
                placeholder="Maharashtra"
                value={manualState}
                onChange={(e) => setManualState(trimToMax(e.target.value, 120))}
                maxLength={120}
                containerClassName="mt-3"
              />
            </>
          )}
          <Field
            label="Address line"
            helper="Door + street + locality. Citizens won't see this."
            placeholder="14, Modibaug, Ganeshkhind Road"
            value={form.addressLine}
            onChange={(e) => setField('addressLine', trimToMax(e.target.value, 240))}
            maxLength={240}
            containerClassName="mt-3"
          />
          <div className="mt-4 flex justify-between">
            <Action variant="ghost" onClick={() => setStep('identity')}>
              Back
            </Action>
            <Action onClick={() => setStep('review')} disabled={!canAdvanceFromAddress()}>
              Review
            </Action>
          </div>
        </Card>
      )}

      {step === 'review' && effectiveCity && effectiveState && (
        <Card title="Review and submit">
          <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2">
            <dt className="text-caption text-text-muted">Legal name</dt>
            <dd className="text-body text-text">{form.fullLegalName}</dd>
            <dt className="text-caption text-text-muted">Aadhaar last 4</dt>
            <dd className="text-body text-text">••••{form.aadhaarLast4}</dd>
            <dt className="text-caption text-text-muted">PAN last 4</dt>
            <dd className="text-body text-text">••••••{form.panLast4}</dd>
            <dt className="text-caption text-text-muted">PIN code</dt>
            <dd className="text-body text-text">{form.addressPinCode}</dd>
            <dt className="text-caption text-text-muted">City</dt>
            <dd className="text-body text-text">{effectiveCity}</dd>
            <dt className="text-caption text-text-muted">State</dt>
            <dd className="text-body text-text">{effectiveState}</dd>
            <dt className="text-caption text-text-muted">Address</dt>
            <dd className="text-body text-text">{form.addressLine}</dd>
          </dl>
          <p className="mt-4 text-caption text-text-muted">
            By submitting, you confirm these details match a government ID you can show
            an operator on request. Bharat OS only stores the last 4 digits.
          </p>
          <div className="mt-4 flex justify-between">
            <Action variant="ghost" onClick={() => setStep('address')}>
              Back
            </Action>
            <Action onClick={handleSubmit} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? 'Submitting…' : 'Submit for review'}
            </Action>
          </div>
        </Card>
      )}
    </main>
  );
}
