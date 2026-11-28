// Co-host permissions (migration 0015). Pure, tested in cohosts.test.ts; the
// DB lookup that produces the role is lib/eventAccess.ts.
//
// The owner can do everything. A co-host (an accepted invitation whose
// signed-in email matched) manages the event and its guests, sends what the
// owner could send (as the owner: test mode and the mail guard follow the
// OWNER), and moderates the extras. A co-host can NOT delete the event,
// transfer it, invite or remove co-hosts, or touch paid features (video
// invites, cash gifts) — those stay on the owner's own routes, which still use
// loadOwnedEvent.

export type EventRole = "owner" | "cohost";

export type EventAction =
  | "view"
  | "edit"
  | "publish"
  | "manage_guests"
  | "send_mail"
  | "manage_extras"
  | "delete_event"
  | "transfer"
  | "manage_cohosts"
  | "paid_features";

const COHOST_ALLOWED: ReadonlySet<EventAction> = new Set<EventAction>([
  "view",
  "edit",
  "publish",
  "manage_guests",
  "send_mail",
  "manage_extras",
]);

export function canPerform(role: EventRole | null, action: EventAction): boolean {
  if (role === "owner") return true;
  if (role === "cohost") return COHOST_ALLOWED.has(action);
  return false;
}

export const MAX_COHOSTS = 5;

/** A co-host invitation is accepted only by an account whose email is the invited one. */
export function acceptProblem(
  invite: { status: string; email: string; eventHostId: string },
  user: { id: string; email: string },
): "already_accepted" | "email_mismatch" | "owner_cannot_cohost" | null {
  if (invite.status === "accepted") return "already_accepted";
  if (invite.eventHostId === user.id) return "owner_cannot_cohost";
  if (invite.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) return "email_mismatch";
  return null;
}

/** First names of accepted co-hosts for the invitation ("Hosted by Meera with Sam"). */
export function publicCohostNames(rows: { name: string; status: string }[]): string[] {
  return rows
    .filter((r) => r.status === "accepted")
    .map((r) => r.name.trim().split(/\s+/)[0])
    .filter(Boolean)
    .slice(0, 5);
}
