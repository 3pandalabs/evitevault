"use client";

import { FlaskConical, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import {
  adminEvents,
  adminMarkRefunded,
  adminOverview,
  adminSetFlags,
  adminUsers,
  adminVideoOrders,
  createTestHost,
  listTestHosts,
  switchIntoTestHost,
  type AdminEvent,
  type AdminOverview,
  type AdminUser,
  type AdminVideoOrder,
  type TestHost,
} from "@/lib/api/host";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const OVERVIEW: [string, string][] = [
  ["real_hosts", "Real hosts"],
  ["new_hosts_7d", "New hosts (7 days)"],
  ["events", "Events"],
  ["published_events", "Published"],
  ["upcoming_events", "Upcoming"],
  ["guests", "Guests"],
  ["attending_guests", "Attending"],
  ["greetings", "Greetings"],
  ["video_invites_ready", "Videos made"],
  ["video_invites_in_queue", "Videos in queue"],
  ["video_invites_refund_needed", "Refunds needed"],
  ["video_revenue_cents", "Video revenue"],
  ["admins", "Admins"],
  ["test_hosts", "Test hosts"],
  ["internal_accounts", "Internal"],
  ["marked_test_accounts", "Marked test"],
];

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * The admin area. The page is only a display: every call behind it re-reads
 * the caller's role from the database (requireRealAdmin) and answers 403 to
 * anyone else, including a session inside a test host.
 */
export default function AdminPage() {
  const [forbidden, setForbidden] = useState(false);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [orders, setOrders] = useState<AdminVideoOrder[]>([]);
  const [hosts, setHosts] = useState<TestHost[]>([]);
  const [userQ, setUserQ] = useState("");
  const [eventQ, setEventQ] = useState("");
  const [newHost, setNewHost] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const fail = (err: unknown) => {
    if (err instanceof ApiError && err.status === 403) setForbidden(true);
  };

  const loadAll = useCallback(() => {
    adminOverview().then(setOverview).catch(fail);
    adminUsers().then((r) => setUsers(r.users)).catch(fail);
    adminEvents().then((r) => setEvents(r.events)).catch(fail);
    adminVideoOrders().then((r) => setOrders(r.orders)).catch(fail);
    listTestHosts().then((r) => setHosts(r.hosts)).catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    adminOverview()
      .then((o) => {
        if (!alive) return;
        setOverview(o);
        loadAll();
      })
      .catch((err) => {
        if (alive) fail(err);
      });
    return () => {
      alive = false;
    };
  }, [loadAll]);

  if (forbidden) {
    return <p className="text-sm text-slate-600">This page is for RsvpVault admins only.</p>;
  }
  if (!overview) return <Loader2 className="size-5 animate-spin text-slate-400" />;

  async function flag(u: AdminUser, change: Parameters<typeof adminSetFlags>[1]) {
    setBusy(u.id);
    try {
      await adminSetFlags(u.id, change);
      const r = await adminUsers(userQ);
      setUsers(r.users);
      setOverview(await adminOverview());
    } finally {
      setBusy(null);
    }
  }

  async function refunded(o: AdminVideoOrder) {
    setBusy(o.id);
    try {
      await adminMarkRefunded(o.id);
      setOrders((await adminVideoOrders()).orders);
      setOverview(await adminOverview());
    } finally {
      setBusy(null);
    }
  }

  async function addHost() {
    if (!newHost.trim()) return;
    setBusy("new-host");
    try {
      await createTestHost(newHost.trim());
      setNewHost("");
      setHosts((await listTestHosts()).hosts);
    } finally {
      setBusy(null);
    }
  }

  async function enter(h: TestHost) {
    setBusy(h.id);
    try {
      await switchIntoTestHost(h.id);
      window.location.assign("/dashboard");
    } catch {
      setBusy(null);
    }
  }

  const refundQueue = orders.filter((o) => o.refundNeeded && o.status !== "refunded");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {OVERVIEW.map(([k, label]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="text-lg font-semibold">
                  {k === "video_revenue_cents" ? money(overview[k] ?? 0) : (overview[k] ?? 0)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Real hosts and revenue leave out admins, test hosts, internal and marked-test accounts, and test payments.
          </p>
        </CardContent>
      </Card>

      {refundQueue.length ? (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle>Refunds needed ({refundQueue.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-slate-600">
              Paid video invites we couldn&apos;t make. Refund each one in Stripe (payment shown), then mark it here.
            </p>
            {refundQueue.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3">
                <span className="font-medium">{o.eventTitle}</span>
                <span className="text-slate-500">{o.hostEmail}</span>
                <span>{money(o.priceCents)}</span>
                <code className="text-xs text-slate-500">{o.stripePaymentIntent ?? "no payment id"}</code>
                <Button size="sm" variant="outline" className="ml-auto" disabled={busy === o.id} onClick={() => void refunded(o)}>
                  Mark refunded
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4 text-slate-400" />
            Test hosts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-slate-600">
            Separate host accounts to walk the new-host path. They can&apos;t log in by password, pay $0.50 test
            payments, and never email real guests (only your own address). Use the banner to come back.
          </p>
          <div className="flex gap-2">
            <Input value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder="Name, e.g. Test Maya" maxLength={120} />
            <Button onClick={() => void addHost()} disabled={busy === "new-host" || !newHost.trim()}>
              Create
            </Button>
          </div>
          {hosts.map((h) => (
            <div key={h.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
              <span className="font-medium">{h.name}</span>
              <span className="text-xs text-slate-500">{date(h.createdAt)}</span>
              <Button size="sm" variant="outline" className="ml-auto" disabled={busy === h.id} onClick={() => void enter(h)}>
                Switch into
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              adminUsers(userQ).then((r) => setUsers(r.users)).catch(fail);
            }}
          >
            <Input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="Search email or name" />
            <Button type="submit" variant="outline">
              <Search className="size-4" />
            </Button>
          </form>
          <div className="divide-y divide-slate-100 text-sm">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 break-all font-medium">{u.email}</span>
                {u.role === "admin" ? <Badge variant="outline">admin</Badge> : null}
                {u.testHost ? <Badge variant="outline">test host</Badge> : null}
                {u.isInternal ? <Badge variant="outline">internal{u.internalLabel ? ` · ${u.internalLabel}` : ""}</Badge> : null}
                {u.markedTest ? <Badge variant="outline">marked test</Badge> : null}
                <span className="text-xs text-slate-500">
                  {date(u.createdAt)} · {u.events} events · {u.greetings} greetings
                </span>
                {!u.testHost ? (
                  <span className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === u.id}
                      onClick={() => {
                        const label = u.isInternal ? null : window.prompt("Internal label (optional)", "") ?? "";
                        void flag(u, { isInternal: !u.isInternal, internalLabel: label || null });
                      }}
                    >
                      {u.isInternal ? "Unset internal" : "Internal"}
                    </Button>
                    {u.role === "host" ? (
                      <Button size="sm" variant="ghost" disabled={busy === u.id} onClick={() => void flag(u, { markedTest: !u.markedTest })}>
                        {u.markedTest ? "Unmark test" : "Mark test"}
                      </Button>
                    ) : null}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              adminEvents(eventQ).then((r) => setEvents(r.events)).catch(fail);
            }}
          >
            <Input value={eventQ} onChange={(e) => setEventQ(e.target.value)} placeholder="Search title or host email" />
            <Button type="submit" variant="outline">
              <Search className="size-4" />
            </Button>
          </form>
          <div className="divide-y divide-slate-100 text-sm">
            {events.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-medium">{e.title}</span>
                <Badge variant="outline">{e.status}</Badge>
                {e.hostTest ? <Badge variant="outline">ours</Badge> : null}
                <span className="text-xs text-slate-500">
                  {e.hostEmail} · {date(e.startsAt)} · {e.attending}/{e.guests} attending
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Video invite orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-100 text-sm">
            {orders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-medium">{o.eventTitle}</span>
                <Badge variant="outline">{o.tier}</Badge>
                <Badge variant="outline">{o.status}</Badge>
                {o.testMode ? <Badge variant="outline">test</Badge> : null}
                {o.refundNeeded && o.status !== "refunded" ? <Badge variant="outline">refund needed</Badge> : null}
                <span className="text-xs text-slate-500">
                  {o.hostEmail} · {o.priceCents ? money(o.priceCents) : "free"} · {o.provider ?? "—"} · {date(o.createdAt)}
                </span>
                {o.error ? <span className="w-full truncate text-xs text-red-600">{o.error}</span> : null}
              </div>
            ))}
            {orders.length === 0 ? <p className="py-2 text-slate-500">No orders yet.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
