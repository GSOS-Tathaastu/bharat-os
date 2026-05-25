// Phase 5.1 — real SMS provider HTTP integrations.
//
// Each provider's HTTP integration is tested by:
//   • mocking global.fetch
//   • verifying the request URL + headers + body shape
//   • verifying the response parsing (success + failure cases)
//   • verifying credential-missing rejection has the right shape
//
// Live integration testing happens when a real partner contract
// lands — these tests verify the wire protocol is correct.

import assert from 'node:assert/strict';
import test from 'node:test';
import { getSmsProvider, sendSms } from '../../src/phase0/sms-provider.mjs';

function withMockFetch(impl, callback) {
  const orig = global.fetch;
  global.fetch = impl;
  return Promise.resolve(callback()).finally(() => {
    global.fetch = orig;
  });
}

function withEnv(vars, callback) {
  const orig = {};
  for (const key of Object.keys(vars)) {
    orig[key] = process.env[key];
    if (vars[key] === null || vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(orig)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

// ─── Gupshup ────────────────────────────────────────────────────────────

test('gupshup: rejects when credentials are missing', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_GUPSHUP_USERID: null,
      BHARAT_OS_SMS_GUPSHUP_PASSWORD: null,
      BHARAT_OS_SMS_GUPSHUP_SOURCE: null
    },
    async () => {
      const provider = getSmsProvider('gupshup');
      try {
        await provider.send({ phone: '+919876543210', body: 'test' });
        assert.fail('expected throw');
      } catch (error) {
        assert.equal(error.code, 'SMS_PROVIDER_NOT_CONFIGURED');
        assert.equal(error.provider, 'gupshup');
        assert.ok(error.missing.includes('BHARAT_OS_SMS_GUPSHUP_USERID'));
      }
    }
  );
});

test('gupshup: success path builds the right URL + parses "success | <id>"', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_GUPSHUP_USERID: 'testuser',
      BHARAT_OS_SMS_GUPSHUP_PASSWORD: 'testpass',
      BHARAT_OS_SMS_GUPSHUP_SOURCE: 'BHRTOS'
    },
    async () => {
      let capturedUrl = null;
      await withMockFetch(
        async (url) => {
          capturedUrl = String(url);
          return {
            ok: true,
            status: 200,
            text: async () => 'success | msg-abc-123'
          };
        },
        async () => {
          const provider = getSmsProvider('gupshup');
          const result = await provider.send({ phone: '+919876543210', body: 'Code: 123456' });
          assert.equal(result.ok, true);
          assert.equal(result.provider, 'gupshup');
          assert.equal(result.providerMessageId, 'msg-abc-123');
          // URL contains the credentials + the send_to (without leading +).
          assert.match(capturedUrl, /smsgupshup\.com/);
          assert.match(capturedUrl, /userid=testuser/);
          assert.match(capturedUrl, /password=testpass/);
          assert.match(capturedUrl, /source=BHRTOS/);
          assert.match(capturedUrl, /send_to=919876543210/);
          // The "+" was stripped before sending.
          assert.equal(capturedUrl.includes('send_to=%2B'), false);
        }
      );
    }
  );
});

test('gupshup: surfaces failures with structured error', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_GUPSHUP_USERID: 'u',
      BHARAT_OS_SMS_GUPSHUP_PASSWORD: 'p',
      BHARAT_OS_SMS_GUPSHUP_SOURCE: 'S'
    },
    async () => {
      await withMockFetch(
        async () => ({
          ok: true,
          status: 200,
          text: async () => 'error | Invalid recipient'
        }),
        async () => {
          const provider = getSmsProvider('gupshup');
          try {
            await provider.send({ phone: '+919876543210', body: 'x' });
            assert.fail('expected throw');
          } catch (error) {
            assert.equal(error.code, 'SMS_PROVIDER_REJECTED');
            assert.equal(error.provider, 'gupshup');
            assert.match(error.message, /Invalid recipient/);
          }
        }
      );
    }
  );
});

test('gupshup: accepts JSON response format too', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_GUPSHUP_USERID: 'u',
      BHARAT_OS_SMS_GUPSHUP_PASSWORD: 'p',
      BHARAT_OS_SMS_GUPSHUP_SOURCE: 'S'
    },
    async () => {
      await withMockFetch(
        async () => ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ response: { status: 'success', id: 'json-msg-42' } })
        }),
        async () => {
          const result = await getSmsProvider('gupshup').send({
            phone: '+919876543210',
            body: 'x'
          });
          assert.equal(result.providerMessageId, 'json-msg-42');
        }
      );
    }
  );
});

// ─── MSG91 ──────────────────────────────────────────────────────────────

test('msg91: rejects when credentials are missing', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_MSG91_AUTH_KEY: null,
      BHARAT_OS_SMS_MSG91_SENDER_ID: null
    },
    async () => {
      try {
        await getSmsProvider('msg91').send({ phone: '+919876543210', body: 'x' });
        assert.fail('expected throw');
      } catch (error) {
        assert.equal(error.code, 'SMS_PROVIDER_NOT_CONFIGURED');
        assert.equal(error.provider, 'msg91');
      }
    }
  );
});

test('msg91: success path posts to /api/v5/send with authkey header', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_MSG91_AUTH_KEY: 'authkey-xyz',
      BHARAT_OS_SMS_MSG91_SENDER_ID: 'BHRTOS',
      BHARAT_OS_SMS_MSG91_FLOW_ID: null
    },
    async () => {
      let captured = null;
      await withMockFetch(
        async (url, init) => {
          captured = { url: String(url), init };
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ type: 'success', message: 'msg-id-42', requestId: 'req-7' })
          };
        },
        async () => {
          const result = await getSmsProvider('msg91').send({
            phone: '+919876543210',
            body: 'OTP 123456'
          });
          assert.equal(result.providerMessageId, 'msg-id-42');
          assert.equal(result.provider, 'msg91');
        }
      );
      assert.match(captured.url, /msg91\.com\/api\/v5\/send/);
      assert.equal(captured.init.method, 'POST');
      assert.equal(captured.init.headers.authkey, 'authkey-xyz');
      const body = JSON.parse(captured.init.body);
      assert.equal(body.sender, 'BHRTOS');
      assert.equal(body.country, '91');
      assert.equal(body.sms[0].message, 'OTP 123456');
      assert.equal(body.sms[0].to[0], '919876543210');
    }
  );
});

test('msg91: uses /api/v5/flow when FLOW_ID is set + extracts OTP digits', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_MSG91_AUTH_KEY: 'k',
      BHARAT_OS_SMS_MSG91_SENDER_ID: 'BHRTOS',
      BHARAT_OS_SMS_MSG91_FLOW_ID: 'flow-abc'
    },
    async () => {
      let captured = null;
      await withMockFetch(
        async (url, init) => {
          captured = { url: String(url), init };
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ type: 'success', message: 'flow-msg-1' })
          };
        },
        async () => {
          await getSmsProvider('msg91').send({
            phone: '+919876543210',
            body: 'Your code: 987654. Valid 5 min.'
          });
        }
      );
      assert.match(captured.url, /\/api\/v5\/flow/);
      const body = JSON.parse(captured.init.body);
      assert.equal(body.flow_id, 'flow-abc');
      assert.equal(body.OTP, '987654');
      assert.match(body.BODY, /987654/);
    }
  );
});

test('msg91: surfaces failures with structured error', async () => {
  await withEnv(
    { BHARAT_OS_SMS_MSG91_AUTH_KEY: 'k', BHARAT_OS_SMS_MSG91_SENDER_ID: 'B' },
    async () => {
      await withMockFetch(
        async () => ({
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ type: 'error', message: 'invalid authkey' })
        }),
        async () => {
          try {
            await getSmsProvider('msg91').send({ phone: '+919876543210', body: 'x' });
            assert.fail('expected throw');
          } catch (error) {
            assert.equal(error.code, 'SMS_PROVIDER_REJECTED');
            assert.equal(error.provider, 'msg91');
          }
        }
      );
    }
  );
});

// ─── Twilio ─────────────────────────────────────────────────────────────

test('twilio: rejects when credentials are missing', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_TWILIO_ACCOUNT_SID: null,
      BHARAT_OS_SMS_TWILIO_AUTH_TOKEN: null,
      BHARAT_OS_SMS_TWILIO_FROM: null
    },
    async () => {
      try {
        await getSmsProvider('twilio').send({ phone: '+15551234567', body: 'x' });
        assert.fail('expected throw');
      } catch (error) {
        assert.equal(error.code, 'SMS_PROVIDER_NOT_CONFIGURED');
        assert.equal(error.provider, 'twilio');
      }
    }
  );
});

test('twilio: success path uses Basic auth + form body + accountSid in URL', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_TWILIO_ACCOUNT_SID: 'ACtest',
      BHARAT_OS_SMS_TWILIO_AUTH_TOKEN: 'tokentest',
      BHARAT_OS_SMS_TWILIO_FROM: '+15551234567'
    },
    async () => {
      let captured = null;
      await withMockFetch(
        async (url, init) => {
          captured = { url: String(url), init };
          return {
            ok: true,
            status: 201,
            text: async () => JSON.stringify({ sid: 'SMsid42', status: 'queued' })
          };
        },
        async () => {
          const result = await getSmsProvider('twilio').send({
            phone: '+15558675309',
            body: 'Hello'
          });
          assert.equal(result.providerMessageId, 'SMsid42');
          assert.equal(result.provider, 'twilio');
        }
      );
      assert.match(captured.url, /api\.twilio\.com\/2010-04-01\/Accounts\/ACtest\/Messages\.json/);
      assert.equal(captured.init.method, 'POST');
      assert.match(captured.init.headers.authorization, /^Basic /);
      assert.equal(
        captured.init.headers['content-type'],
        'application/x-www-form-urlencoded'
      );
      const params = new URLSearchParams(captured.init.body);
      assert.equal(params.get('To'), '+15558675309');
      assert.equal(params.get('From'), '+15551234567');
      assert.equal(params.get('Body'), 'Hello');
    }
  );
});

test('twilio: uses MessagingServiceSid when FROM starts with MG', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_TWILIO_ACCOUNT_SID: 'AC',
      BHARAT_OS_SMS_TWILIO_AUTH_TOKEN: 'tok',
      BHARAT_OS_SMS_TWILIO_FROM: 'MGservice123'
    },
    async () => {
      let captured = null;
      await withMockFetch(
        async (url, init) => {
          captured = { init };
          return {
            ok: true,
            status: 201,
            text: async () => JSON.stringify({ sid: 'SM2' })
          };
        },
        async () => {
          await getSmsProvider('twilio').send({ phone: '+1555', body: 'x' });
        }
      );
      const params = new URLSearchParams(captured.init.body);
      assert.equal(params.get('MessagingServiceSid'), 'MGservice123');
      assert.equal(params.get('From'), null);
    }
  );
});

test('twilio: surfaces failures with status code', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_TWILIO_ACCOUNT_SID: 'AC',
      BHARAT_OS_SMS_TWILIO_AUTH_TOKEN: 'tok',
      BHARAT_OS_SMS_TWILIO_FROM: '+1555'
    },
    async () => {
      await withMockFetch(
        async () => ({
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({ code: 21211, message: 'Invalid To Phone Number' })
        }),
        async () => {
          try {
            await getSmsProvider('twilio').send({ phone: '+1555', body: 'x' });
            assert.fail('expected throw');
          } catch (error) {
            assert.equal(error.code, 'SMS_PROVIDER_REJECTED');
            assert.equal(error.provider, 'twilio');
            assert.equal(error.providerStatusCode, 21211);
            assert.match(error.message, /Invalid To Phone Number/);
          }
        }
      );
    }
  );
});

// ─── End-to-end through sendSms ────────────────────────────────────────

test('sendSms() dispatches to the configured provider via env var', async () => {
  await withEnv(
    {
      BHARAT_OS_SMS_PROVIDER: 'twilio',
      BHARAT_OS_SMS_TWILIO_ACCOUNT_SID: 'AC',
      BHARAT_OS_SMS_TWILIO_AUTH_TOKEN: 'tok',
      BHARAT_OS_SMS_TWILIO_FROM: '+1555'
    },
    async () => {
      let called = false;
      await withMockFetch(
        async () => {
          called = true;
          return {
            ok: true,
            status: 201,
            text: async () => JSON.stringify({ sid: 'SM-via-sendSms' })
          };
        },
        async () => {
          const result = await sendSms({ phone: '9876543210', body: 'test' });
          assert.equal(result.providerMessageId, 'SM-via-sendSms');
          assert.equal(result.provider, 'twilio');
        }
      );
      assert.equal(called, true);
    }
  );
});

test('karix is still a stub until partner credentials arrive', async () => {
  await withEnv({ BHARAT_OS_SMS_PROVIDER: 'karix' }, async () => {
    try {
      await getSmsProvider('karix').send({ phone: '+919876543210', body: 'x' });
      assert.fail('expected throw');
    } catch (error) {
      assert.equal(error.code, 'SMS_PROVIDER_NOT_CONFIGURED');
      assert.equal(error.provider, 'karix');
    }
  });
});
