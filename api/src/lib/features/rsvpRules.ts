// Waitlist + host approval (migration 0015). Pure: the RSVP route asks
// `decideRsvp` what a "going" becomes, and the host routes use
// `approvalProblem` before approving or declining. Tested in rsvpRules.test.ts.
//
// Model: a guest who says "going" but cannot be counted yet is stored with
// rsvp_status = 'waitlisted' (never counted in the headcount) and
// approval_status = 'pending'. `waitlist_reason` says why: the event is full
// ('capacity') or every reply needs the host's OK ('approval'). The host
// approves (-> attending, approval 'approved', one email) or declines
// (-> declined, approval 'declined', no email: a "no" is not chased).

export type RequestedStatus = "attending" | "maybe" | "declined";

export type RsvpRuleInput = {
  requested: RequestedStatus;
  approvalRequired: boolean;
  waitlistEnabled: boolean;
  capacity: number | null;
  /** Attending headcount on the event right now, INCLUDING this guest's current party if attending. */
  headcount: number;
  /** This guest's party (1 + plus-ones) if they are currently attending, else 0. */
  alreadyCounted: number;
  /** The party size they are asking for (1 + plus-ones). */
  partySize: number;
  /** The guest's existing approval decision, if any. */
  approvalStatus: string | null;
};

export type RsvpDecision =
  | { ok: true; status: "attending" | "maybe" | "declined"; approvalStatus: string | null; waitlistReason: null }
  | { ok: true; status: "waitlisted"; approvalStatus: "pending"; waitlistReason: "capacity" | "approval" }
  | { ok: false; error: "at_capacity" | "request_declined" };

export function overCapacity(capacity: number | null, headcount: number, alreadyCounted: number, partySize: number): boolean {
  if (capacity === null) return false;
  return headcount - alreadyCounted + partySize > capacity;
}

export function decideRsvp(i: RsvpRuleInput): RsvpDecision {
  if (i.requested !== "attending") {
    // Maybe / can't make it never wait for anyone. An earlier approval is kept,
    // so switching back to "going" later does not ask the host twice.
    return { ok: true, status: i.requested, approvalStatus: i.approvalStatus === "pending" ? null : i.approvalStatus, waitlistReason: null };
  }

  // The host already said no: asking again would only nag them.
  if (i.approvalStatus === "declined") return { ok: false, error: "request_declined" };

  const approved = i.approvalStatus === "approved";

  if (i.approvalRequired && !approved) {
    return { ok: true, status: "waitlisted", approvalStatus: "pending", waitlistReason: "approval" };
  }

  // An approved guest already holds a place the host chose to give them; they
  // may adjust within it, but growing the party past capacity still waits.
  if (overCapacity(i.capacity, i.headcount, i.alreadyCounted, i.partySize)) {
    if (!i.waitlistEnabled) return { ok: false, error: "at_capacity" };
    return { ok: true, status: "waitlisted", approvalStatus: "pending", waitlistReason: "capacity" };
  }

  return { ok: true, status: "attending", approvalStatus: i.approvalStatus, waitlistReason: null };
}

/** Whether a host decision applies to this guest (only someone waiting can be approved or declined). */
export function approvalProblem(guest: { rsvpStatus: string; approvalStatus: string | null }): "not_waitlisted" | null {
  return guest.rsvpStatus === "waitlisted" && guest.approvalStatus === "pending" ? null : "not_waitlisted";
}

/** What an approval writes. The host may approve over capacity on purpose; the UI warns first. */
export function approvedValues(now: Date) {
  return { rsvpStatus: "attending" as const, approvalStatus: "approved" as const, waitlistReason: null, updatedAt: now };
}

export function declinedValues(now: Date) {
  return { rsvpStatus: "declined" as const, approvalStatus: "declined" as const, waitlistReason: null, updatedAt: now };
}
