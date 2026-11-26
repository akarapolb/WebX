# C4 identity: plan for review

Status: written 2026-11-25. Step 0 (fixes that change who can sign in nowhere) was built on 2026-11-25, and steps 1 and 2 (token v2, keys,
credentials, sessions, in `webx-control` only, switched off, nothing calling them) on 2026-11-26; steps 3 and up are not started. A Studio session
switch is security-critical (`docs/target-architecture.md`, Risks), so no step that changes who can sign in to Studio starts before this plan is
reviewed. D10 (users, roles and OIDC sign-in in webx-control, no passwords) and D11 (a short-lived signed token that Studio
and every engine verify with a public key) are taken as given; D16 to D23 at the end are what is left open.

**In short.** Today a person's identity is whatever the content engine says: Studio keeps Strapi's admin token (or a
WordPress application password) in a cookie and asks the engine who it is on every call. C4 replaces that, workspace by
workspace and behind switches, with OIDC sign-in, a session and signed tokens from webx-control, MFA kept there, and engine
calls made with a per-workspace service credential plus a short-lived signed "acting editor" token that the engine verifies.
Steps 1 to 5 change nothing for anyone, steps 6 and 7 add a second way in beside the old one, and step 11 removes it.

**How to read the references.** Every `file:line` was read for this plan, at commit `a5d7fc5` (`git show a5d7fc5:<path>`
reproduces it; the move of reviews and releases to the control plane, commit `196fc3c`, shifts `governance.ts` after line 183,
`webx-control/README.md` and `ci.yml`, and rewrites `app/api/ai/translate/route.ts:58`). What I could not check is marked
**unverified**; nothing was run. The session that integrated this plan re-read 20 of its references against `a5d7fc5` and all
matched: `ctl:854-862`, `gov:1268-1281`, `gov:940-981` (and that no guard stands between the Keycloak list and the deactivation
loop, although the comment in `lib/keycloakAdmin.ts:40` says the caller treats an empty set as "could not determine"),
`sidx:168-178`, `sidx:293-297`, `lib/keycloakAdmin.ts:29-41`, `lib/oidc.ts:132-143`, `sso/callback/route.ts:18-32`,
`gov:868-896`, `lib/totp.ts:54-62, 80-84`, `seed.ts:918-922`, `console.ts:179-195`, `policies/admin-only.ts:8-24`, `idn:196-216`,
`crp:306-314`, `ai/audit/route.ts:29-42`, `dc:223-226, 444-446`. Paths starting `app/`, `lib/`, `components/`, `tests/` or `middleware.ts` are in
`webx-studio/`; `tools/` is `webx-control/tools/`. Short names: `gov` = `webx-studio/lib/cms/governance.ts`,
`cfg` = `lib/config.ts`, `sess` = `lib/strapi.ts` (session helpers), `idn` = `webx-control/src/identity.rs`,
`ctl` = `webx-control/src/main.rs`, `sidx` = `strapi-cms/src/index.ts`,
`crp` = `wordpress/mu-plugins/custom-role-enforcement.php`, `dc` = `docker-compose.yml`.

## 1. Where we are

### 1.1 Sign-in and session in Studio today

- The login form chooses the engine (`app/login/page.tsx:6-9`); SSO is offered only when the URL names a workspace,
  `/login?tenant=<key>` (`:21, :38-46`).
- Strapi password sign-in: `POST /api/auth/login` calls Strapi `/admin/login` (`app/api/auth/login/route.ts:35`,
  `sess:66-82`) and keeps Strapi's own admin token as the session cookie (`login/route.ts:69-72`).
- WordPress sign-in: username plus Application Password, checked against `/wp/v2/users/me` (`login/route.ts:21-33`,
  `lib/wordpress.ts:9-24`). The cookie holds `base64(user:appPassword)` itself (`lib/wordpress.ts:5-6`); it never expires or
  rotates (`app/api/auth/refresh/route.ts:11-17`).
- MFA, Strapi accounts only: with a TOTP row, the real Strapi token and refresh token wait in an unsigned JSON cookie
  (`webx_mfa_pending`, 5 min) until `/api/auth/mfa/verify-login` accepts a code (`login/route.ts:51-67`,
  `app/api/auth/mfa/verify-login/route.ts:15-42`). WordPress returns before the MFA check (`login/route.ts:21-33`) and the
  app layout skips the enforcement lookup for it (`app/(app)/layout.tsx:52`).
- SSO: `sso/login` parks the PKCE verifier, state and `next` in an unsigned JSON cookie (10 min,
  `app/api/auth/sso/login/route.ts:25`). `sso/callback` exchanges the code with `openid-client` (`lib/oidc.ts:132-143`: no
  `nonce`; `email_verified` is returned but ignored, `:141-142`, `sso/callback/route.ts:21-30`), then `ssoLogin()` turns the
  e-mail into a real Strapi session through a shadow account (`gov:850-920`).
- Sign-up is public: it creates a workspace and its first Strapi admin (Editor role) and signs in (`gov:582-634`,
  `app/api/auth/signup/route.ts:12-26`).
- Refresh: `SessionKeeper` posts `/api/auth/refresh` on load, every 10 min and on tab focus
  (`components/SessionKeeper.tsx:9-13`), rotating Strapi's single-use refresh token (`refresh/route.ts:19-26`,
  `sess:95-110`). Logout deletes three cookies and revokes nothing at the engine (`app/api/auth/logout/route.ts:5-11`).
- Per request: `middleware.ts:88` only checks that the cookie exists (a redirect for people, `:42-43`). Validity is checked
  when governed code asks the engine "who am I", one engine call each time (`gov:1724-1734` -> `lib/cms/strapi.ts:248-258`,
  `lib/cms/wordpress.ts:495-502`), and in the app layout (`layout.tsx:11-15`).
- Limits: 10 POSTs per 10 minutes by default (`WEBX_AUTH_RATE_MAX`) per forwarded address for everything under `/api/auth/`,
  refresh included, in memory (`middleware.ts:40-66`). At `a5d7fc5` that address was the **first** `X-Forwarded-For` entry, which
  the caller writes, so anyone could pick a fresh address per attempt and never reach the limit (Strapi's own login limiter, keyed
  on Studio's address and the e-mail, was then the only brake on guessing a password). Fixed after this plan was read, outside
  C4: the key is the entry the outermost of `WEBX_TRUSTED_PROXIES` proxies added (`lib/clientAddress.ts`; the same in webx-control's
  visitors' routes). No CSRF token or Origin check exists (`git grep` over
  `middleware.ts`, `app/`, `lib/` finds none); the cookies are `SameSite=Lax`.

| Cookie | Holds | Lifetime | Set at |
|---|---|---|---|
| `webx_session` (`cfg:4-5`) | Strapi admin token, or the WordPress Basic string | 1800 s | `login/route.ts:30,69`, `mfa/verify-login/route.ts:37`, `refresh/route.ts:24`, `sso/callback/route.ts:37`, `signup/route.ts:18` |
| `webx_session_engine` (`cfg:11`) | `strapi` or `wordpress` | 1800 s | the same, except `refresh` |
| `webx_refresh` (`cfg:13-14`) | Strapi's rotating refresh token | 86400 s | the same, except the WordPress branch of `login` |
| `webx_mfa_pending` (`cfg:21-22`) | `{token, refresh, email}` as JSON | 300 s | `login/route.ts:63` |
| `webx_sso_pending` (`cfg:29-30`) | `{tenantKey, codeVerifier, state, next}` as JSON | 600 s | `sso/login/route.ts:25` |

All are httpOnly, `SameSite=Lax`, `Path=/`, and `Secure` only when `NODE_ENV=production` (`login/route.ts:14`); none has a
`__Host-` prefix. For comparison, Strapi's own session limits are 8 h idle and 24 h absolute (`strapi-cms/config/admin.ts:10-11`).

### 1.2 Authorization in Studio today

- Who the caller is: `currentUser()` is the acting job's user, else the engine's `auth.me()` (`gov:1724-1728`). Roles are
  the engine's role names; super admin is Strapi's role or WordPress `administrator` (`lib/cms/strapi.ts:254-257`,
  `lib/cms/wordpress.ts:501`).
- Which workspace: the tenant whose `adminEmails` lists the e-mail, cached 30 s (`gov:404-436`). One e-mail gives one
  workspace: a second listing overwrites the first (`gov:418`, admitted at `gov:2941-2942`). `null` means unscoped, and an
  unscoped caller may name any `?tenant=` (`gov:3506-3508`). The switcher lives only in the browser
  (`components/TenantProvider.tsx:12-23`). Membership writes go to the same `adminEmails` (`gov:2908-2915, 2932-2936`), and
  seats are counted from it (`gov:2881-2885`).
- Roles in force: Strapi's own roles still gate content inside Strapi (`strapi-cms/src/seed/seed.ts:714-717`); custom roles
  are a WebX overlay, `tenant.customRoleAssignments` plus `custom-role` rows (`gov:1223-1248`, mirrored in
  `strapi-cms/src/utils/custom-role.ts:34-53`); field policies match Strapi role names (`gov:1124, 1513`).
- "Workspace admin" is not a role. A member with no custom role counts as admin for the MFA requirement and the agent policy
  (`gov:805, 818, 1870`). Creating or removing users, creating, deleting and assigning custom roles, and the SSO settings
  check only that the workspace is the caller's (`gov:729-735, 1137-1213, 2870-2958`; routes under `app/api/cms/{auth/users,roles,sso}`).
  By reading: a member with a restrictive custom role can delete that role or reassign themselves. Not run.
- MFA: TOTP rows in Strapi (`api::mfa-enrollment`), secret stored as given (`gov:1276, 1367-1368`), recovery codes as
  unsalted SHA-256 (`lib/totp.ts:81-83`), a code accepted at +-1 step with no replay record (`:56-62`), attempts counted per
  process (`gov:1331-1357`). `startMfaEnrollment` overwrites an enabled row with `enabled: false` on a session alone
  (`gov:1268-1281`, route `app/api/cms/mfa/start/route.ts`). "Require MFA" (14-day grace, `gov:794-846`) is enforced only
  by a UI overlay (`components/Shell.tsx:37`), is ignored for SSO workspaces (`gov:841`) and does not exist for WordPress.
- SSO: issuer and client in the tenant row, secret AES-GCM under `WEBX_ENCRYPTION_KEY` (`gov:373, 729-772`,
  `lib/crypto.ts`). First SSO login creates a Strapi admin (Editor) with a machine password kept encrypted in
  `sso-credential`, and **adds the e-mail to the workspace roster by itself** (`gov:871-895`); later logins decrypt it and
  call `/admin/login` (`gov:897-916`). Deprovisioning is a timer (900 s default, `dc:225`) using a Keycloak master-realm
  credential (`cfg:63-71`); an empty or failed Keycloak answer deactivates every SSO admin of the workspace, and only the
  first 1000 users are read (`gov:963-981`, `lib/keycloakAdmin.ts:29-41`).
- Background jobs act as their owner with the scheduler credential plus an `ActingSession` (`sess:40-52`,
  `gov:2404-2440`); the owner is re-checked per slice from the engine (`gov:2419-2432`, `lib/agent/jobs/owner.ts:36-40`),
  and `ownerUserId` is the engine's user id (`gov:2268, 2523`).

Where an engine token is used, and where a service credential:

| The signed-in user's own engine token (`sessionToken()`, `sess:33-38`) | A service credential |
|---|---|
| every governed content call, `activeAdapter()` (`gov:100-102, 2836`); media (`gov:2966-2988`); `auth.me`; `listRoles()` without a workspace (`gov:2842, 2851`) | bookkeeping, `strapiBookkeeping()` (`gov:398-402`): tenant registry, field policies, custom roles, releases, reviews, MFA and SSO rows, signup, API tokens, Stripe |
| app layout: `strapiMe`/`wordpressMe`, `/api/console/context` (`layout.tsx:11-22`) | user management and role lists per workspace, `withEngineAdapter` (`gov:3493-3502`) |
| pass-through `/api/strapi/*`, allowlist `app/api/strapi/[...path]/route.ts:31-45`, token `:52` | release scheduler (`gov:3528-3573`), plan-limit counts (`gov:2744-2784`), WordPress tenant term (`gov:3474-3480`) |
| AI routes calling Strapi's content-manager directly: `app/api/ai/audit/route.ts:31-42`, `translate/route.ts:15-25,58`, `index/route.ts:22-47` (`generate`, `search` check the cookie) | background jobs: scheduler credential plus acting identity (`gov:2435-2440`; headers `lib/cms/strapi.ts:26-27`) |
| `disableMfa` re-proves with the Strapi password (`gov:1313`) | SSO shadow-account login and re-mint (`gov:859-916`), deprovisioning (`gov:943-997`) |

`ai/audit` takes `tenant` from the request body (`audit/route.ts:33-35`) and relies on Strapi scoping by the caller's own
token; under a service credential it would become a cross-tenant read. The scheduler is a Strapi Super Admin whose password
is in Studio's environment (`cfg:54-55`, `strapi-cms/src/seed/seed.ts:918-936`, public fallback password `:920`), token
cached 25 min (`gov:3413-3445`); the WordPress one is an application password cached forever (`gov:3446-3463`). One shared
`WEBX_INTERNAL_SECRET` is at once the Strapi MFA-gate bypass (`strapi-cms/src/middlewares/admin-mfa.ts:27-28`), the
rate-limit bypass (`rate-limit.ts:46-48`) and the key to `/api/internal/*`
(`strapi-cms/src/api/internal/controllers/internal.ts:40-97`).

### 1.3 The engines today

- Strapi's tenant hook (`sidx:214-308`) scopes reads, stamps creates and refuses cross-tenant writes by the session's
  tenant (`sidx:143-150`; roster lookup `strapi-cms/src/utils/custom-role.ts:9-18`), applies custom roles and field
  policies (`sidx:228-286`), and writes a backstop audit row unless the request says `X-WebX-Governed: 1` (`sidx:295-296`).
  Any authenticated caller can send that header (reading, not tested). On `/api/*` the tenant comes first from `?tenant=`,
  `X-Tenant` or the host, falling back to `dga` (`strapi-cms/src/middlewares/tenant.ts:34-47`, preferred at `sidx:146`).
- Acting: Studio already sends `X-WebX-Acting-Email` and `-Tenant` with the scheduler token (`lib/cms/strapi.ts:26-27`).
  Strapi honours them only from the scheduler account, and checks the acting user is on the roster and an active admin
  account (`sidx:168-178`). The headers are unsigned, and the scheduler is itself a Super Admin, so a holder of its
  password simply does not send them.
- Strapi's own admin surface: MFA gate with one shared demo secret by default (`strapi-cms/src/utils/mfa.ts:4-6`), bypassed
  by `X-Internal-Secret` (`admin-mfa.ts:27-28`); `/api/console/*` is open to any active admin
  (`strapi-cms/src/policies/admin-only.ts:10-24`), including `PUT /api/console/users`, which rewrites the caller's own
  workspace's `adminEmails` (`strapi-cms/src/api/console/controllers/console.ts:179-195`). Studio never calls it
  (`git grep`). Strapi's port is bound to loopback by default (`dc:99-110`). `/api/internal/tenant-of` and
  `custom-role-permissions` (roster lookup by the e-mail the caller supplies) rest on the shared secret alone
  (`strapi-cms/src/api/internal/controllers/internal.ts:48-97`).
- WordPress: `crp` identifies the caller by the WordPress user's e-mail and asks **Strapi** for the tenant and custom-role
  permissions (`crp:183-211`, cached 15 s), enforces writes (REST `:290-381`, `map_meta_cap` `:404-432`, `save_post` revert
  `:463-519`) and scopes wp-admin lists (`:535-570`). It fails open when the lookup fails or the user is on no roster
  (`:310-313`) and never enforces reads (`:293-297`). So WordPress enforcement needs a running Strapi even in a
  WordPress-only deployment. Auth is Basic with application passwords (`wordpress/mu-plugins/auth-header-fix.php:6-18`);
  a WordPress account has no deactivated state (`lib/cms/wordpress.ts:521`).
- Rust engine: one random bearer token per tenant, only its SHA-256 stored, tenant taken from the token
  (`rust-engine/src/main.rs:199-206, 292-302`, `rust-engine/src/store.rs:28, 212-227`). No expiry, no revoke command found,
  no acting editor. `lib/cms/rust.ts` exists but governance knows two engines only (`gov:100-102`).

### 1.4 What webx-control has, and what it lacks

| Built and tested on the real binary | Missing for C4 |
|---|---|
| users, memberships, `super_admin` (`idn:15-30`); roles are free text (`idn:53-55`) | stable user id in the token, `custom_role` on memberships, a role catalogue |
| Ed25519 token: `iss sub name tenants[{key,role}] superAdmin iat exp` (`idn:177-192`), JWKS (`idn:81-83`), `/api/auth/me` (`ctl:130-140`) | `aud jti sid tid amr/mfa nbf`; a super admin's token for one workspace names none (`idn:182-185`); `verify` ignores `kid` (`idn:196-216`); one key, seed unencrypted in the database (`idn:31, 59-73`); no rotation |
| `POST /internal/token` mints a token for any known enabled user for any holder of the service token (`ctl:854-862`) | the OIDC step (Studio does it, `ctl:854`), per-workspace OIDC settings, an (issuer, subject) link, sign-in audit rows |
| disabling a user cuts a live token off at `/api/auth/me` (`idn:212-215`, `tools/identity-test.mjs:88-90`) | sessions, refresh, logout, revocation; engines do not call `/me` |
| admin API replaces a user and all memberships at once (`idn:132-146`, `ctl:730-742`) | per-membership routes so a workspace admin can act without the operator token |
| `tools/migrate-users.mjs`: name, active flag, rosters, role slug (`tools/users-map.mjs:7-25`) | custom-role assignments, Strapi `blocked`, MFA rows, tenant `sso` settings |
| nothing | MFA, per-tenant engine credentials, engine verification, acting-editor propagation |

## 2. Target flow

1. **Sign-in.** `/login` asks for the workspace (or an e-mail that maps to one). Studio redirects to that workspace's IdP
   with PKCE as `lib/oidc.ts:111-126` does now, plus a `nonce`. The provider settings come from control, not Strapi's tenant
   row. Studio exchanges the code (D17) and presents `{issuer, sub, email, email_verified, amr, ip, ua, workspace}` to
   control with a broker credential that only Studio holds.
2. **Control decides.** The issuer must be that workspace's configured IdP; the e-mail must be verified (default); the user
   is found by (issuer, sub), or linked by e-mail on first login if they hold a membership (or JIT is on for the
   workspace); disabled users are refused. MFA policy is applied (item 9 below). Success and refusal are written to control's own
   audit table. Control creates a session row and returns an access token and a refresh token.
3. **Token.** Access token: EdDSA JWT, 15 min, claims `iss aud=webx-studio sub uid sid tid role crole sa mfa amr iat nbf exp jti`
   next to today's `tenants` and `superAdmin` (kept so nothing built so far breaks). One workspace is active per token
   (`tid`); a super admin's token names the workspace they act in.
4. **Studio session.** Cookie `webx_cs` holds the access token; `webx_cr` holds an opaque refresh token with `Path=/api/auth`,
   `SameSite=Strict`. Both httpOnly, `__Host-` prefixed in production. No engine token reaches the browser, and
   `webx_session_engine` goes away (the engine comes from the registry).
5. **Per request.** Studio verifies locally with the cached JWKS (`kid`, `iss`, `aud`, `exp`, 30 s leeway), then checks the
   session is not revoked through a 30 s cache of `GET /internal/sessions/<sid>`. `currentUser()` returns
   `{id: uid, email, roles: [role, crole], isSuperAdmin: sa}` and the workspace is `tid`, replacing the e-mail lookup at
   `gov:424-436`. Every `?tenant=` or body tenant is compared with `tid`.
6. **Refresh.** Within 2 min of expiry, or after a 401, Studio posts the refresh token to control, which rotates it. A used
   refresh token is accepted once more for 20 s (parallel tabs or replicas) and gets an access token only; later reuse
   revokes the session. `SessionKeeper` stays; the refresh route leaves the login rate-limit bucket (`middleware.ts:53-55`).
7. **Switching workspace.** `POST /api/auth/switch {tenantKey}`; control checks membership and returns a token with that `tid`.
8. **Logout and revocation.** Logout revokes `sid` in control and clears the cookies. Control revokes all of a user's
   sessions when the user is disabled or deleted, a membership or role changes, or IdP back-channel logout arrives, each with an audit row.
9. **MFA.** Control holds TOTP secrets (encrypted) and the workspace policy. If the policy asks for a second factor and the
   IdP's `amr` does not show one (when the workspace trusts the IdP), control answers `mfa_required` with an opaque pending
   id (a server-side row; no engine token in a cookie), Studio asks for the code, and the session is created only when it
   verifies. After the grace period an unenrolled user's session has scope `enroll`: Studio and engines refuse everything
   else. That is real server-side enforcement, and it covers SSO and WordPress (today: a UI overlay, `components/Shell.tsx:37`).
10. **Engine calls.** Studio holds no user engine token. Each call carries (a) the workspace's service credential (Strapi: a
    service account; WordPress: a service user's application password; Rust: the tenant bearer) and (b) an acting token:
    60 s, `aud=engine`, minted by control for (session, workspace), cached about 45 s. The engine verifies it with the JWKS,
    takes tenant, role and custom role from it, refuses a credential with no valid acting token, and refuses a token whose
    `tid` differs from the credential's workspace. Custom roles are read from control with a read-only engine credential.
11. **Background jobs.** Before each slice, Studio or the worker asks control for an acting token for the job's owner;
    control refuses if the owner is disabled or no longer a member, and the job id goes in the audit row. This replaces the
    engine lookup at `gov:2419-2432`. Existing jobs carry engine user ids as `ownerUserId`; the migration maps them to
    control ids, or the first slice after the switch fails with `owner_revoked` (`lib/agent/jobs/owner.ts:40`).

## 3. The change set

Each step ships alone. With its switch off nothing changes for an existing deployment, and the DGA hub stays a valid
setup of the target. Sizes are my rough estimates in working days, not measured.

| # | Step | Where | Switch | Days |
|---|---|---|---|---|
| 0 | Fix what is wrong today, independent of C4 | Studio, Strapi | none (bug fixes) | 2 |
| 1 | Token v2, key rotation, credential split | webx-control | unset variables = today | 1.5 |
| 2 | Sessions, identities, revocation, audit | webx-control | no caller yet | 2.5 |
| 3 | Workspace identity settings, role catalogue, migration | webx-control, tools | per-workspace `mode`, default `legacy` | 2.5 |
| 4 | MFA | webx-control, tools | needs a workspace past `legacy` | 3 |
| 5 | Engine calls stop using the user's own engine token (refactor) | Studio | none; behaviour identical | 3 |
| 6 | Sign in through webx-control next to the old session | Studio | `WEBX_CONTROL_IDENTITY=off\|both\|control`, plus `mode` | 4 |
| 7 | Users, roles, SSO, sign-up, jobs read and write webx-control | Studio | same | 4 |
| 8 | Strapi verifies acting tokens, reads roles from control | strapi-cms | `WEBX_CONTROL_URL` + engine token | 2.5 |
| 9 | WordPress verifies acting tokens | mu-plugins | same | 3 |
| 10 | Per-tenant service credentials, retire the shared super admin | all | per workspace | 2.5 |
| 11 | Retire the legacy path, review, CI | all | explicit operator command | 3 |

About 33 working days, against 10 to 15 in the C4 row of `docs/target-architecture.md`; that row should be revised after review.

**Step 0 - fix what is wrong today** (separate small pull requests, each with a unit test; rollback is a revert).
- CSRF: refuse non-GET `/api/*` requests that are not same-origin (`Origin`, `Sec-Fetch-Site`) in `middleware.ts`, except the
  Stripe webhook and the secret-protected `/api/internal/*`.
- `startMfaEnrollment` refuses when MFA is already enabled unless a current code is supplied (`gov:1268-1281`); deprovisioning
  never acts on an empty or failed Keycloak list and pages past 1000 (`gov:963-981`, `lib/keycloakAdmin.ts:29-41`).
- Strapi skips its audit row for `X-WebX-Governed` only when the request also carries the internal secret (`sidx:295-296`).
- Constant-time compare for `WEBX_SCHEDULER_SECRET` (`app/api/internal/{releases/process-due,sso/reconcile,agent/tick,rebuild}`,
  lines 10 to 16; `lib/agent/toolGateway.ts:91-96` already does it); Studio refuses to start in production with the public
  default scheduler password (`strapi-cms/src/seed/seed.ts:920`).
- Proof: `npm test` in `webx-studio` plus the cross-tenant spec in CI (`.github/workflows/ci.yml:123-195`).

**Step 0 status, 2026-11-25: built and unit-tested; none of it changes who can sign in.** What was built, and where it differs from the list:
- CSRF: `lib/csrf.ts`, called first in `middleware.ts` (before the rate limiter, so another site cannot use up a visitor's sign-in
  attempts). The rules are Go's `CrossOriginProtection`: GET, HEAD and OPTIONS pass; `Sec-Fetch-Site` `same-origin` or `none` passes,
  `same-site` (a sibling subdomain) and `cross-site` are refused; without that header the `Origin` must be this host (`Host`, or
  `X-Forwarded-Host`) or listed in the new `WEBX_TRUSTED_ORIGINS`; with neither header the request is not a browser page and passes.
  Exempt: `/api/internal/` and `/api/webhooks/`. `tests/csrf.test.ts` posts to every file under `app/api` from another site, so a route
  added later is covered. **Not done:** the refresh cookie `Strict` on `Path=/api/auth` from the threat table below. A path
  restriction would hide the cookie from page requests that refresh in the layout, so it goes with the session work (step 6).
- MFA: `lib/cms/mfaEnrollment.ts`. A current authenticator code or an unused recovery code is required to start an enrollment while
  MFA is on, and counts against the same per-account attempt limit as signing in. **Left for step 4:** the old factor stops counting
  between start and confirm (a pending-secret field would fix that), and a code just used to sign in still works for 30 seconds.
- Keycloak: `listEnabledKeycloakEmails` reads every page (offset until an empty page, so a server that serves fewer than asked is not
  taken for done) and throws on a failed request, an answer that is not a list, paging that does not advance, or no enabled user
  with an e-mail. The reconcile loop skips that workspace with an error on its report. A realm that really has no enabled users now
  leaves its SSO admins as they are, with the error, instead of deactivating all of them.
- Strapi: `src/utils/governed-audit.ts`. With no `WEBX_INTERNAL_SECRET` configured the header is never believed, so a deployment that
  never set the secret gets an extra audit row for each Studio write rather than a missing one (compose requires the secret).
- Secrets: `lib/secretCompare.ts` (SHA-256 of both sides, then `timingSafeEqual`, so the length does not leak either; `gatewayAuthorized`
  uses it as well), `lib/internalAuth.ts` for the four scheduler routes, and a test that every route under `app/api/internal` is behind
  one of the two approved checks before it awaits anything. `lib/startupChecks.ts` runs from `instrumentation.ts`: Studio refuses to start in
  production with the public scheduler password, which means it prints why and exits with status 1. (The first version only threw from
  `register()`; a production build run with `next start` showed that on Next 15.5 this leaves the process up, listening and answering 500 to
  everything, so it looked started and was only unhealthy.) Strapi's seed no longer creates the scheduler account with it in production, and
  logs an error at every boot while an existing account still accepts it (`src/utils/scheduler-credentials.ts`).
  **Upgrade note:** a production Studio with `STRAPI_SCHEDULER_PASSWORD=WebxSched@2569` will not start until the password is changed on both sides.

**Step 1 - token v2 and credentials** (`idn`, `ctl`).
- Add claims `aud uid sid tid role crole sa mfa amr nbf jti`; keep `tenants`, `superAdmin`. `verify` checks `alg`, `kid`,
  `aud`, `nbf` strictly. JWKS lists the current and the previous key (`WEBX_CONTROL_SIGNING_KEY`,
  `WEBX_CONTROL_SIGNING_KEY_PREVIOUS`; the database key stays the fallback) with `Cache-Control: max-age=300`.
  `/api/auth/me` also returns `superAdmin`, `tid`, `sid`.
- New `WEBX_CONTROL_AUTH_TOKEN` (the broker credential, held by Studio only) is required by `/internal/token` and the session
  routes once set; unset, `/internal/token` takes the service token as today. New `WEBX_CONTROL_ENGINE_TOKEN`: read-only.
- Proof: unit tests in `identity.rs` for `alg: none`, wrong `kid`, wrong `aud`, expired, `nbf` in the future, tampered claims,
  a rotated key still verifying, a retired key refused. Extend `tools/identity-test.mjs` (engine-style verify by `kid` with two
  keys, broker credential required). Rollback: previous binary; tokens last 15 min.

**Step 1 status, 2026-11-26: built and tested on the real binary; nothing calls it, and no existing route changes unless a new variable is set.**
What was built (`webx-control/src/identity.rs`, `main.rs`), and where it differs from the list:
- Claims: `aud uid sid tid role crole sa mfa amr nbf jti` next to `tenants` and `superAdmin`, every one always present (null when it has no
  value). `uid` is the user's id as a string; a user deleted and made again has another one, so `verify` finds the user by `uid` and
  compares the e-mail, and a new user of the same address inherits no token. `mfa` is a boolean that means "control considers this session
  multi-factor" (always false until step 4); `amr` is what the sign-in used as the provider said, informational. `crole` is null until step 3.
  A token made by `/internal/token` has `sid` null. **Checks:** only `EdDSA`; `kid` must name a key in the set (a missing or unknown `kid` is
  refused, other keys are not tried); signatures are checked with `verify_strict` (no malleable encodings); `iss`, `aud` (one string, exact),
  `nbf` and `exp` are required and checked, and so is every claim above that a verifier relies on; a token over 32 KiB is refused before it is decoded.
  The checks live in one function without database access (`verify_token`, with a `leeway` for verifiers that allow clock difference; control's own
  `/api/auth/me` allows none) that Studio's step-6 client can be tested against.
- Keys: `WEBX_CONTROL_SIGNING_KEY` signs; `WEBX_CONTROL_SIGNING_KEY_PREVIOUS` is the seed of the key being retired (only its public half is kept, it
  never signs) **or the word `database`**, for a deployment that never set a key and so rotates off the one control made and stored. The key set
  lists the current key first, then the previous one, with `Cache-Control: max-age=300`. `webx-control keygen` prints a seed. The rotation and the
  emergency procedure (drop the old key, nobody is signed out because refresh tokens are not signed) are in `webx-control/README.md`.
- Credentials: `WEBX_CONTROL_AUTH_TOKEN` (broker) is required by `/internal/token` as soon as it is set, and then the service token is refused there
  (and the broker credential reads nothing else of `/internal`); `WEBX_CONTROL_ENGINE_TOKEN` opens `/engine/*`, reads only (a write is a 405
  whatever it carries). The first thing it opens is `GET /engine/users/<email>`, the roster lookup Strapi's `tenant-of` does today, because a read-only
  credential with nothing to read would be configuration for nothing; custom roles come with step 3. The service refuses to start if either new
  credential has the value of another (an existing admin token equal to the service token is left alone, so an upgrade does not stop a deployment).
- `/api/auth/me` also returns `uid superAdmin tid sid role crole mfa amr`.
- **Not done:** Studio's key-set client (cache five minutes, refetch on an unknown `kid` at most once a minute, a stale key set for up to 24 hours;
  step 6); keeping the signing key anywhere but the environment or the database file; the second-level checks the threat table lists for engines.

**Step 2 - sessions** (`webx-control`).
- Tables `sessions` (id, user, active workspace, absolute and idle expiry, refresh hash, previous hash and its grace end,
  `mfa_at`, `amr`, ip, ua, `revoked_at`), `identities` (issuer, subject, user), `auth_pending`.
- Broker routes: `POST /internal/sessions`, `/internal/sessions/refresh`, `/internal/sessions/<id>/switch`,
  `DELETE` and `GET /internal/sessions/<id>`, `POST /internal/users/<email>/revoke`, `POST /internal/engine-token` (60 s,
  `aud=engine`, needs a live session or a job purpose). `PUT`/`DELETE /admin/users/*` revoke sessions. Control writes
  `sign_in`, `sign_in_refused`, `refresh_reuse`, `logout`, `revoke` to its own audit table (`webx-control/src/audit.rs`).
- Proof: new `tools/sessions-test.mjs` on the real binary: rotation, grace reuse, theft revokes, disable revokes and stops
  engine tokens, restart persistence, wrong issuer refused, unverified e-mail refused, unknown user refused with JIT off,
  a second subject for the same e-mail refused. Rollback: tables stay unused; previous binary.

**Step 2 status, 2026-11-26: built and tested on the real binary (`webx-control/src/sessions.rs`, `tools/sessions-test.mjs`); nothing calls it.**
The session routes are off (503) until `WEBX_CONTROL_AUTH_TOKEN` is set. Lifetimes are the D16 recommendation, as flags: 15 minutes, 8 hours idle,
24 hours absolute, a 20-second grace, 60-second engine tokens. Where it differs from the list:
- **`workspace_identity` starts here, in a small form** (provider, `allow_jit`, `jit_role`, `require_verified_email`; admin routes
  `GET|PUT|DELETE /admin/tenants/<key>/identity`), because the step's own proof ("wrong issuer refused", "unknown user refused with JIT off")
  needs a provider to be wrong against. Step 3 adds `mode`, the client, its encrypted secret and the MFA policy to the same table. **`auth_pending`
  moves to step 4**, where MFA first uses it. A table nothing writes is not worth reviewing.
- **Two rules the plan does not state, found while writing the decision, both tested.** (1) *A workspace's provider is believed only about its own
  workspace.* A person who belongs to workspaces A and B has one user row; if a session made with A's provider could switch to B, whoever
  administers A's provider could assert that person's e-mail and walk into B. So a session moves only to a workspace whose provider is the one it was
  made with (a shared provider, such as one Keycloak realm for several workspaces, switches freely; otherwise the person signs in again there).
  (2) *No workspace's provider can vouch for a super admin*, whose user row is tied to none: e-mail linking and "made on the spot" never apply to one,
  and a super admin signs in only through an identity an operator linked (`PUT /admin/users/<email>/identities`, the only way to get one). Without it,
  the administrator of any customer's provider could take over a platform operator who is also on that customer's roster. Making a user a super admin
  (or not) ends their sessions, so a session got by e-mail link cannot become a super admin's by a promotion.
- Ending sessions goes beyond the list: also when a workspace's provider changes or its settings are removed (the sessions made with the old
  provider), when a workspace is deleted, and when an operator changes a user's identities. Adding a workspace or changing a name ends nothing.
  `refresh` also looks again at the user, so a user who lost the workspace some way that did not go through the admin API is signed out at the next refresh.
- A wrong refresh secret is a plain 401 and ends nothing: the session id is in every access token, so ending a session on a wrong guess would let anyone
  who had seen a token sign its owner out. Only the token that was just replaced, shown again after the grace, ends it. Only one earlier token is
  remembered: one from two refreshes ago is refused without ending the session.
- Audit: one row per `sign_in`, `sign_in_refused` (the reason, and the address), `identity_linked`, `user_provisioned`, `refresh_reuse`, `logout`,
  `revoke`, `session_switch`, each carrying the session id, and each written in the same transaction as the change it records (no row, no session). A
  session's engine tokens are not audited (one per user every 45 seconds or so); a job's are, with the job id, and so are refusals.
- `PUT /admin/users/*` and `DELETE /admin/users/*` go through the session code (`replace_user`, `remove_user`); `GET /admin/users/<email>/identities` and
  `PUT` are new.
- **Not done:** a list of a user's sessions for a "your sessions" screen; IdP back-channel logout; the per-IP limit on sign-in attempts stays in Studio's
  middleware (control sees only the broker); the `enroll` scope and the MFA branch of the decision (step 4); the 30-second revocation cache and its
  fail-closed rule are Studio's, in step 6.

**Step 3 - workspace identity settings, roles, migration** (`webx-control`, `tools/`).
- Table `workspace_identity` (workspace, `mode` `legacy|both|control`, issuer, client id, client secret encrypted under a new
  `WEBX_CONTROL_SECRET_KEY`, `allow_jit`, `jit_role`, `require_verified_email`, `mfa_required`, `mfa_required_at`,
  `accept_idp_mfa`); `memberships.custom_role`; base roles `admin`, `editor`, `author`, `viewer` as a fixed matrix in
  `webx-control/src/roles.rs`, validated on write (replacing free text, `idn:53-55`).
- Read routes for custom roles for engines (the `custom-role` records already exist, `webx-control/README.md:281-286`).
- `tools/migrate-users.mjs` and `users-map.mjs` gain custom-role assignments, `blocked`, the tenant `sso` settings
  (decrypt with `WEBX_ENCRYPTION_KEY`, re-encrypt), a dry-run list of who keeps or loses today's de-facto admin powers
  (D22), and a refusal to leave a workspace with no admin.
- Proof: unit tests for the matrix and validation; `tools/users-map.test.mjs` extended; the migration against a fake Strapi
  (pattern: `tools/migrate-forms-test.mjs`). Rollback: delete the rows; Strapi stays the source.

**Step 4 - MFA in webx-control.**
- Table `mfa`; with a user token: `POST /api/auth/mfa/start|confirm|disable`, `GET /api/auth/mfa/status`; broker route
  `POST /internal/auth/mfa/verify`. Secrets encrypted; recovery codes HMAC under `WEBX_CONTROL_SECRET_KEY`; the used time
  step recorded (no replay); attempts counted in the database per user (not per process, `gov:1331-1357`); disable and
  re-enrol need a current code or recovery code, not a password (`gov:1310-1322`); `enroll` scope after the grace period
  (`MFA_GRACE_DAYS` = 14, `gov:794`). `tools/migrate-mfa.mjs` copies Strapi's `mfa-enrollment` rows (copy, not move); legacy
  SHA-256 recovery hashes (`lib/totp.ts:81-83`) are accepted once, then re-hashed.
- Proof: RFC 6238 vectors, replay refused, lockout after 8 failures (`gov:1344`), `enroll` scope cannot mint engine tokens,
  a migrated user passes with the old authenticator; `tools/mfa-test.mjs`. Rollback: unused until a workspace leaves
  `legacy`; Strapi's rows are untouched.

**Step 5 - engine calls stop using the user's engine token** (pure refactor in Studio).
- New `lib/engineAuth.ts` returns `{credential, acting?}`; the legacy implementation is today's cookie token. The adapters
  (`lib/cms/strapi.ts:17-35`, `lib/cms/wordpress.ts:203-207`, `lib/cms/rust.ts`) use it. Convert every direct caller:
  `app/api/ai/{audit,translate,index,search,generate}`, the proxy's allowlist entries (`api/console/context`,
  `console/branding`, `analytics/*`, `upload`, `search`, `ai/answer`), and `layout.tsx`; `ai/audit` takes its workspace from the session.
- `actingSession()` means "background job" in `gov:425, 1545, 1725, 1738-1749` and about 22 `assertNotActing` calls; reusing
  it for people would switch those job-only limits on for them. Interactive calls get their own store.
- Switch: none. Proof: `npm test`; the CI cross-tenant spec unchanged; a test that fails if `sessionToken(` appears outside
  `lib/strapi.ts` and `lib/engineAuth.ts`. Rollback: revert.

**Step 6 - sign in through webx-control, next to the old session** (Studio).
- New `lib/identity.ts` (control client, JWKS cache, verify, revocation cache, one in-flight refresh per session) and config
  (cookie names, `WEBX_CONTROL_IDENTITY`, `WEBX_CONTROL_AUTH_TOKEN`). Control branches in
  `app/api/auth/{sso/login,sso/callback,refresh,logout,mfa/verify-login}`, new `app/api/auth/switch`; `middleware.ts:88`
  accepts either cookie and gains the Origin check; `layout.tsx` (workspaces from memberships, MFA state from claims);
  `app/login/page.tsx` adds "Sign in with your organisation"; `currentUser()` and `resolveEffectiveTenant()`
  (`gov:424-436, 1724-1728`) read the control session first, then the legacy one.
- Engine calls for a control session use the acting pattern as background jobs do today. For Strapi that still needs a
  Strapi admin account for the acting user (`sidx:175-176`) until step 8: create it with the existing JIT code, flagged as
  removed in step 11. For WordPress it means Studio-only enforcement until step 9 (`gov:1550-1559`), which is weaker than
  today's interactive sessions, so no WordPress workspace is switched before step 9.
- Switch: `WEBX_CONTROL_IDENTITY=off` (default) | `both` | `control`, and per workspace `mode`. `both` shows both ways in;
  `control` makes Studio refuse legacy password sign-in for that workspace's members.
- Proof: a mock OIDC provider `e2e/support/mock-oidc.mjs` (discovery, authorize with `login_hint`, token, JWKS; test only);
  Studio unit tests against a fake control (pattern `tests/audit-store.test.ts`) for bad signature, wrong `aud`, expired,
  revoked `sid`, replayed refresh; Playwright for sign-in, workspace switch, logout killing the session at once, two tabs
  refreshing together. Rollback: set the variable to `off`; control sessions are simply no longer read.

**Step 7 - users, roles, SSO, sign-up, jobs on webx-control** (Studio).
- `governed.auth.*` (`gov:2839-2959`), `assignCustomRole`, `listManageableTenants`, seat counts, `selfServeSignup`,
  `ssoLogin`, `components/SsoSettings.tsx`, `components/Security.tsx`, the MFA requirement, `checkOwner`/`runAsJobOwner`
  (`gov:2419-2440`) read and write control for workspaces in `both` or `control`: no shadow password is created for them any
  more. For `both` the Users screen also writes `adminEmails` and `customRoleAssignments` into Strapi so Strapi's backstop
  and rollback stay current. Role checks: only `admin` manages users, roles, SSO, security and agent policy (D22). Existing
  jobs and schedules get their `ownerUserId` mapped.
- Proof: e2e `user-management` and `mfa-enforcement` in control mode (create, list, remove, seat limit, a non-admin refused,
  an overdue user refused at the API); unit tests for the role matrix. Rollback: `mode=legacy`.

**Step 8 - Strapi verifies the acting token** (`strapi-cms/src/`).
- New `utils/webx-token.ts` (Node crypto Ed25519 verify with a JWKS cache, the same call `tools/identity-test.mjs:53` uses).
  `sidx:168-178` takes tenant, role and custom role from a verified `X-WebX-Acting` token; the old headers work only while
  `WEBX_LEGACY_ACTING=1`. A list of service accounts replaces `SCHEDULER_EMAIL` (`sidx:152`, `middlewares/rate-limit.ts:37`); a
  service account with no valid token is refused in the document hook. `utils/custom-role.ts:9-53` and
  `api/internal/controllers/internal.ts:81-97` read custom roles and membership from control. The bypass at
  `middlewares/admin-mfa.ts:27-28` is keyed to service accounts, not to the shared secret.
- Switch: `WEBX_CONTROL_URL` and `WEBX_CONTROL_ENGINE_TOKEN` on Strapi; unset = today.
- Proof: extend the C1 conformance suite (`tests/conformance/suite.ts` lists auth as a TODO) with acting cases: forged,
  expired, other-workspace and other-engine tokens refused; `viewer` cannot write; custom role honoured; a credential alone
  refused; run against Strapi. Rollback: unset.

**Step 9 - WordPress verifies the acting token** (`wordpress/mu-plugins`).
- New `webx-identity.php`: Ed25519 verify with libsodium (**unverified** that it is enabled in the image
  `wordpress:7.1-php8.3-apache`, `wordpress/Dockerfile:26`; check with `function_exists('sodium_crypto_sign_verify_detached')`),
  map the token to tenant, role, custom role. `crp:183-211` reads control instead of Strapi; the plugin stops failing open
  for the service user and enforces the base-role matrix itself, as the service user is a broad WordPress account; reads untouched.
- Switch: `WEBX_CONTROL_URL` and `WEBX_CONTROL_ENGINE_TOKEN` in the container; unset = today.
- Proof: the same conformance cases against WordPress; `e2e/tests/wp-admin.spec.ts`. Rollback: unset.

**Step 10 - per-tenant service credentials.**
- Control table `engine_credentials` (workspace, kind, secret encrypted, rotated) with `GET /internal/engines/<key>/credential`
  (audited, rate-limited) and a rotation tool. Strapi: one service admin per workspace in that workspace's roster. WordPress:
  one service user per workspace with its own application password. Rust: the existing per-tenant token plus a revoke
  command. Studio asks for the credential per call instead of `STRAPI_SCHEDULER_*` and `WORDPRESS_SCHEDULER_*`
  (`cfg:54-57`); the shared super admin is kept for operators, then removed.
- Proof: leak test: workspace A's credential with workspace B's acting token gets 403 from every engine; rotation with no
  downtime. Rollback: unset = shared credential.

**Step 11 - retire the legacy path** (only after every workspace has been on `control` for the agreed soak, D23).
- Shadow Strapi accounts set inactive and the `sso-credential` rows deleted; `WEBX_ENCRYPTION_KEY` rotated; Strapi's
  `mfa-enrollment` rows kept read-only 30 days, then deleted; legacy login routes answer 410; `docs/engine-contract.md`
  (auth, lines 17-19 and 217-220) and the C4 row of `docs/target-architecture.md` updated; security review signed off.
- Done means: `user-management`, `mfa-enforcement` and `cross-tenant-isolation` pass for a Strapi and a WordPress workspace.
  The login helper (`e2e/tests/_helpers.ts:62-71`) goes through the mock IdP; `mfa-enforcement` backdates the grace period
  through control, not Strapi's tenant row. A CI job `e2e-identity` copies `e2e-audit-control-plane` (`ci.yml:199-293`).
  WordPress is not in CI today (`ci.yml:295-301`, `e2e/README.md:155-165`): add it or record a manual release gate (**unverified** whether a
  runner can build the image, which downloads ACF at build time, `wordpress/Dockerfile`).
- Irreversible parts run behind an explicit operator command with a dry run. Rollback after this step is a restore from backup.

**Cutover gates.** A Strapi workspace may go to `both` after step 7 and to `control` after step 8; a WordPress workspace
after step 9. First a test workspace on `both` with the mock IdP and a real Keycloak (manual), then DGA on `both`, then
`control`. No workspace switches before the review of this plan and of steps 1, 2 and 6 has happened.

## 4. Threat model and checklist for the security review

| Threat | Risk in this codebase | Control to build, and the test |
|---|---|---|
| Session fixation, login CSRF | No pre-login session id exists, so classic fixation is absent. The SSO state is an unsigned JSON cookie without `__Host-` (`sso/login/route.ts:25`), so a sibling subdomain can plant it; the MFA pending cookie carries the real engine token (`login/route.ts:63`); no `nonce` (`lib/oidc.ts:118-124`) | `__Host-` cookies in production; pending state in control with only an opaque id in the cookie; `state` + `nonce` + PKCE. Test: replay a callback with another browser's state; set the cookie from a fake sibling origin |
| CSRF | No token, no Origin check (`git grep`); `Lax` still sends cookies from same-site sibling origins such as another subdomain | Step 0 Origin/`Sec-Fetch-Site` check on every non-GET `/api/*`; refresh cookie `Strict` on `Path=/api/auth`. Test: a route-table test over `app/api/**/route.ts` posting cross-origin with the cookie, expecting 403 |
| Token theft, replay | The cookie is the engine's own token: a stolen WordPress cookie is a never-expiring credential (`lib/wordpress.ts:5-6`); logout revokes nothing (`logout/route.ts:5-11`) | 15 min access token; refresh rotation with reuse detection; logout revokes `sid`; sessions list and "sign out everywhere"; `auth_time` or `mfa` required for user, role, SSO and MFA changes; redact `Authorization` and `X-WebX-Acting` in logs. Test: reuse an old refresh token; `/api/cms/auth/me` is 401 right after logout |
| Signing key, rotation | One key, seed unencrypted in SQLite unless set from the environment (`idn:31, 59-73`); `kid` ignored (`idn:196-216`); no rotation procedure in `DEPLOY.md` (grep finds none) | Two-key JWKS, `kid`-strict verify, key from the environment in production, documented rotation (overlap at least 15 min; emergency: drop the old key, refresh tokens survive); callers refetch on an unknown `kid` at most once a minute, cache 5 min, accept a stale JWKS up to 24 h. Test: rotate under load |
| Revocation latency | Studio asks the engine who the caller is on every call (`gov:1724-1728`) and caches the roster 30 s (`gov:408`), so removal bites within about 30 s (reading, not measured); `webx-control/README.md:310-311` says an engine checking only the signature honours a token until it expires | Studio at most 30 s (sid cache), engine tokens 60 s, back-channel logout optional. Test: disable a user, measure the bound. Proposed bound: about 90 s worst case |
| MFA bypass | UI-only enforcement (`Shell.tsx:37`); downgrade by re-enrolment (`gov:1268-1281`); `disableMfa` needs a password SSO users do not know (`gov:1310-1314`); no MFA for WordPress (`login/route.ts:21-33`) or SSO (`gov:702, 841`); TOTP replay (`lib/totp.ts:56-62`); per-process counter (`gov:1331-1343`); unsalted recovery hashes (`lib/totp.ts:81-83`) | Enforce at session creation with `enroll` scope; disable and re-enrol need a current code; replay record; database counters; HMAC recovery codes; `mfa` claim. Test: each one as a negative case, and `mfa-enforcement` calls the API of an overdue user directly, not only the overlay |
| Tenant confusion | E-mail-to-workspace map overwrite (`gov:418`); browser-only switcher; unscoped callers accept any `?tenant=` (`gov:3506-3508`); WordPress `administrator` counts as super admin (`lib/cms/wordpress.ts:501`); `ai/audit` trusts a body tenant (`audit/route.ts:33-35`) | `tid` is the only workspace; `assertCanActOnTenant` compares to it; super admin only by an explicit control flag; engines take the tenant from the token and credential and ignore `?tenant=` and `X-Tenant` on acting calls. Test: extend `cross-tenant-isolation` with another workspace's key in query, body, header and `documentId`, for Strapi and WordPress, and a user in two workspaces |
| Privilege escalation through the acting-editor header | Unsigned headers honoured from a Super Admin account that does not need them (`sidx:168-178`); no acting concept in WordPress; any member can manage roles and users (`gov:1137-1213`) | Engines honour only a signed `aud=engine` token with matching `tid`; a credential without it is powerless; role changes need `admin`. Test: forged header with the real credential, A's token with B's credential, `viewer` write, replay after 60 s: all refused |
| Service credential leakage | One service token, held by Studio, Strapi, `webx-agent` and the tools (`webx-control/README.md:55`, `strapi-cms/src/utils/control-plane.ts:11-15`, `webx-agent/src/control.rs:20`), can mint any user's token (`ctl:854-862`); scheduler Super Admin password in Studio's environment with a public default (`cfg:54-55`, `strapi-cms/src/seed/seed.ts:920`); `WEBX_INTERNAL_SECRET` is MFA bypass, rate-limit bypass and internal API at once; `WEBX_SCHEDULER_SECRET` compared with `!==`; the e2e suite logs in as the scheduler (`e2e/tests/_helpers.ts:27-29`); Studio talks to control over plain HTTP on the compose network (`dc:460`) | Split by purpose (broker, data, engine read); per-tenant engine credentials encrypted in control; rotation tool; audit every credential read; constant-time compares; refuse default secrets in production; TLS or a private network documented. Test: the step 10 leak test; a grep for the default strings |
| Shadow-password removal | `sso-credential` holds a decryptable password for a real Strapi admin per SSO user (`gov:874-880, 897-899`): Studio compromise, or the key plus a database read, gives direct Strapi sign-in | Stop creating (step 7), deactivate and delete (step 11), rotate `WEBX_ENCRYPTION_KEY`. Test: after step 11, `/admin/login` with a shadow e-mail fails and the table is empty |
| SSO deprovisioning, JIT | See 1.2: 15 min timer, master-realm credential, mass deactivation on an empty list, 1000-user cap, automatic roster entry with the Editor role | Membership and sessions revoked at once in control; IdP removal found by back-channel logout and a per-workspace read-only client, never acting on an empty or failed list; JIT only when the workspace opts in, low default role. Test: a fake Keycloak returning `[]`, 500 and 1500 users |
| IdP trust, account takeover | `email_verified` ignored (`lib/oidc.ts:142`); binding by e-mail only | Issuer must equal the workspace's; verified e-mail by default; bind (issuer, sub) after first login and flag a new subject for a known e-mail. Test: unverified e-mail refused; same e-mail, new subject refused |
| Control plane down or slow | Many checks fail open today (`gov:1056-1063`, `layout.tsx:52`, `crp:310-313`); control serialises SQLite behind one mutex (`ctl:57`), so callers must cache revocation checks | Sign-in and refresh fail closed; issued tokens keep verifying from the cached JWKS; a stale revocation verdict is honoured 5 min, then writes are refused; engine backstops fail closed for service credentials. Test: stop control mid-session |
| Audit gaps | No sign-in or sign-out events; MFA and SSO events are audited by Studio and swallowed on failure (`gov:1712-1721`) | Control writes sign-in, refusal, refresh reuse, logout, revoke, membership, role, MFA and SSO changes to its own append-only table. Test: each event leaves a row carrying `sid` |

What the reviewer can run in about half a day:
- Read `idn` (issue, verify) and the new session code; feed it the token vectors from the step 1 tests.
- `git grep -n "sessionToken("`, `"actingSession()"`, `"adminEmails"`, `"X-WebX-"` and check each remaining hit is expected;
  the route-table test: every file under `app/api/**` is behind the session check, secret-protected, or on an explicit public list.
- Look at the cookies in a browser (names, flags, `Max-Age`, `Path`); stop control, rotate the key and disable a user, each
  mid-session; then the three e2e specs, and one manual run against Keycloak 26 (`dc:445`) with back-channel logout.

## 5. Not in C4

- The rest of the tenant record (plan, features, branding) stays in Strapi until the registry moves (C2, C3); only
  membership, roles, OIDC settings and the MFA policy move here. Field policies still match role names (mapping: step 7).
- Switching off the engines' own users, `/admin` login, `/api/console/users` and `export`, the unused SSO bridge
  (`strapi-cms/src/api/console/controllers/console.ts:24-45`) and the shared-secret routes: C6.
- A local-password option for customers without an IdP, SAML, SCIM: later (D10). Postgres for control: D3 (sessions add
  write load to one SQLite file).
- External integrators' Strapi API tokens (`cli-webx/webx.mjs:12`, `mcp-webx/server.mjs:16`, Studio's API tokens page,
  `gov:1403-1486`): outside WebX governance, documented as such. Visitors' routes (C5); the Stripe webhook's own check.
- The Rust engine verifying acting tokens: after R3 is wired into governance (not yet, `gov:100-102`).

## 6. Open decisions for the user

**D16 - Token and session lifetimes.** How long does a person stay signed in, and what keeps them signed in?
Recommendation: 15 min access token (already `--token-ttl 900`), opaque rotating refresh token in control with 8 h idle and
24 h absolute (what Strapi allows today, `strapi-cms/config/admin.ts:10-11`), 20 s reuse grace, 60 s engine tokens, 30 s
revocation cache in Studio. Alternatives: (a) one long token, no refresh: simplest, but revocation takes as long as the token
lives; (b) an opaque session id checked on every request: instant revocation, but Studio stops when control does and the
single SQLite mutex (`ctl:57`) becomes the bottleneck. Consequence: about 90 s between disabling a user and their last
accepted engine call; refresh must leave the 10-per-10-minutes login bucket.

**D17 - Who completes the OIDC exchange.** Recommendation: Studio, as built (`lib/oidc.ts`, `ctl:854`), with control
validating what Studio asserts (the workspace's issuer, verified e-mail, the (issuer, sub) link) and a separate broker
credential. Alternative: control does the exchange, so a compromised Studio cannot mint a session for an identity the IdP
did not vouch for and the client secret never leaves control; that needs RSA and ECDSA ID-token verification and an OIDC
client in Rust (`webx-control/Cargo.toml` declares Ed25519, SHA-2 and AES-GCM, no RSA or ECDSA). Consequence: with Studio
exchanging, the broker credential is a "mint anyone" key to rotate and keep off the network; the session API is the same
either way, so this can be swapped later.

**D18 - What proves the acting editor to an engine.** Recommendation: a signed 60 s `aud=engine` token from control,
verified by every engine (as D11 says), plus a per-tenant service credential that is powerless without it. Alternatives:
(a) plain `X-WebX-Acting-*` headers (today's Strapi mechanism): no new engine code, but anyone holding the credential can
claim anyone; (b) a gateway in front of the engines that holds the credentials: nothing to verify in WordPress or Rust, but
engines can no longer back-stop (`docs/target-architecture.md:64` wants that kept) and it is one more service to secure.
Consequence: verification code in Strapi (Node), WordPress (PHP) and later Rust; engines need the JWKS and a sane clock.

**D19 - WordPress application passwords.** Recommendation: editors have none. Each workspace gets one WordPress service
user (Editor, tied to the `wtenant` term) whose application password control stores encrypted and hands to Studio per call;
the acting token names the person; the mu-plugin applies base and custom role from the claims. Alternatives: (a) keep
per-editor application passwords as the input to control: a never-expiring credential stays in the browser cookie, today's
weakness; (b) an OIDC plugin for wp-admin: out of scope for a headless engine. Consequence: WordPress's logs show the service
user, so control's audit is the audit of record; `WP_ALLOW_HTTP_APP_PASSWORDS` must stay unset in production
(`wordpress/mu-plugins/auth-header-fix.php:16-18`).

**D20 - MFA: who enrols, what is trusted.** Recommendation: control owns TOTP enrolment (screens stay in Studio,
`components/Security.tsx`); a workspace may also trust the IdP's `amr` (off by default; **unverified** whether the Keycloak 26.0
in `dc:445` emits it); "require MFA" is enforced at session creation. Alternatives: (a) leave it all to the IdP: no secrets
in WebX, but nothing to enforce against an IdP without MFA and `mfa-enforcement` has nothing to drive; (b) TOTP in WebX only,
ignoring IdP MFA: simplest, double prompts for IdP users. Consequence: control stores TOTP secrets, so they join the security
review; WordPress workspaces get MFA for the first time.

**D21 - Existing Strapi admins, shadow accounts, WordPress users.** Recommendation: migrate with `migrate-users.mjs`; after
cutover set shadow accounts and migrated editors inactive (not deleted), keep one documented break-glass Strapi super admin per
deployment, delete `sso-credential` rows and rotate the key in step 11. Alternatives: (a) leave Strapi accounts active:
editors can still sign in to `/admin` with passwords, outside WebX governance; (b) delete them: irreversible, and authorship
references are lost. Consequence: every member must be able to sign in through OIDC first, so a workspace with no IdP cannot
be switched (D10); the checklist per workspace: IdP configured, all members matched by e-mail, at least one admin.

**D22 - Roles and who may manage people.** Recommendation: four fixed base roles `admin`, `editor`, `author`, `viewer` in
control; custom roles stay an overlay that can only restrict (`gov:1223-1248`), stored as `memberships.custom_role`; only an
`admin` without a custom role manages users, roles, SSO, security and agent policy. Migration maps Strapi Editor to
`editor`, Author to `author`, a Super Admin listed on a workspace to `admin` (`tools/users-map.mjs:19`), and lists everyone who
loses today's de-facto admin powers (`gov:805, 818, 1870`) for the operator to promote. Alternatives: (a) keep today's rule
(every member without a custom role is an admin): no surprise, but a restricted member can still remove their own role;
(b) free-text roles as now (`idn:53-55`): flexible, cannot be reviewed. Consequence: a visible change for DGA's `dga-editor`,
which the e2e specs treat as admin (`e2e/tests/mfa-enforcement.spec.ts:4-7`), so the seeds change.

**D23 - Cutover granularity and the rollback window.** Recommendation: per-workspace `mode` plus the global
`WEBX_CONTROL_IDENTITY` kill switch; a test workspace, then DGA on `both` for two weeks, then `control`; step 11 only after
all workspaces have been on `control` for 30 days. Alternatives: (a) one global switch: simpler, but one bad IdP setting locks
everyone out; (b) never remove the legacy path: keeps the shadow-password and engine-login surface D10 set out to drop.
Consequence: `both` keeps two membership sources in step through dual writes for the whole window, one more moving part and
the reason rollback stays cheap until step 11.
