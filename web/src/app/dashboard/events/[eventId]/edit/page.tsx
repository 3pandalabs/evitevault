"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { getEvent, updateEvent, type EventInput } from "@/lib/api/host";
import { utcToZonedWallTime } from "@/lib/datetime";
import { formatEventDate, formatEventTime, formatTimeZoneLabel } from "@/lib/utils";
import { EventForm, type EventFormValues } from "../../event-form";
import { NotifyGuestsDialog, type EventChange } from "./notify-guests-dialog";

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

// "" and null both mean "no address"; a trailing space is not a change.
const same = (a?: string | null, b?: string | null) => (a ?? "").trim() === (b ?? "").trim();
const sameInstant = (a?: string | null, b?: string | null) =>
  a == null || b == null ? a == b : new Date(a).getTime() === new Date(b).getTime();

function describeWhen(input: { startsAt: string; endsAt?: string | null; timezone: string }) {
  const start = `${formatEventDate(input.startsAt, input.timezone)}, ${formatEventTime(input.startsAt, input.timezone)}`;
  const end = input.endsAt ? ` – ${formatEventTime(input.endsAt, input.timezone)}` : "";
  return `${start}${end} ${formatTimeZoneLabel(input.startsAt, input.timezone)}`;
}

function describeWhere(input: { locationName?: string | null; locationAddress?: string | null }) {
  return [input.locationName, input.locationAddress].filter(Boolean).join(", ");
}

/**
 * Only time and place. A guest has already acted on those — booked a sitter,
 * planned a drive — so a change to either is worth an email; a reworded
 * description or a new plus-one limit is not.
 */
function detectChanges(before: EventInput, after: EventInput): EventChange[] {
  const changes: EventChange[] = [];

  if (
    !sameInstant(before.startsAt, after.startsAt) ||
    !sameInstant(before.endsAt, after.endsAt) ||
    !same(before.timezone, after.timezone)
  ) {
    changes.push({ label: "When", from: describeWhen(before), to: describeWhen(after) });
  }

  if (!same(before.locationName, after.locationName) || !same(before.locationAddress, after.locationAddress)) {
    changes.push({ label: "Where", from: describeWhere(before), to: describeWhere(after) });
  }

  return changes;
}

export default function EditEventPage() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();

  const [initial, setInitial] = useState<Partial<EventFormValues> | null>(null);
  // The event exactly as it was loaded. Kept apart from `initial` (which is
  // form-shaped) so the saved values can be diffed against what the guests
  // were last told.
  const [original, setOriginal] = useState<EventInput | null>(null);
  const [title, setTitle] = useState<string>("");
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<{
    changes: EventChange[];
    body: string;
  } | null>(null);

  useEffect(() => {
    getEvent(eventId)
      .then((ev) => {
        setTitle(ev.title);
        setPublished(ev.status === "published");
        setOriginal(ev as unknown as EventInput);
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

            // Offered only for a published event: on a draft nobody has been
            // told anything yet, so there is nothing to correct.
            const changes = published && original ? detectChanges(original, input) : [];
            if (changes.length > 0) {
              setPendingNotice({
                changes,
                body: [
                  `The details for ${input.title} have changed.`,
                  "",
                  ...changes.map((c) => `${c.label}: ${c.to}`),
                  "",
                  "Sorry for the change — the invitation has the latest details.",
                ].join("\n"),
              });
              return;
            }

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

      {pendingNotice ? (
        <NotifyGuestsDialog
          eventId={eventId}
          eventTitle={title}
          changes={pendingNotice.changes}
          defaultBody={pendingNotice.body}
          onDone={() => router.push(`/dashboard/events/${eventId}`)}
        />
      ) : null}
    </div>
  );
}
