#!/usr/bin/env node
// Generate a VAPID keypair for Phase 7.0 Web Push notifications.
//
// Usage:
//   node scripts/generate-vapid-keys.mjs
//
// Prints a ready-to-paste .env snippet. Rotate quarterly + after
// any suspected leak (same cadence as BHARAT_OS_ADMIN_TOKEN per
// Phase 5.7).

import process from 'node:process';
import { generateVapidKeypair } from '../src/phase0/web-push.mjs';

const { publicKey, privateKey } = generateVapidKeypair();

process.stdout.write(`# Generated VAPID keypair for Bharat OS Web Push.
# Copy these into your .env (or your hosting platform's secret
# store). NEVER commit the private key.

BHARAT_OS_VAPID_PUBLIC_KEY=${publicKey}
BHARAT_OS_VAPID_PRIVATE_KEY=${privateKey}
BHARAT_OS_VAPID_SUBJECT=mailto:dpo@bharat-os.in

# Public key (also expose via GET /api/push-public-key for shell
# subscription registration):
#   ${publicKey}
`);
