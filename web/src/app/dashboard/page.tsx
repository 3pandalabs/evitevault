"use client";

import { CalendarDays, Loader2, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { listEvents, type EventSummary } from "@/lib/api/host";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatEventDate, formatRelative } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEvents()
      .then((data) => setEvents(data.events))
      .catch((err) => {
        // A 401 here means the refresh token is gone too (hostFetch already
        // retried), so there is nothing to do but send them back to sign in.
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError("Couldn't load your events.");
      });
  }, [router]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!events) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your events</h1>
      </div>

      {events.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <p className="font-medium">No events yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create your first invitation to start collecting RSVPs.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {events.map((ev) => (
            <li key={ev.id}>
              <Link href={`/dashboard/events/${ev.id}`} className="block">
                <Card className="transition hover:border-slate-300 hover:shadow">
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate font-medium">{ev.title}</h2>
                        {ev.status !== "published" ? (
                          <Badge variant="outline">{ev.status}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" />
                          {formatEventDate(ev.startsAt, ev.timezone)} ({formatRelative(ev.startsAt)})
                        </span>
                        {ev.locationName ? (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-3.5" />
                            {ev.locationName}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Users className="size-4 text-slate-400" />
                        {ev.headcount}
                        {ev.capacity ? ` / ${ev.capacity}` : ""}
                      </span>
                      <div className="flex gap-1.5">
                        <Badge variant="attending">{ev.attending} yes</Badge>
                        <Badge variant="maybe">{ev.maybe} maybe</Badge>
                        <Badge variant="pending">{ev.pending} awaiting</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
