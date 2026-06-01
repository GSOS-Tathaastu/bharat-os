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
  useSubmitRoleExtras,
  type ProviderIdentity
} from '@/lib/hooks';
import { usePincodeLookup, isValidPincode } from '@/lib/use-pincode-lookup';
import { PhotoCapture } from '@/components/forms/PhotoCapture';
import { RoleExtrasStep } from '@/components/forms/RoleExtrasStep';
import { LinkDigilockerCard } from '@/components/forms/LinkDigilockerCard';
import {
  getRoleExtrasSchema,
  roleRequiresExtras,
  validateRoleExtrasClientSide
} from '@/lib/role-extras-schema';

type Step = 'identity' | 'selfie' | 'idProof' | 'address' | 'roleExtras' | 'review';

const STEP_ORDER_WITH_EXTRAS: Step[] = ['identity', 'selfie', 'idProof', 'address', 'roleExtras', 'review'];
const STEP_ORDER_NO_EXTRAS: Step[] = ['identity', 'selfie', 'idProof', 'address', 'review'];

interface FormState {
  fullLegalName: string;
  aadhaarLast4: string;
  panLast4: string;
  addressPinCode: string;
  addressLine: string;
  // Phase 12.2.3 — substrate-backed capture handles. Stored as
  // content-addressed attachmentId from POST /api/attachments.
  // The wizard uploads before moving past the step; the parent
  // submission references the IDs.
  selfieAttachmentId: string | null;
  idProofAttachmentId: string | null;
  // Phase 12.2.4 — per-role extras (only set when the role
  // requires them per role-extras-schema.ts).
  roleExtrasValues: Record<string, string>;
  roleExtrasAttachmentIds: Record<string, string>;
}

const EMPTY: FormState = {
  fullLegalName: '',
  aadhaarLast4: '',
  panLast4: '',
  addressPinCode: '',
  addressLine: '',
  selfieAttachmentId: null,
  idProofAttachmentId: null,
  roleExtrasValues: {},
  roleExtrasAttachmentIds: {}
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
    // Phase 12.2.4 — also pre-fill role-extras (refs + values).
    // Verification number values are redacted to "••••" on the
    // owner-list endpoint; we skip those (forcing the citizen to
    // re-type) for the same reason last-4 IDs aren't pre-filled.
    const rx = provider.roleExtrasSubmission;
    const rxValues: Record<string, string> = {};
    if (rx && rx.answers) {
      for (const [k, v] of Object.entries(rx.answers)) {
        if (typeof v === 'string' && v !== '••••') rxValues[k] = v;
        else if (typeof v === 'number') rxValues[k] = String(v);
      }
    }
    setForm({
      fullLegalName: s.fullLegalName,
      aadhaarLast4: /^[0-9]{4}$/.test(s.aadhaarLast4) ? s.aadhaarLast4 : '',
      panLast4: /^[A-Z0-9]{4}$/.test(s.panLast4) ? s.panLast4 : '',
      addressPinCode: s.addressPinCode,
      addressLine: /^••••/.test(s.addressLine) ? '' : s.addressLine,
      // Phase 12.2.3 — re-use any prior selfie / ID-proof
      // capture so a citizen who bounced halfway doesn't
      // re-take the photos. The citizen can still tap
      // "Replace" on each PhotoCapture to upload again.
      selfieAttachmentId: s.selfieAttachmentId || null,
      idProofAttachmentId: s.idProofAttachmentId || null,
      roleExtrasValues: rxValues,
      roleExtrasAttachmentIds: (rx && rx.attachments) ? { ...rx.attachments } : {}
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
  const roleExtrasMutation = useSubmitRoleExtras();

  // Phase 12.2.4 — wizard step order depends on whether the role
  // requires extras. Wave-2 roles (kirana, skilled-trades) skip
  // the extras step entirely so the 5-step flow stays clean.
  const STEP_ORDER = provider && roleRequiresExtras(provider.roleKind)
    ? STEP_ORDER_WITH_EXTRAS
    : STEP_ORDER_NO_EXTRAS;
  const extrasSchema = provider ? getRoleExtrasSchema(provider.roleKind) : null;

  // Phase 12.2.4 adversarial fix UX-3 — when the role changes
  // mid-session (citizen edited roleKind on the profile, or the
  // provider record refetched after a server change), the
  // current `step` may no longer exist in STEP_ORDER. Without
  // this snap the header shows "Step 0 of 5" and the wizard
  // dead-ends.
  useEffect(() => {
    if (!STEP_ORDER.includes(step)) {
      setStep('identity');
    }
  }, [STEP_ORDER, step]);

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function canAdvanceFromIdentity(): boolean {
    if (!form.fullLegalName.trim()) return false;
    if (!/^[0-9]{4}$/.test(form.aadhaarLast4)) return false;
    if (!/^[A-Z0-9]{4}$/.test(form.panLast4)) return false;
    return true;
  }
  function canAdvanceFromSelfie(): boolean {
    return /^bos:att:[0-9a-f]{32}$/.test(form.selfieAttachmentId || '');
  }
  function canAdvanceFromIdProof(): boolean {
    return /^bos:att:[0-9a-f]{32}$/.test(form.idProofAttachmentId || '');
  }
  function canAdvanceFromAddress(): boolean {
    if (!isValidPincode(form.addressPinCode)) return false;
    if (!form.addressLine.trim()) return false;
    if (!effectiveCity || !effectiveState) return false;
    return true;
  }
  function canAdvanceFromRoleExtras(): boolean {
    if (!extrasSchema) return true;
    const v = validateRoleExtrasClientSide(extrasSchema, form.roleExtrasValues);
    if (!v.ok) return false;
    return extrasSchema.requiredAttachments.every(
      (slot) => /^bos:att:[0-9a-f]{32}$/.test(form.roleExtrasAttachmentIds[slot.kind] || '')
    );
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
        stateFromPincode: effectiveState,
        selfieAttachmentId: form.selfieAttachmentId,
        idProofAttachmentId: form.idProofAttachmentId
      });
      // Phase 12.2.4 — when the role requires extras, submit them
      // in the same wizard finish so the operator review queue
      // sees both envelopes together.
      if (provider && extrasSchema && roleRequiresExtras(provider.roleKind)) {
        // Trim text values, leave non-string values alone.
        const cleanedAnswers: Record<string, string> = {};
        for (const [k, v] of Object.entries(form.roleExtrasValues)) {
          const trimmed = typeof v === 'string' ? v.trim() : v;
          if (trimmed !== '' && trimmed != null) cleanedAnswers[k] = trimmed;
        }
        await roleExtrasMutation.mutateAsync({
          rootIdentityId: identity.id,
          providerIdentityId: providerId,
          answers: cleanedAnswers,
          attachments: form.roleExtrasAttachmentIds
        });
      }
      show('Submitted. An operator will review and elevate your provider profile.', 'success');
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
        <Badge variant="pending">Step {STEP_ORDER.indexOf(step) + 1} of {STEP_ORDER.length}</Badge>
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

      {step === 'identity' && identity && (
        <div className="mb-3">
          <LinkDigilockerCard identityId={identity.id} />
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
            <Action onClick={() => setStep('selfie')} disabled={!canAdvanceFromIdentity()}>
              Next: take a selfie
            </Action>
          </div>
        </Card>
      )}

      {step === 'selfie' && identity && (
        <Card title="Take a selfie">
          <p className="text-body text-text-muted">
            A clear, well-lit photo of your face. The operator uses this to
            verify it's you in the ID proof.
          </p>
          <div className="mt-3">
            <PhotoCapture
              identityId={identity.id}
              kind="kyc_l1_selfie"
              captureMode="user"
              helper="Hold your phone at eye level. Look at the camera. No filters."
              existingAttachmentId={form.selfieAttachmentId}
              onUploaded={(meta) => setForm((p) => ({ ...p, selfieAttachmentId: meta.attachmentId }))}
            />
          </div>
          <div className="mt-4 flex justify-between">
            <Action variant="ghost" onClick={() => setStep('identity')}>
              Back
            </Action>
            <Action onClick={() => setStep('idProof')} disabled={!canAdvanceFromSelfie()}>
              Next: ID proof
            </Action>
          </div>
        </Card>
      )}

      {step === 'idProof' && identity && (
        <Card title="Photo of your ID">
          <p className="text-body text-text-muted">
            A clear photo of the front of your Aadhaar or PAN card. The
            substrate stores the last 4 of each separately; this photo is
            only for the operator to confirm the match.
          </p>
          <div className="mt-3">
            <PhotoCapture
              identityId={identity.id}
              kind="kyc_l1_id_proof"
              captureMode="environment"
              helper="Lay the card flat. Make sure all four corners are visible. No glare."
              existingAttachmentId={form.idProofAttachmentId}
              onUploaded={(meta) => setForm((p) => ({ ...p, idProofAttachmentId: meta.attachmentId }))}
            />
          </div>
          <div className="mt-4 flex justify-between">
            <Action variant="ghost" onClick={() => setStep('selfie')}>
              Back
            </Action>
            <Action onClick={() => setStep('address')} disabled={!canAdvanceFromIdProof()}>
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
            <Action variant="ghost" onClick={() => setStep('idProof')}>
              Back
            </Action>
            <Action
              onClick={() => setStep(extrasSchema ? 'roleExtras' : 'review')}
              disabled={!canAdvanceFromAddress()}
            >
              {extrasSchema ? 'Next: role docs' : 'Review'}
            </Action>
          </div>
        </Card>
      )}

      {step === 'roleExtras' && provider && extrasSchema && identity && (
        <>
          <RoleExtrasStep
            role={provider.roleKind}
            identityId={identity.id}
            schema={extrasSchema}
            values={form.roleExtrasValues}
            attachmentIds={form.roleExtrasAttachmentIds}
            onValueChange={(id, next) =>
              setForm((p) => ({ ...p, roleExtrasValues: { ...p.roleExtrasValues, [id]: next } }))
            }
            onAttachmentUploaded={(kind, meta) =>
              setForm((p) => ({
                ...p,
                roleExtrasAttachmentIds: { ...p.roleExtrasAttachmentIds, [kind]: meta.attachmentId }
              }))
            }
          />
          <div className="mt-4 flex justify-between">
            <Action variant="ghost" onClick={() => setStep('address')}>
              Back
            </Action>
            <Action onClick={() => setStep('review')} disabled={!canAdvanceFromRoleExtras()}>
              Review
            </Action>
          </div>
        </>
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
            <dt className="text-caption text-text-muted">Selfie</dt>
            <dd className="text-body text-text">
              {form.selfieAttachmentId ? <Badge variant="trust">Captured</Badge> : <span className="text-text-muted">Not captured</span>}
            </dd>
            <dt className="text-caption text-text-muted">ID proof photo</dt>
            <dd className="text-body text-text">
              {form.idProofAttachmentId ? <Badge variant="trust">Captured</Badge> : <span className="text-text-muted">Not captured</span>}
            </dd>
            {extrasSchema && (
              <>
                {/* Phase 12.2.4 fix UX-6 — echo every typed
                    answer so the citizen can verify before
                    submitting. Optional fields are shown only
                    when filled. */}
                {[...extrasSchema.required, ...extrasSchema.optional].map((spec) => {
                  const raw = form.roleExtrasValues[spec.id];
                  if (raw == null || raw === '') return null;
                  return (
                    <>
                      <dt key={spec.id + '-dt'} className="text-caption text-text-muted">{spec.label}</dt>
                      <dd key={spec.id + '-dd'} className="text-body text-text">{raw}</dd>
                    </>
                  );
                })}
                <dt className="text-caption text-text-muted">Role-specific docs</dt>
                <dd className="text-body text-text">
                  {extrasSchema.requiredAttachments.every(
                    (slot) => /^bos:att:[0-9a-f]{32}$/.test(form.roleExtrasAttachmentIds[slot.kind] || '')
                  )
                    ? <Badge variant="trust">All captured ({extrasSchema.requiredAttachments.length})</Badge>
                    : <span className="text-text-muted">Missing some</span>}
                </dd>
              </>
            )}
          </dl>
          <p className="mt-4 text-caption text-text-muted">
            By submitting, you confirm these details match a government ID you can show
            an operator on request. Bharat OS only stores the last 4 digits.
          </p>
          <div className="mt-4 flex justify-between">
            <Action variant="ghost" onClick={() => setStep(extrasSchema ? 'roleExtras' : 'address')}>
              Back
            </Action>
            <Action onClick={handleSubmit} disabled={submitMutation.isPending || roleExtrasMutation.isPending}>
              {(submitMutation.isPending || roleExtrasMutation.isPending) ? 'Submitting…' : 'Submit for review'}
            </Action>
          </div>
        </Card>
      )}
    </main>
  );
}
