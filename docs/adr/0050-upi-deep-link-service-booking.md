# ADR 0050: UPI Deep-Link for Service Booking Results

## Status

Accepted

## Context

The Phase 2a queue in `BHARAT_OS.md` makes the first PWA-buildable product
increment explicit: a `service_booking` result should hand the user directly to
their UPI app with a `upi://pay?...` URI. This does not require a PSP
partnership, ONDC credentials, or OEM access. It is a local receipt and shell
change that makes the booking card feel transactional instead of merely
observational.

## Decision

Service-booking receipts now include a `payment` artifact when the booking has
a positive INR fare:

- `rail: "upi"` and `mode: "deep_link"`.
- `uri: "upi://pay?pa=...&pn=...&am=...&cu=INR&tr=...&tn=..."`.
- `partnerIntegrated: false` because this is a handoff, not a PSP callback.
- `requiresUserApproval: true` because the user's UPI app is still the approval
  surface.
- `payeeAddress`, `payeeName`, `amount`, `currency`, `transactionRef`, and
  `transactionNote` are included in the receipt for audit/debugging.

Both `bharat_marketplace` and the Phase A `ondc_beckn` bridge emit the same
shape. The native marketplace defaults to `bharatos.marketplace@upi`; the
bridge defaults to `ondc.provider@upi`. Demo callers can override the payee via
`metadata.payeeVpa` / `metadata.payeeName`.

The user-facing shell at `/shell/` renders a `Pay with UPI` action on
`service_booking` result cards when the receipt contains `payment.uri`.

## Consequences

- Phase 2a queue item #1 is closed: service bookings have a one-tap UPI handoff
  from the PWA result card.
- The artifact lives in the execution receipt, so API and CLI consumers get the
  same payment link as the shell.
- This is not settlement confirmation. Production still needs a real PSP/payee,
  callback or polling verification, reconciliation, failure handling, and fraud
  controls before money movement can be treated as complete inside Bharat OS.
