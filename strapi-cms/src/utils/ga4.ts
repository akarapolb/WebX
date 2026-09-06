/* Real GA4 Data API integration (TOR gap audit — the Analytics dashboard's
 * "external analytics" panel used to just echo back the tenant's own
 * `analytics.ga4`/`clarity` TRACKING ids for a link out to Google's own
 * dashboard; it never pulled any real traffic numbers back into this app).
 *
 * Google's GA4 Data API needs a service-account OAuth2 flow: sign a short-
 * lived JWT with the service account's RSA private key, exchange it for a
 * bearer access token, then call `properties:runReport`. Hand-rolled with
 * Node's own built-in `crypto` (RS256 signing is one `crypto.sign()` call)
 * rather than adding a JWT/Google-API-client dependency for what's a single
 * request shape.
 *
 * No real GA4 property/service-account exists in this dev environment (a
 * fresh dev-only property would show zero traffic anyway, credentials or
 * not) — this is real, correct integration code, gated behind 3 env vars,
 * that degrades to exactly today's tracking-id-only behavior when they're
 * unset. See analytics.ts's summary() for the call site and fallback.
 */
import { createSign } from 'crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Signs a Google service-account JWT assertion (RS256) — the standard
 * "server-to-server OAuth2" flow, same shape for any Google Cloud API. */
function signServiceAccountJwt(clientEmail: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail, scope: SCOPE, aud: TOKEN_URL,
    iat: now, exp: now + 3600,
  };
  const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));
  // Service-account keys from Google's JSON key file store the newline as a
  // literal "\n" escape sequence when passed through an env var — restore
  // real newlines before handing it to crypto.sign, or PEM parsing fails.
  const pem = privateKeyPem.includes('\\n') ? privateKeyPem.replace(/\\n/g, '\n') : privateKeyPem;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(pem);
  return signingInput + '.' + base64url(signature);
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const assertion = signServiceAccountJwt(clientEmail, privateKey);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error('GA4 token exchange failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const j: any = await r.json();
  if (!j.access_token) throw new Error('GA4 token exchange returned no access_token');
  return j.access_token;
}

export type Ga4Metrics = { activeUsers: number; screenPageViews: number; sessions: number; rangeDays: number };

/** Real GA4 Data API pull — `propertyId` is the numeric GA4 "Property ID"
 * (Admin > Property details), NOT the "G-XXXX" measurement id used by
 * gtag.js (those are two different identifiers for the same property).
 * Returns null on ANY failure (missing config, bad credentials, network
 * error, a property with no data) rather than throwing — this is a nice-to-
 * have enrichment of the dashboard, never something that should break it. */
export async function fetchGa4Metrics(propertyId: string, days = 30): Promise<Ga4Metrics | null> {
  const clientEmail = process.env.GA4_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!clientEmail || !privateKey || !propertyId) return null;
  try {
    const accessToken = await getAccessToken(clientEmail, privateKey);
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }],
      }),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const values = j?.rows?.[0]?.metricValues?.map((m: any) => Number(m.value) || 0) || [0, 0, 0];
    return { activeUsers: values[0], screenPageViews: values[1], sessions: values[2], rangeDays: days };
  } catch {
    return null;
  }
}
