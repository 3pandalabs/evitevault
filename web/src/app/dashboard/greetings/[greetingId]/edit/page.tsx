"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { getGreeting, updateGreeting } from "@/lib/api/host";
import { PageHeader } from "../../../ui";
import { GreetingForm, type GreetingFormValues } from "../../greeting-form";

export default function EditGreetingPage() {
  const router = useRouter();
  const { greetingId } = useParams<{ greetingId: string }>();

  const [initial, setInitial] = useState<GreetingFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGreeting(greetingId)
      .then((g) =>
        setInitial({
          title: g.title,
          message: g.message ?? "",
          hostDisplayName: g.hostDisplayName ?? "",
          occasion: g.occasion ?? "",
          templateId: g.templateId,
          art: g.themeOverrides?.art ?? null,
          headingFont: g.themeOverrides?.fonts?.heading ?? null,
          bodyFont: g.themeOverrides?.fonts?.body ?? null,
          accent: g.themeOverrides?.palette?.accent ?? null,
          frame: g.themeOverrides?.card?.frame ?? null,
        }),
      )
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError("Couldn't load that greeting.");
      });
  }, [greetingId, router]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!initial) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/greetings", label: "Back to greetings" }}
        eyebrow="Greetings"
        title="Edit greeting"
        description="Change the card or its message, then download, share or email it from the preview."
      />

      <GreetingForm
        initial={initial}
        greetingId={greetingId}
        submitLabel="Save changes"
        cancelHref="/dashboard/greetings"
        failureMessage="Couldn't save the greeting. Check the fields and try again."
        onSubmit={async (input) => {
          try {
            await updateGreeting(greetingId, input);
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
