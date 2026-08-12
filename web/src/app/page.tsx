import { CalendarCheck, ImageIcon, Images, MessageCircle } from "lucide-react";
import Link from "next/link";
import { GradientBackdrop } from "@/components/GradientBackdrop";
import { Wordmark } from "@/components/Wordmark";
import { geistSans } from "@/lib/fonts";

export default function HomePage() {
  return (
    <div className={`flex min-h-screen flex-col ${geistSans.className}`}>
      <GradientBackdrop />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold text-zinc-900">
          <Wordmark />
        </span>
        <Link
          href="/login"
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
          RsvpVault
        </h1>
        {/* Deliberately spans the whole arc, not just the invitation. The
            after-the-day half — one album link sent to everyone who came — is
            the part hosts otherwise chase round a group chat for a week, and
            nobody looking for it would guess an invitation product had it. */}
        <p className="mt-4 max-w-xl text-lg leading-8 text-zinc-600">
          Design an invitation, share one link, and watch the RSVPs come in. When the party&apos;s
          over, send the whole guest list a photo album so everyone&apos;s pictures end up in one
          place — no app for your guests to install, no account for them to create.
        </p>

        <div className="mt-8 flex gap-3">
          <Link
            href="/login"
            className="rounded-full bg-zinc-900 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Get started
          </Link>
        </div>

        {/* Two-up on tablets rather than three-across with one stranded on its
            own row, which is what a fourth card did to the old sm:grid-cols-3. */}
        <ul className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={CalendarCheck} title="Real-time RSVPs">
            Track going, maybe and declined, plus-ones, and dietary notes as they arrive.
          </Feature>
          <Feature icon={ImageIcon} title="Your design">
            Preset templates with custom colours, typography and cover art.
          </Feature>
          <Feature icon={MessageCircle} title="Guestbook">
            Guests leave messages and photos on the invitation itself.
          </Feature>
          <Feature icon={Images} title="Photos after the day">
            Send one shared album to everyone who came — or to your whole guest list — and get
            back the pictures they took.
          </Feature>
        </ul>
      </main>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof CalendarCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Icon className="size-5 text-emerald-600" />
      <h2 className="mt-3 font-medium text-zinc-900">{title}</h2>
      <p className="mt-1 text-sm text-zinc-600">{children}</p>
    </li>
  );
}
