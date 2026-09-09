export const STUDIO_URL = (process.env.NEXT_PUBLIC_STUDIO_URL || "http://localhost:3001").replace(/\/$/, "");
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@webx.io";

export const SIGNUP_URL = `${STUDIO_URL}/signup`;
export const LOGIN_URL = `${STUDIO_URL}/login`;
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`;
