"use client";

import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/browser";
import { createGreeting } from "@/lib/api/host";
import { PageHeader } from "../../ui";
import { GreetingForm } from "../greeting-form";

export default function NewGreetingPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/greetings", label: "Back to greetings" }}
        eyebrow="Greetings"
        title="New greeting"
        description="A designed card with a message — no date, place or RSVP. Save it, then send it."
      />

      <GreetingForm
        submitLabel="Save greeting"
        cancelHref="/dashboard/greetings"
        failureMessage="Couldn't create the greeting. Check the fields and try again."
        onSubmit={async (input) => {
          try {
            await createGreeting(input);
            router.push("/dashboard/greetings");
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
