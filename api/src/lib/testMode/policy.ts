// Admin tools: pure decisions. No database (see index.ts beside it).
// COPIED in shape from AdVault's api/src/lib/testMode/policy.ts (copy-not-import,
// like every shared piece in this org), adapted to RsvpVault: roles are
// "host" | "admin", and the thing that must never leak out of a test is EMAIL
// TO REAL GUESTS rather than ad spend.
//
// Four kinds of account besides an ordinary host:
//
//   - Admin in "Test as host" (users.test_as_host): treated exactly like a
//     host in host flows; paid video invites cost TEST_PRICE_CENTS (50 cents,
//     tagged test_mode=1 at Stripe, excluded from revenue).
//   - Test host (users.test_owner_id = the admin): an account an admin made
//     and switches into. Always test mode, *.invalid email, random password
//     nobody knows (login refused).
//   - Internal (users.is_internal): 3PandaLabs' own account. NOT test mode:
//     real prices, real email. Only excluded from customer counts/revenue.
//   - Marked test (users.marked_test): an ordinary sign-up that is really ours
//     (Play reviewer, QA). Works exactly like a host; only excluded from
//     counts/revenue.
//
// Every host-flow check that would read `role === "admin"` goes through
// here. Admin pages and APIs (requireRealAdmin, /dashboard/admin) read the
// REAL role from the database, so an admin can always switch back.

export type Role = "host" | "admin";

export type Subject = {
  role: string | null | undefined;
  testAsHost?: boolean | null;
  /** Non-null = an admin's test host: always test mode. */
  testOwnerId?: string | null;
};

/** Stripe's test-path price: every paid charge made in test mode. */
export const TEST_PRICE_CENTS = 50;

/** A test host an admin created (users.test_owner_id set). */
export function isTestHost(s: Pick<Subject, "testOwnerId">): boolean {
  return typeof s.testOwnerId === "string" && s.testOwnerId.length > 0;
}

/** An admin testing as a host, or an admin's test host. */
export function inTestMode(s: Subject): boolean {
  if (isTestHost(s)) return true;
  return s.role === "admin" && s.testAsHost === true;
}

/** The role host flows act on: an admin in test mode is a host. Never for admin routes. */
export function effectiveRole(s: Subject): Role | undefined {
  if (s.role !== "admin" && s.role !== "host") return undefined;
  return inTestMode(s) ? "host" : s.role;
}

/** Only an admin may switch test mode (the flag means nothing on a non-admin). */
export function mayToggleTestMode(role: string | null | undefined): boolean {
  return role === "admin";
}

/** The amount actually charged: the real price, or the test price in test mode. Free stays free. */
export function chargeCents(realCents: number, testMode: boolean): number {
  if (realCents <= 0) return 0;
  return testMode ? TEST_PRICE_CENTS : realCents;
}

/** Test hosts get a synthetic address under the reserved .invalid TLD (RFC 2606). */
export function isUndeliverableEmail(email: string | null | undefined): boolean {
  return !!email && /\.invalid$/i.test(email.trim());
}

/** The admin owner of a test host may switch into it; nobody else. */
export function maySwitchInto(args: {
  actorOwnerId: string;
  target: { testOwnerId: string | null } | null | undefined;
}): boolean {
  return !!args.target && args.target.testOwnerId === args.actorOwnerId;
}

// ---------------------------------------------------------------------------
// Guest email in test mode.
//
// THE SAFE OPTION, chosen deliberately: a host in test mode (admin testing as
// host, or a test host) sends NO email to guests at all, except to the
// addresses in `safeTo` = the real admin's own login email. Everything else
// is suppressed and reported as "test: not sent". An admin can still see a
// real invitation arrive by adding themselves as a guest.
//
// Why not "allow our own domain": guest lists are typed by hand and pasted
// from contacts; one real friend's address in a test event would get a real
// invitation to a fake party. An allowlist of exactly one known address can't
// leak.
// ---------------------------------------------------------------------------

export type MailGuard = { testMode: boolean; safeTo: string[] };

export function guestMailAllowed(guard: MailGuard, to: string): boolean {
  if (!guard.testMode) return true;
  const addr = to.trim().toLowerCase();
  return guard.safeTo.some((s) => s.trim().toLowerCase() === addr);
}

/** Splits messages into the ones that may go and the ones a test suppresses. */
export function splitGuestMail<T extends { to: string }>(guard: MailGuard, messages: T[]): { send: T[]; suppressed: T[] } {
  const send: T[] = [];
  const suppressed: T[] = [];
  for (const m of messages) (guestMailAllowed(guard, m.to) ? send : suppressed).push(m);
  return { send, suppressed };
}

// ---------------------------------------------------------------------------
// Counting real customers. Admins, test hosts, internal and marked-test
// accounts are all ours; none of them is a customer.
// ---------------------------------------------------------------------------

export type CountSubject = Subject & { isInternal?: boolean | null; markedTest?: boolean | null };

export function isRealCustomer(s: CountSubject): boolean {
  return s.role === "host" && !isTestHost(s) && !s.isInternal && !s.markedTest;
}

/** Marking an account "test" is for ordinary sign-ups only. */
export function mayMarkTest(s: CountSubject): boolean {
  return s.role === "host" && !isTestHost(s);
}

/** Flagging "internal" is for real accounts, never an admin's test host. */
export function mayMarkInternal(s: CountSubject): boolean {
  return !isTestHost(s);
}
