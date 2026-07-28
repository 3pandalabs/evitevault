"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { API_URL } from "@/lib/api/browser";
import { GradientBackdrop } from "@/components/GradientBackdrop";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { WordmarkName, WordmarkTag } from "@/components/Wordmark";
import { geistSans } from "@/lib/fonts";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-600">
          This link is missing its token. Reset links expire after 30 minutes and only work once —
          ask for a fresh one.
        </p>
        <Link href="/forgot-password" className="block">
          <Button className="w-full rounded-full bg-zinc-900 hover:bg-zinc-700">
            Get a new link
          </Button>
        </Link>
      </CardContent>
    );
  }

  if (done) {
    return (
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
          <p className="text-sm text-emerald-900">
            Password changed. You&apos;ve been signed out everywhere else — sign in with the new
            one.
          </p>
        </div>
        <Link href="/login" className="block">
          <Button className="w-full rounded-full bg-zinc-900 hover:bg-zinc-700">Sign in</Button>
        </Link>
      </CardContent>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Checked here rather than server-side: a mistyped confirmation is a
    // typing mistake, not something the API needs an opinion about.
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        setError(
          res.status === 400
            ? "That link has expired or already been used. Ask for a new one."
            : "Couldn't reset the password. Please try again.",
        );
        return;
      }

      setDone(true);
      router.prefetch("/login");
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CardContent>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-zinc-700">
            New password
          </Label>
          <Input
            id="password"
            type="password"
            required
            minLength={10}
            autoFocus
            className="rounded-lg border-zinc-300 focus-visible:ring-zinc-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <p className="text-xs text-zinc-500">At least 10 characters.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-zinc-700">
            Confirm new password
          </Label>
          <Input
            id="confirm"
            type="password"
            required
            minLength={10}
            className="rounded-lg border-zinc-300 focus-visible:ring-zinc-400"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full rounded-full bg-zinc-900 hover:bg-zinc-700"
          disabled={submitting || password.length < 10}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Change password
        </Button>
      </form>
    </CardContent>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center px-6 ${geistSans.className}`}
    >
      <GradientBackdrop />
      <span className="mb-8 inline-flex items-center">
        <Link href="/" className="text-lg font-semibold text-zinc-900">
          <WordmarkName />
        </Link>
        <WordmarkTag />
      </span>

      <Card className="w-full max-w-sm rounded-2xl border-zinc-200 bg-white/90 shadow-xl shadow-zinc-900/5 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-zinc-900">Choose a new password</CardTitle>
          <CardDescription className="text-zinc-500">
            This signs you out of every other device.
          </CardDescription>
        </CardHeader>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </Card>
    </div>
  );
}
