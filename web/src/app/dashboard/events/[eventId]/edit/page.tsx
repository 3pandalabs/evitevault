"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { getEvent, updateEvent } from "@/lib/api/host";
import { utcToZonedWallTime } from "@/lib/datetime";
import { EventForm, type EventFormValues } from "../../event-form";

// The API stores absolute instants; the form edits wall-clock time in the
// event's own zone. Converting here rather than in the form keeps the form
// unaware of which representation it was handed.
function toFormValues(ev: Record<string, unknown>): Partial<EventFormValues> {
  const timezone = (ev.timezone as string) ?? undefined;
  const startsAt = ev.startsAt as string | null;
  const endsAt = ev.endsAt as string | null;

  return {
    title: (ev.title as string) ?? "",
    description: (ev.description as string | null) ?? "",
    hostDisplayName: (ev.hostDisplayName as string | null) ?? "",
    startsAt: startsAt && timezone ? utcToZonedWallTime(startsAt, timezone) : undefined,
    endsAt: endsAt && timezone ? utcToZonedWallTime(endsAt, timezone) : "",
    timezone,
    locationName: (ev.locationName as string | null) ?? "",
    locationAddress: (ev.locationAddress as string | null) ?? "",
    locationMapUrl: (ev.locationMapUrl as string | null) ?? "",
    templateId: (ev.templateId as string | null) ?? null,
    allowPlusOnes: (ev.allowPlusOnes as boolean | undefined) ?? true,
    maxPlusOnes: (ev.maxPlusOnes as number | undefined) ?? 2,
    collectDietary: (ev.collectDietary as boolean | undefined) ?? false,
    allowPublicRsvp: (ev.allowPublicRsvp as boolean | undefined) ?? true,
    guestbookEnabled: (ev.guestbookEnabled as boolean | undefined) ?? true,
    showGuestList: (ev.showGuestList as boolean | undefined) ?? false,
    capacity: ev.capacity == null ? "" : String(ev.capacity),
  };
}

export default function EditEventPage() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();

  const [initial, setInitial] = useState<Partial<EventFormValues> | null>(null);
  const [title, setTitle] = useState<string>("");
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEvent(eventId)
      .then((ev) => {
        setTitle(ev.title);
        setPublished(ev.status === "published");
        setInitial(toFormValues(ev as unknown as Record<string, unknown>));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError("Couldn't load this event.");
      });
  }, [eventId, router]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  // The form seeds its fields from `initial` once, on mount, so it must not be
  // rendered before the event has loaded — otherwise every field would be
  // stuck on the create-time defaults.
  if (!initial) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/dashboard/events/${eventId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        Back to {title || "the event"}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Edit event</h1>
      <p className="mt-1 text-sm text-slate-500">
        {published
          ? "This invitation is published — changes are live for guests as soon as you save."
          : "This event is still a draft, so nothing you change here is visible to guests yet."}
      </p>

      <EventForm
        initial={initial}
        submitLabel="Save changes"
        cancelHref={`/dashboard/events/${eventId}`}
        failureMessage="Couldn't save the changes. Check the fields and try again."
        onSubmit={async (input) => {
          try {
            await updateEvent(eventId, input);
            router.push(`/dashboard/events/${eventId}`);
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
              router.replace("/login");
              return;
            }
            throw err;
          }
        }}
      />
    </div>
  );
}
