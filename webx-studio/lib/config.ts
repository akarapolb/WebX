// Central config — all values come from env so WebX Studio is backend-agnostic.
export const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337";
export const SESSION_COOKIE = process.env.WEBX_SESSION_COOKIE || "webx_session";
export const SESSION_TTL = Number(process.env.WEBX_SESSION_TTL || 1800); // seconds
// refresh token (Strapi 5 rotating, single-use) — used to mint fresh access tokens
export const REFRESH_COOKIE = process.env.WEBX_REFRESH_COOKIE || "webx_refresh";
export const REFRESH_TTL = Number(process.env.WEBX_REFRESH_TTL || 60 * 60 * 24); // 24h
