import {
  CalendarCheck,
  ImageIcon,
  Images,
  MessageCircle,
  QrCode,
  SlidersHorizontal,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GradientBackdrop } from "@/components/GradientBackdrop";
import { Wordmark } from "@/components/Wordmark";
import { geistSans } from "@/lib/fonts";
import { SITE_URL } from "@/lib/site";

// Set here rather than in the root layout: a canonical belongs to one page, and
// a layout-level one would have every route in the app claim to be "/".
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// The FAQ is one array rendered twice — once as the visible list, once as
// FAQPage JSON-LD. A single source means the structured data cannot drift from
// the page, which is both the rule Google enforces and the thing that silently
// rots when the two are maintained separately.
const FAQ: { q: string; a: string }[] = [
  {
    q: "Do my guests need an app or an account?",
    a: "No. An invitation is a web link — it opens in any browser, on any phone, with nothing to install and no sign-up. Only you, as the host, have an account.",
  },
  {
    q: "What can I ask guests when they RSVP?",
    a: "Going, maybe or can't make it, their name and email, the names of any plus-ones they bring, and a note for you. Dietary requirements are an optional extra field you can switch on per event.",
  },
  {
    q: "Can I cap numbers or close replies?",
    a: "Yes. You can set an overall capacity, limit how many plus-ones each guest may add, and set an RSVP deadline after which the invitation stops accepting replies.",
  },
  {
    q: "How do the photos work?",
    a: "Two ways. During the event, guests can post photos and messages straight onto the invitation's guestbook. Afterwards, you paste a link to your own shared album — Google Photos, iCloud, Drive, anything — and RsvpVault emails it either to everyone you invited or only to the people who came.",
  },
  {
    q: "Can guests add the event to their calendar?",
    a: "Yes. Every invitation offers Google Calendar and a downloadable .ics file for Apple Calendar and Outlook, so the date, time and location land in their calendar correctly.",
  },
  {
    q: "Is my invitation page private?",
    a: "An invitation is reachable only by its link, and invitation pages explicitly ask search engines not to index them. Nothing about your event appears in search results.",
  },
];

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "RsvpVault",
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any (web browser)",
        description:
          "Digital invitations with real-time RSVP tracking and a shared photo album after the event.",
        publisher: {
          "@type": "Organization",
          name: "3PandaLabs LLC",
          url: "https://3pandalabs.com",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };

  return (
    <div className={`flex min-h-screen flex-col ${geistSans.className}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
          Design a digital invitation, share one link, and watch the RSVPs come in. When the
          party&apos;s over, send the whole guest list a photo album so everyone&apos;s pictures end
          up in one place — no app for your guests to install, no account for them to create.
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
        <ul className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
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
            Send one shared album to everyone who came — or to your whole guest list — and get back
            the pictures they took.
          </Feature>
          <Feature icon={QrCode} title="Share it any way">
            One link to copy, send by WhatsApp, SMS or email, or print as a QR code.
          </Feature>
          <Feature icon={SlidersHorizontal} title="You set the rules">
            Capacity, plus-one limits and an RSVP deadline that closes replies for you.
          </Feature>
        </ul>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">How it works</h2>
          <ol className="mt-6 space-y-6">
            <Step n={1} title="Design the invitation">
              Start from a template, then change the colours, typography and cover image until it
              looks like your event rather than like software.
            </Step>
            <Step n={2} title="Share one link">
              Copy it, send it by WhatsApp, SMS or email, or print the QR code for a physical card.
              Every guest gets the same invitation page.
            </Step>
            <Step n={3} title="Watch the replies land">
              Responses appear as they come in, with plus-ones named and any dietary requirements
              attached, so your final numbers are a glance rather than a spreadsheet.
            </Step>
            <Step n={4} title="Send the photos afterwards">
              Paste a link to your shared album and send it to everyone you invited, or only to the
              people who actually came.
            </Step>
          </ol>
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Who it&apos;s for</h2>
          <p className="mt-4 text-zinc-600">
            Anyone hosting something that needs a headcount: weddings and receptions, birthdays and
            anniversaries, housewarmings, baby showers, and community or office events. It suits the
            host who wants one tidy link instead of a group chat where half the replies arrive as
            voice notes and the rest never arrive at all.
          </p>
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Questions</h2>
          <dl className="mt-6 space-y-8">
            {FAQ.map(({ q, a }) => (
              <div key={q}>
                <dt className="font-medium text-zinc-900">{q}</dt>
                <dd className="mt-2 text-zinc-600">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-20 rounded-2xl border border-zinc-200 bg-white/60 px-8 py-10 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Start with your next event
          </h2>
          <p className="mx-auto mt-3 max-w-md text-zinc-600">
            Create the invitation, share the link, and let the replies come to you.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-full bg-zinc-900 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Get started
          </Link>
        </section>
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
      <h3 className="mt-3 font-medium text-zinc-900">{title}</h3>
      <p className="mt-1 text-sm text-zinc-600">{children}</p>
    </li>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-medium text-white"
      >
        {n}
      </span>
      <div>
        <h3 className="font-medium text-zinc-900">{title}</h3>
        <p className="mt-1 text-zinc-600">{children}</p>
      </div>
    </li>
  );
}
