import { test } from "node:test";
import assert from "node:assert/strict";
import { mapUsers } from "./users-map.mjs";

const tenants = [
  { key: "dga", adminEmails: ["Ann@Example.org", "bob@example.org"] },
  { key: "pea", adminEmails: ["ann@example.org"] },
  { key: "orst", adminEmails: [] },
];
const editor = { code: "strapi-editor", name: "Editor" };
const sup = { code: "strapi-super-admin", name: "Super Admin" };

test("a user's workspaces are the tenants that list them, with their role as a slug", () => {
  const { users } = mapUsers([{ email: "ANN@example.org", firstname: "Ann", lastname: "Lee", isActive: true, roles: [editor] }], tenants);
  assert.deepEqual(users[0], { email: "ann@example.org", body: { name: "Ann Lee", disabled: false, superAdmin: false, memberships: [{ tenantKey: "dga", role: "editor" }, { tenantKey: "pea", role: "editor" }] } });
});

test("a super admin on no tenant is unscoped; one listed on a tenant keeps that scope as admin", () => {
  const { users } = mapUsers([
    { email: "root@example.org", isActive: true, roles: [sup] },
    { email: "bob@example.org", isActive: true, roles: [sup] },
  ], tenants);
  assert.equal(users[0].body.superAdmin, true);
  assert.deepEqual(users[0].body.memberships, []);
  assert.equal(users[1].body.superAdmin, false);
  assert.deepEqual(users[1].body.memberships, [{ tenantKey: "dga", role: "admin" }]);
});

test("an inactive user is disabled, and a user with no tenant and no super role has no workspaces", () => {
  const { users } = mapUsers([{ email: "x@example.org", isActive: false, roles: [{ code: "strapi-author", name: "Author Lite" }] }], tenants);
  assert.deepEqual(users[0].body, { name: null, disabled: true, superAdmin: false, memberships: [] });
});

test("a user without an email is reported, not guessed", () => {
  const r = mapUsers([{ firstname: "No", roles: [] }], tenants);
  assert.equal(r.users.length, 0);
  assert.equal(r.problems.length, 1);
});
