// The four form inboxes (complaints, applications, registrations, contact messages) are read from two places while the public
// site moves from the content engine to the control plane (docs/target-architecture.md, track C5): the submissions the engine
// already holds, and the ones webx-control's form routes have taken since. Like the cookie-consent log, they are listed as one
// (lib/cms/consent-merge.ts) and nothing is copied, so the public site can be switched at any moment; a submission is read,
// changed and deleted where it lives.
//
// Personal data is encrypted in the control plane, so what is filtered or sorted on there is limited to the fields below.
//
// No "server-only" import: it is plain code, so tests can load it.
import type { EntryQuery } from "./types";
import { scopedControlQuery } from "./consent-merge";

/** The form types by their control-plane collection name -> their content type uid. */
export const FORM_UID_OF_COLLECTION: Record<string, string> = {
  complaint: "api::complaint.complaint",
  application: "api::application.application",
  registration: "api::registration.registration",
  "contact-message": "api::contact-message.contact-message",
};

export const FORM_UIDS: ReadonlySet<string> = new Set(Object.values(FORM_UID_OF_COLLECTION));

/** What a list of the control plane's submissions may be filtered on: not name, email, phone, firstname or lastname, which are encrypted. */
export const FORM_FILTER_FIELDS: ReadonlySet<string> = new Set(["createdAt", "ref", "subject", "type", "stage", "handled", "verified", "utype", "position", "jobId", "anonymous", "agency", "username"]);

/** A query for the control plane's submissions: the filters it can apply, and the workspace by key (never the caller's). */
export function controlFormQuery(query: EntryQuery | undefined, tenantKey: string | null): EntryQuery {
  return scopedControlQuery(query, tenantKey, FORM_FILTER_FIELDS);
}

/** A submission from the control plane as the editor screens expect it: a file it holds gets a `url` that Studio serves
 * (app/api/cms/forms-file/[id]), as the engine's media objects have one. */
export function decorateFormRow<T extends Record<string, any>>(row: T): T {
  const out: Record<string, any> = { ...row };
  for (const f of ["attachment", "resume"]) {
    const a = out[f];
    if (a && typeof a === "object" && typeof a.documentId === "string") out[f] = { ...a, url: `/api/cms/forms-file/${encodeURIComponent(a.documentId)}` };
  }
  return out as T;
}

/** The fields of an editor's update that may reach a submission held in the control plane: the reference, the workspace and the
 * file are the server's, and the row's identity and times are not for the caller to set. */
export function editableFormFields(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  const owned = new Set(["tenantKey", "tenant", "ref", "attachment", "resume", "documentId", "id", "createdAt", "updatedAt", "publishedAt", "createdBy", "updatedBy"]);
  for (const k of Object.keys(data)) if (!owned.has(k)) out[k] = data[k];
  return out;
}
