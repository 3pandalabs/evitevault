import { CalendarCheck, ImageIcon, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">by 3PandaLabs</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">EviteVault</h1>
      <p className="mt-4 max-w-xl text-lg text-slate-600">
        Design an invitation, share one link, and watch the RSVPs come in — no app for your
        guests to install, no account for them to create.
      </p>

      <div className="mt-8 flex gap-3">
        <Link href="/login">
          <Button size="lg">Get started</Button>
        </Link>
      </div>

      <ul className="mt-16 grid gap-8 sm:grid-cols-3">
        <Feature icon={CalendarCheck} title="Real-time RSVPs">
          Track going, maybe and declined, plus-ones, and dietary notes as they arrive.
        </Feature>
        <Feature icon={ImageIcon} title="Your design">
          Preset templates with custom colours, typography and cover art.
        </Feature>
        <Feature icon={MessageCircle} title="Guestbook">
          Guests leave messages and photos on the invitation itself.
        </Feature>
      </ul>
    </main>
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
      <Icon className="size-5 text-slate-400" />
      <h2 className="mt-3 font-medium">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{children}</p>
    </li>
  );
}
