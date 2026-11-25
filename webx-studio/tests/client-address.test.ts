// The address Studio's rate limits count a request against (lib/clientAddress.ts): the entry our own proxy added to
// X-Forwarded-For, never one the caller wrote. The same cases as webx-control's visitors.rs client_ip.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientAddress, trustedProxies } from "../lib/clientAddress";

describe("clientAddress", () => {
  it("is the entry our own proxy added, not one the caller wrote", () => {
    assert.equal(clientAddress("6.6.6.6, 203.0.113.9", 1), "203.0.113.9");
    assert.equal(clientAddress("203.0.113.9", 1), "203.0.113.9");
    assert.equal(clientAddress("6.6.6.6, 203.0.113.9, 10.0.0.2", 2), "203.0.113.9");
    assert.equal(clientAddress("1.1.1.1, 203.0.113.9", 1), clientAddress("2.2.2.2, 203.0.113.9", 1), "a caller who rotates what they write gets one bucket");
  });

  it("is one shared bucket when the header cannot be believed", () => {
    assert.equal(clientAddress(null, 1), "unknown", "no header: the request did not come through a proxy");
    assert.equal(clientAddress(undefined, 1), "unknown");
    assert.equal(clientAddress("203.0.113.9", 0), "unknown", "no proxies: the header is ignored whatever it says");
    assert.equal(clientAddress("203.0.113.9", 2), "unknown", "fewer entries than proxies");
    assert.equal(clientAddress("not-an-address", 1), "unknown");
    assert.equal(clientAddress("unknown, <script>", 1), "unknown", "garbage never becomes a key");
    assert.equal(clientAddress("999.1.1.1", 1), "unknown");
    assert.equal(clientAddress("", 1), "unknown");
  });

  it("drops a port or brackets, and counts an IPv6 address as its /64", () => {
    assert.equal(clientAddress("203.0.113.9:51234", 1), "203.0.113.9");
    assert.equal(clientAddress("[2001:db8:1:2:3:4:5:6]:443", 1), "2001:db8:1:2::/64");
    assert.equal(clientAddress("[2001:db8:1:2:3:4:5:6]", 1), "2001:db8:1:2::/64");
    assert.equal(clientAddress("2001:DB8:1:2:ffff:ffff:ffff:ffff", 1), clientAddress("2001:db8:1:2::1", 1), "the rest of the address buys nothing");
    assert.notEqual(clientAddress("2001:db8:1:3::1", 1), clientAddress("2001:db8:1:2::1", 1), "another /64 is another caller");
    assert.equal(clientAddress("::ffff:203.0.113.9", 1), "203.0.113.9", "an IPv4 address written as IPv6 is the IPv4 address");
    assert.equal(clientAddress("::1", 1), "0:0:0:0::/64");
    assert.equal(clientAddress("1:2:3:4:5:6:7:8:9", 1), "unknown");
    assert.equal(clientAddress("2001::db8::1", 1), "unknown", "two :: is not an address");
  });
});

describe("trustedProxies", () => {
  it("is one unless set, and 0 means none", () => {
    assert.equal(trustedProxies(undefined), 1);
    assert.equal(trustedProxies(""), 1);
    assert.equal(trustedProxies("  "), 1);
    assert.equal(trustedProxies("0"), 0);
    assert.equal(trustedProxies("2"), 2);
    assert.equal(trustedProxies("abc"), 1);
    assert.equal(trustedProxies("-3"), 1);
  });
});
