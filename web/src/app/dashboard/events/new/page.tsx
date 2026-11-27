"use client";

import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/browser";
import { createEvent } from "@/lib/api/host";
import { PageHeader } from "../../ui";
import { EventForm } from "../event-form";

export default function NewEventPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard", label: "All events" }}
        eyebrow="New event"
        title="Create your invitation"
        description="Start with the basics and a design. It saves as a draft — nothing is visible to guests until you publish. Next you'll get the event's own page to design the card or video, publish, and invite guests."
      />

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
