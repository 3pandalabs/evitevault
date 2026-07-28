"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api/browser";
import { setTokens } from "@/lib/api/host";
import { GradientBackdrop } from "@/components/GradientBackdrop";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { WordmarkName, WordmarkTag } from "@/components/Wordmark";
import { geistSans } from "@/lib/fonts";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "login" ? { email, password } : { email, password, displayName },
        ),
      });

      if (!res.ok) {
        // The register endpoint answers 409 for an address that already exists
        // without confirming it — keep the copy equally uninformative here.
        setError(
          mode === "login"
            ? "Incorrect email or password."
            : "Couldn't create that account. Try signing in instead.",
        );
        return;
      }

      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      setTokens(data.accessToken, data.refreshToken);
      router.push("/dashboard");
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
          <CardTitle className="text-zinc-900">
            {mode === "login" ? "Sign in" : "Create an account"}
          </CardTitle>
          <CardDescription className="text-zinc-500">
            Host events and track RSVPs on RsvpVault.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "register" ? (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-zinc-700">
                  Your name
                </Label>
                <Input
                  id="name"
                  className="rounded-lg border-zinc-300 focus-visible:ring-zinc-400"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-zinc-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                className="rounded-lg border-zinc-300 focus-visible:ring-zinc-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="password" className="text-zinc-700">
                  Password
                </Label>
                {/* Only on the sign-in tab: offering a reset to someone
                    creating an account makes no sense. */}
                {mode === "login" ? (
                  <Link
                    href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                    className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
                  >
                    Forgot password?
                  </Link>
                ) : null}
              </div>
              <Input
                id="password"
                type="password"
                required
                minLength={10}
                className="rounded-lg border-zinc-300 focus-visible:ring-zinc-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {mode === "register" ? (
                <p className="text-xs text-zinc-500">At least 10 characters.</p>
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              className="w-full rounded-full bg-zinc-900 hover:bg-zinc-700"
              disabled={submitting}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="mt-4 w-full text-center text-sm text-zinc-500 hover:text-zinc-900"
          >
            {mode === "login" ? "Need an account?" : "Already have an account?"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
