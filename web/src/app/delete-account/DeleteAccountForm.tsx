"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ApiError } from "@/lib/api/browser";
import { clearTokens, deleteAccount, getTokens } from "@/lib/api/host";

// Same localStorage subscription as the dashboard layout: the server snapshot
// is "signed out", so the page prerenders the logged-out explanation and the
// form appears after hydration for a signed-in host.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function DeleteAccountForm() {
  const router = useRouter();
  const signedIn = useSyncExternalStore(
    subscribe,
    () => getTokens().access !== null,
    () => false,
  );

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        Your account and everything in it have been deleted, and you&apos;ve been signed out. Thanks for using RsvpVault.
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-[15px] leading-7 text-zinc-800">
        <p>
          To delete your account, please <strong>sign in first</strong>, then come back to this page (it&apos;s also
          linked from the top of your dashboard). We ask for your password again before deleting anything.
        </p>
        <Link href="/login" className="mt-4 inline-block">
          <Button className="rounded-full bg-zinc-900 hover:bg-zinc-700">Sign in</Button>
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      // The refresh token's session row is already gone server-side; dropping
      // the local copies finishes the sign-out in this browser.
      clearTokens();
      setDone(true);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("That password isn't right.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Please wait 15 minutes and try again.");
      } else if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        setError("Your session has expired. Please sign in again.");
      } else {
        setError("Couldn't delete your account just now. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-red-200 bg-red-50/50 p-5">
      <p className="text-[15px] leading-7 text-zinc-800">
        This permanently deletes your account, every event you created, all of their guests, RSVPs, guestbook posts,
        announcements and uploaded images, and your saved templates. Invitation links you shared will stop working.{" "}
        <strong>This can&apos;t be undone.</strong> If you want a copy of a guest list, download it from the event first.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="d-password" className="text-zinc-700">
          Your password
        </Label>
        <Input
          id="d-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="d-confirm" className="text-zinc-700">
          Type DELETE to confirm
        </Label>
        <Input id="d-confirm" required autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          className="rounded-full bg-red-600 hover:bg-red-700"
          disabled={busy || !password || confirm.trim() !== "DELETE"}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Delete my account
        </Button>
        <Link href="/dashboard">
          <Button type="button" variant="outline" className="rounded-full">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
