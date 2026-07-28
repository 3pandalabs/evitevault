"use client";

import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { API_URL } from "@/lib/api/browser";
import { GradientBackdrop } from "@/components/GradientBackdrop";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { WordmarkName, WordmarkTag } from "@/components/Wordmark";
import { geistSans } from "@/lib/fonts";

function ForgotPasswordForm() {
  // Carried over from the sign-in form when it was already filled in, so
  // someone who mistyped a password doesn't retype their address.
  const prefill = useSearchParams().get("email") ?? "";

  const [email, setEmail] = useState(prefill);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // The API answers 204 whether or not the address has an account, so
      // there is nothing to branch on — and deliberately so. Saying "no such
      // account" here would let anyone test which addresses are registered.
      if (!res.ok) {
        setError("Couldn't send that. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
          <p className="text-sm text-emerald-900">
            If <span className="font-medium">{email}</span> has an account, a reset link is on its
            way. It works once and expires in 30 minutes.
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          Nothing arrived? Check the spam folder, then try again — the newest link is the only one
          that works.
        </p>
        <Link href="/login" className="block">
          <Button variant="outline" className="w-full rounded-full">
            <ArrowLeft className="size-4" />
            Back to sign in
          </Button>
        </Link>
      </CardContent>
    );
  }

  return (
    <CardContent>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-zinc-700">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            required
            autoFocus
            className="rounded-lg border-zinc-300 focus-visible:ring-zinc-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
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
          disabled={submitting || !email.trim()}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Send reset link
        </Button>
      </form>

      <Link
        href="/login"
        className="mt-4 block w-full text-center text-sm text-zinc-500 hover:text-zinc-900"
      >
        Back to sign in
      </Link>
    </CardContent>
  );
}

export default function ForgotPasswordPage() {
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
          <CardTitle className="text-zinc-900">Reset your password</CardTitle>
          <CardDescription className="text-zinc-500">
            We&apos;ll email you a link to choose a new one.
          </CardDescription>
        </CardHeader>
        {/* useSearchParams needs a Suspense boundary or the whole route opts
            out of static rendering at build time. */}
        <Suspense fallback={null}>
          <ForgotPasswordForm />
        </Suspense>
      </Card>
    </div>
  );
}
