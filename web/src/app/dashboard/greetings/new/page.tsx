"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/browser";
import { createGreeting } from "@/lib/api/host";
import { GreetingForm } from "../greeting-form";

export default function NewGreetingPage() {
  const router = useRouter();

  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        Back to dashboard
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">New greeting</h1>
      <p className="mt-1 text-sm text-slate-500">
        A designed card with a message — no date, place or RSVP. Save it, then send it.
      </p>

      <GreetingForm
        submitLabel="Save greeting"
        cancelHref="/dashboard"
        failureMessage="Couldn't create the greeting. Check the fields and try again."
        onSubmit={async (input) => {
          try {
            await createGreeting(input);
            router.push("/dashboard");
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
