import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptableIssuer, baseRole, mapUsers, mapWorkspace } from "./users-map.mjs";

const tenants = [
  { key: "dga", adminEmails: ["Ann@Example.org", "bob@example.org", "sue@example.org"], customRoleAssignments: { "ANN@example.org": "reviewer" } },
  { key: "pea", adminEmails: ["ann@example.org"] },
  { key: "orst", adminEmails: [] },
];
const editor = { code: "strapi-editor", name: "Editor" };
const author = { code: "strapi-author", name: "Author" };
const sup = { code: "strapi-super-admin", name: "Super Admin" };
const lite = { code: "author-lite-x1", name: "Author Lite" };

test("a Strapi role becomes a base role: the highest one, and an unknown one is a viewer", () => {
  assert.equal(baseRole([editor]), "editor");
  assert.equal(baseRole([author]), "author");
  assert.equal(baseRole([sup]), "admin");
  assert.equal(baseRole([author, editor]), "editor");
  assert.equal(baseRole([lite]), "viewer");
  assert.equal(baseRole([]), "viewer");
});

test("a user's workspaces are the tenants that list them, with the base role and the custom role there", () => {
  const { users, notes } = mapUsers([{ email: "ANN@example.org", firstname: "Ann", lastname: "Lee", isActive: true, roles: [editor] }], tenants);
  assert.deepEqual(users[0], { email: "ann@example.org", body: { name: "Ann Lee", disabled: false, superAdmin: false, memberships: [{ tenantKey: "dga", role: "editor", customRole: "reviewer" }, { tenantKey: "pea", role: "editor", customRole: null }] } });
  assert.deepEqual(notes, []);
});

test("a super admin on no tenant is unscoped; one listed on a tenant is that workspace's admin", () => {
  const { users } = mapUsers([
    { email: "root@example.org", isActive: true, roles: [sup] },
    { email: "bob@example.org", isActive: true, roles: [sup] },
  ], tenants);
  assert.equal(users[0].body.superAdmin, true);
  assert.deepEqual(users[0].body.memberships, []);
  assert.equal(users[1].body.superAdmin, false);
  assert.deepEqual(users[1].body.memberships, [{ tenantKey: "dga", role: "admin", customRole: null }]);
});

test("an inactive or blocked account is disabled; a Strapi role with no base role is reported", () => {
  const { users, notes } = mapUsers([
    { email: "x@example.org", isActive: false, roles: [lite] },
    { email: "y@example.org", isActive: true, blocked: true, roles: [editor] },
  ], tenants);
  assert.deepEqual(users[0].body, { name: null, disabled: true, superAdmin: false, memberships: [] });
  assert.equal(users[1].body.disabled, true);
  assert.ok(notes.some((n) => n.includes("x@example.org") && n.includes("Author Lite") && n.includes("viewer")));
});

test("a user without an e-mail, or listed twice, is reported, not guessed", () => {
  const r = mapUsers([{ firstname: "No", roles: [] }, { email: "a@b.co", roles: [editor] }, { email: "A@B.co", roles: [sup] }], tenants);
  assert.equal(r.users.length, 1);
  assert.equal(r.notes.length, 2);
});

test("an assignment to a custom role that does not exist is reported (it allows nothing until it does)", () => {
  const people = [{ email: "ann@example.org", roles: [editor] }, { email: "sue@example.org", roles: [sup] }];
  assert.ok(mapUsers(people, tenants, { customRoles: [] }).notes.some((n) => n.includes('"reviewer" does not exist')));
  assert.deepEqual(mapUsers(people, tenants, { customRoles: [{ tenantKey: "dga", roleKey: "reviewer" }] }).notes, []);
});

test("the report: who keeps managing a workspace, who no longer does, and a workspace left with no admin stops the copy", () => {
  const people = [
    { email: "ann@example.org", roles: [editor] }, // dga with a custom role: never managed; pea: manages today
    { email: "bob@example.org", roles: [editor] }, // dga, no custom role: manages today, not after
    { email: "sue@example.org", roles: [sup] }, // dga: admin
  ];
  const { report, blocking } = mapUsers(people, tenants);
  const dga = report.find((r) => r.tenantKey === "dga");
  assert.deepEqual(dga.admins, ["sue@example.org"]);
  assert.deepEqual(dga.losing, ["bob@example.org (editor)"]);
  assert.equal(dga.noAdmin, false);
  const pea = report.find((r) => r.tenantKey === "pea");
  assert.deepEqual([pea.admins, pea.losing, pea.noAdmin], [[], ["ann@example.org (editor)"], true]);
  assert.equal(report.find((r) => r.tenantKey === "orst"), undefined, "a workspace with nobody in it is not reported");
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /^pea would have no admin.*--promote pea:<email> \(today's: ann@example\.org\)/);
});

test("a promotion names the admin: that member becomes admin there and nothing stops the copy", () => {
  const people = [{ email: "ann@example.org", roles: [editor] }, { email: "sue@example.org", roles: [sup] }];
  const { users, report, blocking } = mapUsers(people, tenants, { promote: ["pea:Ann@Example.org"] });
  assert.deepEqual(blocking, []);
  assert.deepEqual(users[0].body.memberships, [{ tenantKey: "dga", role: "editor", customRole: "reviewer" }, { tenantKey: "pea", role: "admin", customRole: null }]);
  assert.deepEqual(report.find((r) => r.tenantKey === "pea").promoted, ["ann@example.org"]);
});

test("a promotion of someone who is not a member, or written wrong, stops the copy", () => {
  const people = [{ email: "ann@example.org", roles: [sup] }];
  assert.ok(mapUsers(people, tenants, { promote: ["orst:ann@example.org"] }).blocking.some((b) => b.includes("not a member of orst")));
  assert.ok(mapUsers(people, tenants, { promote: ["dga"] }).blocking.some((b) => b.includes("tenant:email")));
});

test("an admin with a custom role, or a disabled one, does not count as the workspace's admin", () => {
  const ts = [{ key: "dga", adminEmails: ["a@x.org", "b@x.org"], customRoleAssignments: { "a@x.org": "limited" } }];
  const { report } = mapUsers([{ email: "a@x.org", roles: [sup] }, { email: "b@x.org", isActive: false, roles: [sup] }], ts);
  assert.equal(report[0].noAdmin, true);
});

test("a workspace's sign-in settings are copied as legacy, with its provider, secret and MFA requirement", () => {
  const t = { key: "dga", sso: { enabled: true, issuerUrl: "https://idp.example/realms/dga", clientId: "studio", clientSecretEnc: "enc", realm: "dga" }, features: { security: { mfaRequired: true, mfaRequiredAt: "2026-10-01T00:00:00.000Z" } } };
  const w = mapWorkspace(t, (v) => (v === "enc" ? "plain-secret" : null));
  assert.deepEqual(w.body, { mode: "legacy", allowJit: false, requireVerifiedEmail: true, issuer: "https://idp.example/realms/dga", clientId: "studio", clientSecret: "plain-secret", mfaRequired: true, mfaRequiredAt: "2026-10-01T00:00:00.000Z" });
  assert.deepEqual(w.blocking, []);
  assert.ok(w.notes.some((n) => n.includes("allowJit")), "today's on-the-spot accounts are named");
});

test("a secret that cannot be carried stops the copy; nothing to carry is no settings", () => {
  const t = { key: "dga", sso: { enabled: true, issuerUrl: "https://idp.example/realms/dga", clientId: "studio", clientSecretEnc: "enc" } };
  assert.ok(mapWorkspace(t, null).blocking[0].includes("WEBX_ENCRYPTION_KEY"));
  assert.ok(mapWorkspace(t, () => { throw new Error("bad tag"); }).blocking[0].includes("does not decrypt"));
  assert.equal(mapWorkspace({ key: "pea" }, null).body, null);
  assert.equal(mapWorkspace({ key: "pea", features: { security: { mfaRequired: false } } }, null).body, null);
});

test("a provider control would refuse is reported and left out, and the rest is still copied", () => {
  const w = mapWorkspace({ key: "dga", sso: { issuerUrl: "http://keycloak:8080/realms/dga", clientId: "c" }, features: { security: { mfaRequired: true, mfaRequiredAt: "not a date" } } }, null);
  assert.deepEqual(w.body, { mode: "legacy", allowJit: false, requireVerifiedEmail: true, mfaRequired: true });
  assert.ok(w.notes[0].includes("not https"));
});

test("which providers control takes", () => {
  for (const ok of ["https://idp.example/realms/dga", "http://localhost:8080/realms/dga", "http://127.0.0.1:8080/x", "http://kc.localhost/realms/a"]) assert.ok(acceptableIssuer(ok), ok);
  for (const bad of ["http://keycloak:8080/realms/dga", "ftp://x", "https://idp.example/?a=1", "https://u@idp.example", "not a url", ""]) assert.ok(!acceptableIssuer(bad), bad);
});
