"use client";

import { Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { acceptCohostInvite, getCohostInvite, type CohostInvite } from "@/lib/api/extras";
import { clearTokens, getTokens } from "@/lib/api/host";
import { GradientBackdrop } from "@/components/GradientBackdrop";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WordmarkName, WordmarkTag } from "@/components/Wordmark";
import { geistSans } from "@/lib/fonts";
import { formatEventDate } from "@/lib/utils";

const PROBLEMS: Record<string, string> = {
  email_mismatch: "This invitation was sent to a different email address. Sign in with that address to accept it.",
  owner_cannot_cohost: "This is your own event.",
  already_accepted: "Someone has already accepted this invitation.",
};

const PENDING = "ev_pending_cohost";

// Accepting a co-host invitation. Outside /dashboard on purpose: the
// dashboard layout sends signed-out visitors to /login and the token would be
// lost; here it is kept in sessionStorage and the login page comes back.
function AcceptCohost() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [invite, setInvite] = useState<CohostInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const has = getTokens().access !== null;
    try {
      if (token) sessionStorage.setItem(PENDING, token);
    } catch {
      // ignore
    }
    let live = true;
    const done = (fn: () => void) => live && fn();
    if (!has || !token) {
      Promise.resolve().then(() => done(() => setSignedIn(has)));
    } else {
      getCohostInvite(token)
        .then((i) => done(() => (setInvite(i), setSignedIn(true))))
        .catch((err) =>
          done(() => {
            if (err instanceof ApiError && err.status === 401) setSignedIn(false);
            else {
              setSignedIn(true);
              setError("This invitation link isn't valid any more.");
            }
          }),
        );
    }
    return () => {
      live = false;
    };
  }, [token]);

  async function accept() {
    setBusy(true);
    try {
      const r = await acceptCohostInvite(token);
      try {
        sessionStorage.removeItem(PENDING);
      } catch {
        // ignore
      }
      router.push(`/dashboard/events/${r.eventId}`);
    } catch (err) {
      setError(PROBLEMS[err instanceof ApiError ? err.code : ""] ?? "Couldn't accept. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <CardContent className="text-sm text-zinc-600">This link is missing its token.</CardContent>;
  if (signedIn === null) return <CardContent><Loader2 className="size-5 animate-spin text-zinc-400" /></CardContent>;
  if (!signedIn) {
    return (
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-600">Sign in, or create a free account, with the email address the invitation was sent to. You&apos;ll come straight back here.</p>
        <Link href="/login" className="block">
          <Button className="w-full rounded-full bg-zinc-900 hover:bg-zinc-700">Sign in or create an account</Button>
        </Link>
      </CardContent>
    );
  }

  return (
    <CardContent className="space-y-4">
      {invite ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="font-medium text-zinc-900">{invite.title}</p>
          <p className="text-sm text-zinc-500">{formatEventDate(invite.startsAt, invite.timezone)}</p>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {invite?.alreadyYours ? (
        <Link href={`/dashboard/events/${invite.eventId}`} className="block">
          <Button className="w-full rounded-full bg-zinc-900 hover:bg-zinc-700">Open the event</Button>
        </Link>
      ) : invite?.problem ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-700">
            {PROBLEMS[invite.problem]} {invite.problem === "email_mismatch" ? `(${invite.invitedEmailHint})` : ""}
          </p>
          {invite.problem === "email_mismatch" ? (
            <Button
              variant="outline"
              className="w-full rounded-full"
              onClick={() => {
                clearTokens();
                router.push("/login");
              }}
            >
              Sign in with a different account
            </Button>
          ) : null}
        </div>
      ) : invite ? (
        <Button className="w-full rounded-full bg-zinc-900 hover:bg-zinc-700" disabled={busy} onClick={accept}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
          Accept and co-host
        </Button>
      ) : null}
    </CardContent>
  );
}

export default function CohostPage() {
  return (
    <div className={`flex min-h-screen flex-col items-center justify-center px-4 ${geistSans.className}`}>
      <GradientBackdrop />
      <span className="mb-8 inline-flex items-center">
        <Link href="/" className="text-lg font-semibold text-zinc-900">
          <WordmarkName />
        </Link>
        <WordmarkTag />
      </span>
      <Card className="w-full max-w-sm rounded-2xl border-zinc-200 bg-white/90 shadow-xl shadow-zinc-900/5 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-zinc-900">Co-host an event</CardTitle>
          <CardDescription className="text-zinc-500">Manage the guest list and replies together with the host.</CardDescription>
        </CardHeader>
        <Suspense fallback={null}>
          <AcceptCohost />
        </Suspense>
      </Card>
    </div>
  );
}
