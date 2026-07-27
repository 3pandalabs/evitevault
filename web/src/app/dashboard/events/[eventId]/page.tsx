"use client";

import { Copy, Download, Eye, Loader2, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  downloadGuestCsv,
  getAnalytics,
  getEvent,
  listGuests,
  type Analytics,
  type EventSummary,
  type GuestRow,
} from "@/lib/api/host";
import { Badge, rsvpVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Three independent reads — run them together rather than waterfalling,
      // the detail view is useless until all three land anyway.
      const [ev, gs, an] = await Promise.all([
        getEvent(eventId),
        listGuests(eventId),
        getAnalytics(eventId),
      ]);
      setEvent(ev as unknown as EventSummary);
      setGuests(gs.guests);
      setAnalytics(an);
    } catch {
      setError("Couldn't load this event.");
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!event || !analytics) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const invitationUrl = `${SITE_URL}/e/${event.slug}`;

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-slate-100 px-2 py-1 text-xs">{invitationUrl}</code>
            <Button variant="ghost" size="sm" onClick={() => copy(invitationUrl, "link")}>
              <Copy className="size-3.5" />
              {copied === "link" ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <Button variant="outline" onClick={() => downloadGuestCsv(eventId, event.slug)}>
          <Download className="size-4" />
          Download CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Going" value={`${analytics.rsvp.headcount}`} hint={`${analytics.rsvp.attending} responded yes`} />
        <Stat label="Awaiting reply" value={`${analytics.rsvp.pending}`} />
        <Stat
          label="Response rate"
          value={`${Math.round(analytics.responseRate * 100)}%`}
          hint={`${analytics.rsvp.invited} invited`}
        />
        <Stat
          label="Views"
          value={`${analytics.views.total}`}
          hint={`${analytics.views.uniqueVisitors} unique`}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-slate-400" />
            Guest list
          </CardTitle>
          <span className="text-sm text-slate-500">{guests.length} guests</span>
        </CardHeader>
        <CardContent>
          {guests.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No guests yet. Share the invitation link, or add guests to send personal invites.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">RSVP</th>
                    <th className="pb-2 pr-4 font-medium">Party</th>
                    <th className="pb-2 pr-4 font-medium">Notes</th>
                    <th className="pb-2 font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((g) => (
                    <tr key={g.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{g.name}</div>
                        {g.email ? <div className="text-xs text-slate-500">{g.email}</div> : null}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={rsvpVariant[g.rsvpStatus]}>{g.rsvpStatus}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {g.rsvpStatus === "attending" ? 1 + g.plusOnes : "—"}
                      </td>
                      <td className="max-w-[16rem] py-3 pr-4 text-slate-600">
                        {[g.dietaryNotes, g.message].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          {g.firstViewedAt ? (
                            <Eye className="size-3.5 text-slate-400" aria-label="Has opened the invitation" />
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              copy(`${invitationUrl}?t=${g.inviteToken}`, g.id)
                            }
                          >
                            {copied === g.id ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
