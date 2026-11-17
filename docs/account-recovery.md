# Account recovery

`/recover` supports OTP-based password changes/restoration, four-digit account PIN resets, and eight-digit developer PIN resets. It is linked from sign-in, Settings, the account menu and developer sign-in. Password recovery is available for active owner, admin, cashier, superadmin and developer users. Resetting a cashier PIN enables the PIN step for subsequent sign-ins.

## Destinations and delivery

- Email codes go to an account's verified recovery email when one exists, otherwise to its sign-in email. Enter the sign-in email to identify the account. No reset request can supply a different recipient.
- WhatsApp codes go only to a number previously verified by an authenticated user. Account security can enroll a new number by proving possession with an OTP. The UI requires consent and an international number such as `+923001234567`.
- Old `phoneVerified` flags without a verification timestamp are not trusted. The previous instant phone-verification behavior was removed.
- Email uses the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and optional `SMTP_FROM` settings.
- Optional WhatsApp uses Twilio's Messages API with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (international number including `+`, without a `whatsapp:` prefix), and `TWILIO_WHATSAPP_CONTENT_SID`. Configure an approved WhatsApp authentication content template with OTP variable `1`. Credentials stay in the deployment environment. See [Twilio's authentication-template instructions](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).
- `/api/auth/recovery/options` reports globally configured channels. Missing providers are unavailable in the UI and request APIs report an error. A successful provider acceptance does not guarantee inbox/handset delivery; asynchronous delivery-status callbacks are not implemented.

## Protection and limits

Codes expire after ten minutes, are bcrypt-hashed, and allow at most five validation attempts. One active challenge exists per user; a new request invalidates an earlier challenge. A persisted sixty-second request cooldown applies across purposes/channels, alongside HTTP request limits. Unknown or ineligible accounts receive the same generic response; no account-specific contact details are exposed.

Correct codes are consumed atomically so concurrent confirmations cannot reset credentials twice. Recovery is invalidated by account disablement, session-version changes, or a recovery-contact change. Passwords require 8–72 UTF-8 bytes; account/developer PINs require four/eight digits and cannot be all zero. Successful reset increments normal/developer session versions and PIN version, revoking existing access/refresh tokens and PIN challenges. The old `/auth/pin/reset/request` and `/auth/pin/reset` endpoints delegate to this same recovery engine.

Phone enrollment requires a current authenticated account and binds the OTP to that account and destination. Verifying a number cannot be completed with another account's token. Saving an unchanged phone value preserves verification; changing it removes verification.

This deployment uses standalone MongoDB. Challenge consumption and user update are separate writes with version/contact checks. A failure between them requires a new OTP; it cannot reuse the consumed code. Transactional notification/outbox handling, distributed HTTP rate-limit storage, and delivery-status callbacks remain future work.

## Local deployment status — 12 November 2026

The API and web containers are updated and healthy. The deployed capability endpoint currently reports `email: false` and `whatsapp: false`: provider credentials are missing, so live OTP delivery is not enabled. Populate the SMTP settings and, if desired, Twilio WhatsApp settings in `.env`, then recreate the API container with `docker compose up -d --no-deps api`. Do not share credentials in chat or commit them to Git.

Verification completed: 45 API unit tests, 40 real API integration checks, 79 browser checks in the full run plus the additional staff WhatsApp-enrollment browser check. The delivery checks used local provider fixtures, not real recipients.

## Verification

The API harness uses a disposable `pos_spec_test_*` database, loopback SMTP sink, and a child-process-only Twilio HTTP interceptor. It never sends messages to real recipients. Provider fixtures require the disposable database and loopback sink; they are not loaded by the production app or Docker image. HTTP IP throttling is disabled only in that test process so persisted OTP cooldown and attempt limits can be exercised.

Checks cover all five roles, provider acceptance/failure, phone ownership verification, old unverified flags, expiry, resend invalidation, contact changes, five concurrent incorrect attempts, concurrent successful confirmation, revoked sessions, cashier PIN login, and legacy PIN routes. Browser checks cover mobile/desktop password confirmation, expired-code errors, resend delay, developer PIN/WhatsApp selection and unavailable channels. Real SMTP/WhatsApp delivery must be verified with the configured production providers.
