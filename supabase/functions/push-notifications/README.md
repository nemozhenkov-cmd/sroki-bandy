# PWA Web Push

This function verifies user bearer tokens through Supabase Auth. Scheduled requests use a separate, random, server-only dispatch token. Gateway JWT verification is disabled intentionally to support ES256 user tokens and scheduled dispatch; every action authenticates inside the function.

Subscriptions are per device, require an explicit permission tap, and are deleted before account logout. Manager/SRTZ users receive counts for their assigned active store; admin/TM receive counts across active stores. Expiry <= Moscow's current date is expired; expiry tomorrow means dispose today, matching the frontend's inclusive-date policy. No email service is used.

The scheduler invokes every 15 minutes. Sending starts at 08:30 Europe/Moscow, stops at 22:00, and catches up if a prior invocation failed. Delivery claims prevent concurrent/repeated sends per subscription/date; transient failures get at most three attempts. Unreachable endpoints (404/410) are removed. Test requests are limited to once per minute per registered device. Neither endpoints nor product data are logged.

VAPID keys are generated once on the server with an atomic conditional update. Keys and the dispatch token live in `push_config`, with RLS enabled and all access revoked from public/anon/authenticated. Only the public VAPID key is returned to authenticated clients. No private keys or service-role keys belong in Vite, GitHub Pages, or repository secrets used by the frontend.

## Release

1. Apply `20261024172703_pwa_push_notifications.sql` once and deploy this function with `verify_jwt=false`.
2. Keep `push_config.enabled=false` while reviewing. User-triggered self tests remain available while daily delivery is disabled.
3. Publish frontend and both identical SW copies (release marker changed).
4. After publication approval, enable daily delivery: `update public.push_config set enabled=true where id=1;`.
5. On a real installed PWA, open Profile → Enable notifications → Send test. Close the app and repeat a test from a second signed-in instance on the same account/device subscription only if explicitly requested. Verify receipt on the physical phone and notification click.

Pause daily delivery without reverting the app: `update public.push_config set enabled=false where id=1;`. This leaves opt-ins intact. Do not rotate VAPID keys during ordinary updates; rotation invalidates subscriptions.

Infrastructure was provisioned additively in project sbsekvjjpxjpdootbsjt using the SQL tool. If switching to CLI-managed database deployments, mark this migration applied (`supabase migration repair 20261024172703 --status applied`) before using db push against that existing project.

## Verification

`node --test tests/*.test.mjs` covers calendar boundaries, Moscow scheduling, store visibility, provider URL validation, worker push fallback, and safe notification navigation. SQL checks cover delivery/test claims and table grants. Browser UI checks use isolated API fixtures; they do not prove phone delivery. Physical phone delivery requires that phone's notification permission, supported OS/browser and network. iOS 16.4+ requires installation on the Home Screen. OS Focus or battery settings may delay display.
