// Phase 12.2.3 — PhotoCapture.
//
// File-input primary path (proven on the shell), with the
// captured file shown as a preview and an explicit "Use this"
// confirm before upload. Camera-stream secondary path
// (getUserMedia + canvas downsample) ships in a follow-up
// phase — file input handles iOS Safari + most Android browsers
// directly via `capture=environment`.
//
// Props:
//   identityId — root identity owning the upload.
//   kind       — attachment kind enforced by the substrate.
//   captureMode — 'environment' (rear cam, default) or 'user'
//                 (front cam, for selfies on mobile that honor
//                 the hint).
//   helper     — short caption shown under the upload button.
//   onUploaded — callback after the substrate returns meta.
//   existingAttachmentId — when present, shows a "replace" UX
//     instead of "upload"; the existing blob's thumbnail is
//     loaded via GET /api/attachments/:id.
//
// §15 bindings honored at the UI:
//   - The substrate computes sha256 from BYTES, not from any
//     EXIF / filename — a citizen renaming the file doesn't
//     change identity.
//   - We do NOT preserve the captured bytes in React state past
//     the upload (the preview URL is `URL.createObjectURL` and
//     gets revoked on uploaded / replace).
//   - The component never persists the upload to localStorage.

import { useEffect, useRef, useState } from 'react';
import { Action, Badge } from '@/components/ui';
import {
  useAttachmentUpload,
  type AttachmentKind,
  type AttachmentMeta
} from '@/lib/use-attachment-upload';

interface Props {
  identityId: string;
  kind: AttachmentKind;
  captureMode?: 'environment' | 'user';
  // Phase 12.2.4 — 'image+pdf' for document scans (vehicle RC,
  // police clearance, employer reference letter). When 'image+pdf'
  // is selected the `capture` attribute is dropped from the
  // <input> so the file picker opens instead of forcing the
  // camera (iOS Safari blocks file-picker when capture is set).
  acceptMode?: 'image' | 'image+pdf';
  helper?: string;
  existingAttachmentId?: string | null;
  onUploaded: (meta: AttachmentMeta) => void;
}

export function PhotoCapture({
  identityId,
  kind,
  captureMode = 'environment',
  acceptMode = 'image',
  helper,
  existingAttachmentId,
  onUploaded
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Phase 12.2.4 fix UX-2 — file.type can lie (Android often
  // hands back 'application/octet-stream' for sideloaded PDFs).
  // We sniff the first 4 magic bytes to decide whether to
  // render a doc card vs <img>. Trusting only the OS MIME would
  // break the PDF preview on common mobile browsers.
  const [pendingIsPdf, setPendingIsPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 12.2.3 fix UX-1 — when the wizard re-mounts with an
  // existingAttachmentId, fetch the blob via owner-auth and
  // render it as the "Captured" thumbnail. The component
  // previously showed a static "Photo on file" badge with no
  // way for the citizen to verify it was the right photo.
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  // Phase 12.2.4 — when the existing blob is a PDF, render a
  // doc-card instead of attempting <img src>.
  const [existingIsPdf, setExistingIsPdf] = useState(false);
  const upload = useAttachmentUpload();

  // Revoke any object URL the component owns before unmount or
  // when the citizen picks a different file. Object URLs are
  // page-lifetime by default — they survive without revoke and
  // leak the bytes into the page memory map.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Phase 12.2.3 fix UX-1 — fetch the existing blob with the
  // owner header, blob-URL it, and revoke on unmount or when
  // the citizen replaces it. Aborts on unmount via AbortController
  // so a slow network during navigation doesn't double-trigger.
  useEffect(() => {
    if (!existingAttachmentId || pendingFile) {
      if (existingUrl) {
        URL.revokeObjectURL(existingUrl);
        setExistingUrl(null);
      }
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const r = await fetch(
          `/api/attachments/${encodeURIComponent(existingAttachmentId)}`,
          {
            headers: { 'X-Bharat-OS-Acting-Identity': identityId },
            signal: controller.signal
          }
        );
        if (!r.ok) return;
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        setExistingUrl(url);
        setExistingIsPdf(blob.type === 'application/pdf');
      } catch {
        // Aborted on unmount or network blip — surface nothing;
        // the "Captured" pill still tells the citizen something
        // is on file, and Replace is the recovery path.
      }
    })();
    return () => {
      controller.abort();
    };
  }, [existingAttachmentId, pendingFile, identityId]);

  useEffect(() => {
    return () => {
      if (existingUrl) URL.revokeObjectURL(existingUrl);
    };
  }, [existingUrl]);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPendingFile(file);
    // Phase 12.2.4 fix UX-2 — sniff magic bytes for PDF.
    // file.type === 'application/pdf' is correct on iOS Safari
    // and most Chrome flows, but Android often hands back
    // 'application/octet-stream' for sideloaded PDFs. Reading
    // the first 4 bytes lets the preview render the right card.
    try {
      const head = await file.slice(0, 4).arrayBuffer();
      const view = new Uint8Array(head);
      const isPdfMagic = view[0] === 0x25 && view[1] === 0x50 && view[2] === 0x44 && view[3] === 0x46;
      setPendingIsPdf(isPdfMagic || file.type === 'application/pdf');
    } catch {
      setPendingIsPdf(file.type === 'application/pdf');
    }
  }

  async function handleConfirm() {
    if (!pendingFile) return;
    setError(null);
    try {
      const meta = await upload.mutateAsync({
        actingRootIdentityId: identityId,
        file: pendingFile,
        kind
      });
      onUploaded(meta);
      // Drop the pending file once the upload landed — the meta
      // is now the source of truth on the parent form.
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPendingFile(null);
      setPendingIsPdf(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'upload failed.';
      setError(msg);
    }
  }

  function handleDiscard() {
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    setPendingIsPdf(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  const hasExisting = Boolean(existingAttachmentId) && !pendingFile;

  return (
    <div className="flex flex-col gap-2">
      {hasExisting ? (
        <div className="rounded-md border border-trust-100 bg-trust-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-body text-text">
              <Badge variant="trust">Captured</Badge>{' '}
              <span className="ml-1 text-caption text-text-muted">
                {existingUrl ? 'Photo on file.' : 'Loading…'}
              </span>
            </span>
            <Action
              variant="ghost"
              size="sm"
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              Replace
            </Action>
          </div>
          {existingUrl && (
            existingIsPdf ? (
              <a
                href={existingUrl}
                target="_blank"
                rel="noopener"
                className="mt-3 block rounded-md border border-border bg-surface p-3 text-body text-text hover:bg-trust-50"
              >
                📄 Open PDF document
              </a>
            ) : (
              <img
                src={existingUrl}
                alt="Captured"
                className="mt-3 max-h-48 rounded-md border border-border object-contain"
              />
            )
          )}
        </div>
      ) : null}

      {!hasExisting && !pendingFile && (
        <Action
          onClick={() => fileRef.current?.click()}
          type="button"
          variant="secondary"
        >
          {captureMode === 'user' ? 'Take a selfie' : 'Take a photo'}
        </Action>
      )}

      {pendingFile && previewUrl && (
        <>
          {pendingIsPdf ? (
            <div className="rounded-md border border-border bg-surface p-4">
              <p className="text-body text-text">
                📄 <strong>{pendingFile.name || 'PDF document'}</strong>
              </p>
              <p className="mt-1 text-caption text-text-muted">
                {(pendingFile.size / 1024).toFixed(1)} KB · ready to upload
              </p>
            </div>
          ) : (
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-64 rounded-md border border-border object-contain"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Action onClick={handleConfirm} disabled={upload.isPending} type="button">
              {upload.isPending ? 'Uploading…' : 'Use this'}
            </Action>
            <Action variant="ghost" onClick={handleDiscard} disabled={upload.isPending} type="button">
              Retake
            </Action>
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={acceptMode === 'image+pdf'
          ? 'image/jpeg,image/png,image/webp,application/pdf'
          : 'image/jpeg,image/png,image/webp'}
        // Phase 12.2.4 — drop `capture` for image+pdf so the file
        // picker opens (iOS Safari blocks file-picker when capture
        // is set; rear-cam can't take a PDF).
        capture={acceptMode === 'image+pdf' ? undefined : captureMode}
        className="hidden"
        onChange={handlePick}
      />

      {helper && !error && !pendingFile && (
        <p className="text-caption text-text-muted">{helper}</p>
      )}
      {error && (
        <p className="text-caption text-error">{error}</p>
      )}
    </div>
  );
}
