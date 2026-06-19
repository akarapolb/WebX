// Central config — all values come from env so WebX Studio is backend-agnostic.
export const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337";
export const SESSION_COOKIE = process.env.WEBX_SESSION_COOKIE || "webx_session";
export const SESSION_TTL = Number(process.env.WEBX_SESSION_TTL || 1800); // seconds
