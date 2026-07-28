"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/browser";
import { createEvent } from "@/lib/api/host";
import { EventForm } from "../event-form";

export default function NewEventPage() {
  const router = useRouter();

  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        Back to events
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">New event</h1>
      <p className="mt-1 text-sm text-slate-500">
        This saves as a draft — nothing is visible to guests until you publish it. You can add a
        cover image after saving.
      </p>

      <EventForm
        submitLabel="Save draft"
        cancelHref="/dashboard"
        failureMessage="Couldn't create the event. Check the fields and try again."
        onSubmit={async (input) => {
          try {
            const created = await createEvent(input);
            // Straight to the detail page, which is where cover art, guests
            // and publishing live. The event is a draft until published, so
            // nothing is public yet.
            router.push(`/dashboard/events/${created.id}`);
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
