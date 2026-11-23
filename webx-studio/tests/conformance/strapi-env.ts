// Imported first by strapi.conformance.test.ts: lib/config.ts reads STRAPI_URL
// when it is first imported, so the conformance target has to be in the
// environment before the Strapi adapter is loaded.
if (process.env.CONFORMANCE_STRAPI_URL) process.env.STRAPI_URL = process.env.CONFORMANCE_STRAPI_URL;
export {};
