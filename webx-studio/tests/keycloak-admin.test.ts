// The Keycloak user list SSO deprovisioning acts on (lib/keycloakAdmin.ts). Whoever is missing from it is deactivated, so
// it is either the whole list or an error, never "what we got": an empty answer, a failed request and a realm bigger
// than one page used to deactivate people who were still enabled.
import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

type User = { id: string; username: string; email?: string; enabled: boolean };

/** A realm of n users; `cap` is the most Keycloak will serve per request whatever `max` asks for. */
function realmOf(n: number): User[] {
  return Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, username: `user${i}`, email: `User${i}@Example.org`, enabled: true }));
}

describe("listEnabledKeycloakEmails", () => {
  let list: (token: string, realm: string) => Promise<Set<string>>;
  const realFetch = globalThis.fetch;
  let calls: { url: URL; auth: string | null }[];

  before(async () => {
    process.env.KEYCLOAK_URL = "http://keycloak.test";
    process.env.KEYCLOAK_ADMIN = "admin";
    process.env.KEYCLOAK_ADMIN_PASSWORD = "not-used-here";
    ({ listEnabledKeycloakEmails: list } = await import("../lib/keycloakAdmin"));
  });
  beforeEach(() => { calls = []; });
  afterEach(() => { globalThis.fetch = realFetch; });

  /** Serves `users` the way Keycloak's admin API does: `first` is the offset, `max` the page size up to `cap`. */
  function serve(users: User[], opts: { cap?: number; fail?: (call: number) => Response | Error | null; ignoreFirst?: boolean } = {}) {
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = new URL(String(input));
      calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
      const injected = opts.fail?.(calls.length);
      if (injected instanceof Error) throw injected;
      if (injected) return injected;
      const first = opts.ignoreFirst ? 0 : Number(url.searchParams.get("first") ?? 0);
      const max = Math.min(Number(url.searchParams.get("max") ?? 100), opts.cap ?? Infinity);
      return Response.json(users.filter((u) => u.enabled).slice(first, first + max));
    }) as typeof fetch;
  }

  it("returns the lower-cased e-mails of the enabled users of the realm that was asked for", async () => {
    serve([...realmOf(2), { id: "x", username: "no-mail", enabled: true }]);
    const got = await list("tok", "tenant realm");
    assert.deepEqual([...got].sort(), ["user0@example.org", "user1@example.org"]);
    assert.equal(calls[0].url.pathname, "/admin/realms/tenant%20realm/users");
    assert.equal(calls[0].url.searchParams.get("enabled"), "true");
    assert.equal(calls[0].auth, "Bearer tok");
  });

  it("reads every page of a realm bigger than one (1500 users)", async () => {
    serve(realmOf(1500));
    const got = await list("tok", "big");
    assert.equal(got.size, 1500);
    assert.ok(got.has("user0@example.org") && got.has("user1499@example.org") && got.has("user999@example.org") && got.has("user1000@example.org"));
    assert.ok(calls.length >= 4, "three full pages and the empty one that ends it");
    assert.deepEqual(calls.map((c) => c.url.searchParams.get("first")), ["0", "500", "1000", "1500"]);
  });

  it("is not fooled by a server that serves fewer than it was asked for", async () => {
    serve(realmOf(1500), { cap: 100 });
    assert.equal((await list("tok", "capped")).size, 1500, "a short page is not the last page");
    assert.equal(calls.length, 16);
  });

  it("is an error, not an empty set, when the realm serves no one", async () => {
    serve([]);
    await assert.rejects(list("tok", "empty"), /no enabled user with an e-mail/);
    serve(realmOf(3).map((u) => ({ ...u, enabled: false })));
    await assert.rejects(list("tok", "all-disabled"), /no enabled user/);
    serve([{ id: "1", username: "a", enabled: true }, { id: "2", username: "b", enabled: true }]);
    await assert.rejects(list("tok", "no-mails"), /no enabled user with an e-mail/);
  });

  it("is an error when any request fails, on the first page or a later one, never a partial set", async () => {
    serve(realmOf(1500), { fail: () => new Response("boom", { status: 500 }) });
    await assert.rejects(list("tok", "r"), /HTTP 500/);

    serve(realmOf(1500), { fail: (n) => (n === 2 ? new Response("{}", { status: 503 }) : null) });
    await assert.rejects(list("tok", "r"), /HTTP 503/);

    serve(realmOf(1500), { fail: () => new Response("forbidden", { status: 403 }) });
    await assert.rejects(list("tok", "r"), /HTTP 403/);

    serve(realmOf(10), { fail: () => new TypeError("fetch failed") });
    await assert.rejects(list("tok", "r"), /fetch failed/);
  });

  it("is an error when the answer is not a list", async () => {
    serve(realmOf(3), { fail: () => Response.json({ error: "unknown_error" }) });
    await assert.rejects(list("tok", "r"), /not a list/);
    serve(realmOf(3), { fail: () => new Response("<html>login</html>", { status: 200 }) });
    await assert.rejects(list("tok", "r"));
  });

  it("stops, with an error, when paging does not advance", async () => {
    serve(realmOf(600), { ignoreFirst: true, cap: 100 });
    await assert.rejects(list("tok", "stuck"), /paging did not advance/);
    assert.ok(calls.length <= 3, `read ${calls.length} pages of a server that ignores the offset`);
  });
});
