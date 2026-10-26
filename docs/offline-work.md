# Offline product work

## Behavior

After one successful signed-in load, the accessible product list, catalog, stores and profile are saved in IndexedDB, separately for each user UUID. Without connectivity the last locally used account can reopen this cached workspace. This is local access on an already used device, not a new server login. Current server identity and permissions are checked again before any upload.

Adding, editing and disposing products first writes an immutable UUID operation in a durable IndexedDB transaction, then updates the visible list. Ordinary connected saves start upload in the background. Previously queued work is sent manually with **Отправить изменения**. Reconnection refreshes the server snapshot under the local overlay; it does not silently send old work. Product cards are marked **Не отправлено** or **Нужно проверить**; queued disposals are visible in queue details even though removed from the active local list.

The panel shows last successful server load, queued actions and send result. Successful acknowledgements alone remove actions. Failed/unknown network outcomes keep the same operation UUID for retry. A per-account browser lock and server transaction lock handle duplicate sends; processing is idempotent even without the browser lock. Dependent changes are ordered and rebased to the preceding acknowledged server revision. A generation guard prevents an older background read from overwriting a more recent local acknowledgement.

## Server reconciliation

The additive `sync_offline_operation` RPC runs as SECURITY INVOKER and retains existing RLS. It additionally validates active/accessible source and destination stores. Actor IDs are derived from auth.uid(), never trusted from cached profiles. Private, RLS-protected per-owner receipts record request fingerprints and results in the same transaction as product changes and the existing audit trigger. Authenticated clients have no direct update/delete grants on receipts. No anonymous RPC grant; no service key in the app.

Updates/disposals lock the row and compare the baseline product/store/date/quantity/note/disposal flag/timestamp. A changed, disposed or inaccessible party is not overwritten. A new active party that already exists is reported as a conflict, not silently merged. Existing unique index `expiry_items_unique_active` also guards concurrent legacy-client inserts.

Conflict details retain the local version, show the server state when accessible and let the employee explicitly keep the server version (with confirmation). This removes the affected dependent local chain; any required change can then be entered again against the fresh data. Unknown send outcomes cannot be discarded before retry confirms their result. Known PostgreSQL rollback errors become reviewable rejections.

## Boundaries

First login and first data download require internet. Unknown barcodes can be scanned but require manual naming offline. Server history/reports/profile administration are online-only and explicitly labelled as such. Closing without saving a form does not create a queued operation. Background sync while the PWA is closed is not promised. Clearing browser/site storage, uninstall behavior or losing the device may lose unsent work. Persistent storage is requested as a best effort, not guaranteed.

Logout refuses while this account has unsent work. After successful push-disconnection and with no pending actions, this account's local cache is removed before server logout. Switching authenticated accounts never submits another owner's queue. Offline access is available to whoever can unlock that already signed-in device; this feature does not add a separate local PIN.

The worker precaches the built JS/CSS and all three mascot poses before install succeeds, so it cannot activate an incomplete new shell. Push behavior and expiry calculations remain unchanged.

## Verification

- Configured production build and queue/worker/node tests.
- SQL behavior and permission checks inside BEGIN/ROLLBACK using synthetic product/party rows: add, retry without duplicate audit, UUID reuse rejection, update, stale-write conflict, disposal, inaccessible store rejection, duplicate-party conflict, unauthenticated rejection, invoker mode, receipt RLS and anonymous grants. No schema or test rows retained.
- Isolated browser fixture using the actual UI/IndexedDB/queue modules and a simulated server: offline edit, reload restoration, manual upload; conflict with a second employee and keeping server data; unknown-product add; swipe disposal; two-action upload; mobile width 390. The fixture has no working database connection and is excluded from GitHub production source/build.
- Remaining physical-device check: installed Android/iPhone PWA launch with actual airplane mode, storage eviction behavior, reconnection after a long expired session. Browser fixture connectivity is simulated; it does not establish OS-level offline behavior.

## Publication order

Not yet deployed. On publication approval: apply the additive migration `20261026192132_offline_operation_queue.sql` to the expiry project, verify function/receipt policies and schema reload, then merge/deploy the frontend. Migration grants only caller-scoped new functionality and changes no existing product rows or existing policies. Reverting the frontend is compatible with leaving the additive ledger/function installed. Do not delete receipts while any device may still retry an unacknowledged operation.
