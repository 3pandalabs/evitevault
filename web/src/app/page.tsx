/* eslint-disable @next/next/no-img-element -- images are unoptimized on this
   deploy (next.config images.unoptimized), so next/image adds nothing here. */
import {
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  Check,
  ImageIcon,
  Images,
  MessageCircle,
  Mic,
  Plus,
  QrCode,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GradientBackdrop } from "@/components/GradientBackdrop";
import { Wordmark } from "@/components/Wordmark";
import { geistSans, instrumentSerif } from "@/lib/fonts";
import { SITE_URL } from "@/lib/site";
import "./home.css";

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

// Decorative only. Names in the hero mock-up are made up.
const OCCASIONS = [
  { slug: "wedding", label: "Weddings" },
  { slug: "birthday", label: "Birthdays" },
  { slug: "baby-shower", label: "Baby showers" },
  { slug: "housewarming", label: "Housewarmings" },
  { slug: "anniversary", label: "Anniversaries" },
  { slug: "graduation", label: "Graduations" },
  { slug: "diwali", label: "Diwali" },
  { slug: "holiday", label: "Holiday parties" },
  { slug: "thanksgiving", label: "Thanksgiving" },
];

const MARQUEE = [
  "💍 Weddings",
  "🎂 Birthdays",
  "🍼 Baby showers",
  "🏡 Housewarmings",
  "🥂 Anniversaries",
  "🎓 Graduations",
  "🪔 Diwali parties",
  "🎉 Office parties",
  "🎲 Game nights",
  "🎪 Community events",
];

const CONFETTI_COLORS = ["#f472b6", "#f59e0b", "#10b981", "#60a5fa", "#b98d4f", "#a78bfa"];
// Deterministic (no Math.random) so server and client render the same markup.
const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  x: `${(i * 37) % 100}%`,
  c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  w: `${6 + (i % 3) * 2}px`,
  h: i % 4 === 0 ? `${6 + (i % 3) * 2}px` : `${12 + (i % 4) * 2}px`,
  r: i % 4 === 0 ? "50%" : "2px",
  d: `${8 + (i % 5) * 1.7}s`,
  delay: `${-((i * 1.3) % 12)}s`,
  drift: `${((i % 7) - 3) * 22}px`,
  spin: `${360 + (i % 4) * 180}deg`,
}));

function Confetti({ count = CONFETTI.length }: { count?: number }) {
  return (
    <div aria-hidden className="rv-confetti">
      {CONFETTI.slice(0, count).map((p, i) => (
        <i
          key={i}
          style={
            {
              "--x": p.x,
              "--c": p.c,
              "--w": p.w,
              "--h": p.h,
              "--r": p.r,
              "--d": p.d,
              "--delay": p.delay,
              "--drift": p.drift,
              "--spin": p.spin,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

const btnDark =
  "rv-btn-shine inline-flex items-center gap-2 rounded-full bg-zinc-900 px-7 py-3.5 text-base font-medium text-white shadow-[0_12px_30px_-12px_rgba(24,24,27,.6)] transition-transform hover:-translate-y-0.5";

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
    <div
      className={`flex min-h-screen flex-col overflow-x-clip ${geistSans.className} ${instrumentSerif.variable}`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <GradientBackdrop />

      {/* ---------- Header ---------- */}
      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold text-zinc-900">
          <Wordmark />
        </span>
        <nav className="flex items-center gap-6 text-sm font-medium text-zinc-600">
          <a href="#how" className="hidden hover:text-zinc-900 sm:inline">
            How it works
          </a>
          <a href="#faq" className="hidden hover:text-zinc-900 sm:inline">
            FAQ
          </a>
          <Link
            href="/login"
            className="rounded-full border border-zinc-300 bg-white/70 px-5 py-2 text-zinc-900 backdrop-blur transition-colors hover:bg-zinc-900 hover:text-white"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* ---------- Hero ---------- */}
        <section className="relative">
          <Confetti count={18} />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-6 pt-6 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-12">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-white/70 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-amber-800 uppercase backdrop-blur">
                <Sparkles className="size-3.5" /> Digital invitations · RSVPs · Photos
              </p>
              <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-tight text-zinc-900 sm:text-6xl lg:text-7xl">
                Invites people{" "}
                <span className="rv-scribble">
                  <span className="rv-display rv-shimmer italic">actually</span>
                  <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden>
                    <path
                      d="M2 14 C 40 4, 80 18, 120 8 S 180 6, 198 12"
                      fill="none"
                      stroke="#e0699a"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>{" "}
                answer.
              </h1>
              {/* Deliberately spans the whole arc, not just the invitation. The
                  after-the-day half — one album link sent to everyone who came —
                  is the part hosts otherwise chase round a group chat for a week,
                  and nobody looking for it would guess an invitation product had it. */}
              <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600">
                Design a digital invitation, share one link, and watch the RSVPs come in. When the
                party&apos;s over, send the whole guest list a photo album so everyone&apos;s
                pictures end up in one place — no app for your guests to install, no account for
                them to create.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link href="/login" className={btnDark}>
                  Create your invitation <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#how"
                  className="rounded-full px-5 py-3.5 text-base font-medium text-zinc-700 underline-offset-4 hover:underline"
                >
                  See how it works
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-600">
                {["No app for guests", "Works on any phone", "One link for everything"].map(
                  (t) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <Check className="size-4 text-emerald-600" /> {t}
                    </li>
                  ),
                )}
              </ul>
            </div>

            <HeroStage />
          </div>
        </section>

        {/* ---------- Marquee ---------- */}
        <section aria-label="Occasions" className="border-y border-zinc-200/70 bg-white/50 py-5 backdrop-blur">
          <div className="rv-marquee overflow-hidden">
            <div className="rv-marquee-track">
              {[0, 1].map((copy) => (
                <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0 gap-10 pr-10">
                  {MARQUEE.map((m) => (
                    <li
                      key={m}
                      className="rv-display text-2xl whitespace-nowrap text-zinc-800 italic sm:text-3xl"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Before / during / after ---------- */}
        <section className="mx-auto w-full max-w-6xl px-6 py-24">
          <SectionHead kicker="The whole arc" title="Before, during and" accent="after the party." />
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            <ArcCard
              tone="from-rose-100 to-amber-50"
              label="Before"
              title="Design it, share one link"
              body="Pick a template, make it yours, then send one link by WhatsApp, SMS or email — or print the QR code."
            >
              <div className="flex items-center gap-3">
                <div className="grid size-16 place-items-center rounded-xl bg-white shadow-sm">
                  <QrCode className="size-10 text-zinc-800" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-2.5 w-11/12 rounded-full bg-rose-300/70" />
                  <div className="h-2.5 w-3/4 rounded-full bg-amber-300/70" />
                  <div className="h-2.5 w-1/2 rounded-full bg-zinc-300" />
                </div>
              </div>
            </ArcCard>
            <ArcCard
              tone="from-emerald-100 to-teal-50"
              label="During"
              title="Replies land in real time"
              body="Going, maybe, can't make it — with plus-ones named and dietary notes attached."
            >
              <div className="space-y-2.5 text-xs font-medium">
                <Tally label="Going" n={42} w="84%" color="bg-emerald-500" />
                <Tally label="Maybe" n={6} w="22%" color="bg-amber-400" />
                <Tally label="Can't" n={3} w="12%" color="bg-zinc-300" />
              </div>
            </ArcCard>
            <ArcCard
              tone="from-violet-100 to-sky-50"
              label="After"
              title="Everyone gets the photos"
              body="Paste your shared album link and send it to everyone you invited, or only to those who came."
            >
              <div className="relative flex h-20 items-end justify-center">
                {["wedding", "birthday", "anniversary"].map((s, i) => (
                  <img
                    key={s}
                    src={`/video-invites/pandas-${s}.jpg`}
                    alt=""
                    loading="lazy"
                    className="rv-polaroid -mx-3 h-20 w-16 rounded-md border-4 border-white object-cover shadow-md"
                    style={{ rotate: `${(i - 1) * 9}deg` }}
                  />
                ))}
              </div>
            </ArcCard>
          </div>
        </section>

        {/* ---------- Group chat vs RsvpVault ---------- */}
        <section className="relative bg-zinc-900 py-24 text-white">
          <div className="mx-auto w-full max-w-6xl px-6">
            <p className="text-xs font-semibold tracking-[.2em] text-amber-300 uppercase">
              Be honest
            </p>
            <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              One tidy link beats a{" "}
              <span className="rv-display text-rose-300 italic">group chat.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-zinc-400">
              Half the replies arrive as voice notes and the rest never arrive at all. Sound
              familiar?
            </p>

            <div className="mt-14 grid gap-8 lg:grid-cols-2">
              {/* The chaos */}
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="mb-5 text-sm font-medium text-zinc-400">😵 The group chat</p>
                <div className="space-y-3">
                  <Bubble rot="-2deg">who&apos;s actually coming??</Bubble>
                  <Bubble rot="2deg" right>
                    <span className="inline-flex items-center gap-2">
                      <Mic className="size-4" /> voice note · 0:47
                    </span>
                  </Bubble>
                  <Bubble rot="-1deg">can I bring my cousin + her kids</Bubble>
                  <Bubble rot="3deg" right>
                    wait what time again 😅
                  </Bubble>
                  <Bubble rot="-3deg">is it this saturday or next</Bubble>
                  <Bubble rot="1deg" right>
                    👍
                  </Bubble>
                </div>
              </div>

              {/* The calm */}
              <div className="rounded-3xl bg-white p-6 text-zinc-900 shadow-2xl">
                <div className="mb-5 flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-500">✨ RsvpVault</p>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Live
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Stat n="42" label="Going" tone="text-emerald-600" />
                  <Stat n="6" label="Maybe" tone="text-amber-500" />
                  <Stat n="3" label="Can't" tone="text-zinc-400" />
                </div>
                <ul className="mt-5 divide-y divide-zinc-100 text-sm">
                  {[
                    ["Priya S.", "Going · +2 (Dev, Asha)", "bg-emerald-500"],
                    ["Marcus L.", "Going · vegetarian", "bg-emerald-500"],
                    ["Hannah K.", "Maybe", "bg-amber-400"],
                    ["Omar R.", "Going · +1 (Lina)", "bg-emerald-500"],
                  ].map(([name, detail, dot]) => (
                    <li key={name} className="flex items-center justify-between py-3">
                      <span className="flex items-center gap-2.5 font-medium">
                        <span className={`size-2 rounded-full ${dot}`} /> {name}
                      </span>
                      <span className="text-zinc-500">{detail}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
                  Final numbers at a glance — not a spreadsheet.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Bento features ---------- */}
        <section className="mx-auto w-full max-w-6xl px-6 py-24">
          <SectionHead kicker="Everything included" title="Small details," accent="big night." />
          <ul className="mt-14 grid auto-rows-[minmax(13rem,auto)] gap-5 md:grid-cols-3">
            <Tile
              className="md:col-span-2"
              icon={CalendarCheck}
              title="Real-time RSVPs"
              body="Track going, maybe and declined, plus-ones, and dietary notes as they arrive."
            >
              <div className="mt-5 flex flex-wrap gap-2">
                {["Going +2", "Vegetarian", "Maybe", "Going", "Nut allergy", "Going +1"].map(
                  (c, i) => (
                    <span
                      key={c}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        i % 3 === 0
                          ? "bg-emerald-100 text-emerald-800"
                          : i % 3 === 1
                            ? "bg-amber-100 text-amber-800"
                            : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {c}
                    </span>
                  ),
                )}
              </div>
            </Tile>
            <Tile
              icon={ImageIcon}
              title="Your design"
              body="Preset templates with custom colours, typography and cover art."
            >
              <div className="mt-5 flex gap-2">
                {["#f472b6", "#f59e0b", "#10b981", "#60a5fa", "#18181b"].map((c) => (
                  <span
                    key={c}
                    className="size-7 rounded-full ring-2 ring-white shadow"
                    style={{ background: c }}
                  />
                ))}
              </div>
            </Tile>
            <Tile
              icon={MessageCircle}
              title="Guestbook"
              body="Guests leave messages and photos on the invitation itself."
            >
              <div className="mt-5 space-y-2 text-xs">
                <p className="w-fit rounded-2xl rounded-bl-sm bg-rose-100 px-3 py-2 text-rose-900">
                  Congratulations you two! 💕
                </p>
                <p className="ml-auto w-fit rounded-2xl rounded-br-sm bg-sky-100 px-3 py-2 text-sky-900">
                  Best party of the year 🎉
                </p>
              </div>
            </Tile>
            <Tile
              className="md:col-span-2"
              icon={Images}
              title="Photos after the day"
              body="Send one shared album to everyone who came — or to your whole guest list — and get back the pictures they took."
            >
              <div className="mt-5 flex justify-start pl-4">
                {["housewarming", "graduation", "diwali", "baby-shower"].map((s, i) => (
                  <img
                    key={s}
                    src={`/video-invites/pandas-${s}.jpg`}
                    alt=""
                    loading="lazy"
                    className="rv-polaroid -ml-4 h-24 w-20 rounded-md border-4 border-white object-cover shadow-lg"
                    style={{ rotate: `${(i - 1.5) * 7}deg` }}
                  />
                ))}
              </div>
            </Tile>
            <Tile
              icon={QrCode}
              title="Share it any way"
              body="One link to copy, send by WhatsApp, SMS or email, or print as a QR code."
            />
            <Tile
              icon={SlidersHorizontal}
              title="You set the rules"
              body="Capacity, plus-one limits and an RSVP deadline that closes replies for you."
            />
            <Tile
              icon={CalendarPlus}
              title="Straight to their calendar"
              body="Google Calendar and a .ics file for Apple Calendar and Outlook on every invitation."
            />
          </ul>
        </section>

        {/* ---------- Occasion gallery ---------- */}
        <section className="py-10">
          <div className="mx-auto w-full max-w-6xl px-6">
            <SectionHead kicker="Who it's for" title="Whatever you're" accent="hosting." />
            <p className="mt-4 max-w-2xl text-zinc-600">
              Anyone hosting something that needs a headcount: weddings and receptions, birthdays
              and anniversaries, housewarmings, baby showers, and community or office events.
            </p>
          </div>
          <div className="mt-10 snap-x overflow-x-auto pt-2 pb-6 [scrollbar-width:none]">
            <div className="mx-auto flex w-max gap-5 px-6">
            {OCCASIONS.map((o, i) => (
              <figure
                key={o.slug}
                className="group relative h-72 w-44 shrink-0 snap-center overflow-hidden rounded-3xl shadow-xl transition-transform duration-500 hover:-translate-y-2"
                style={{ rotate: `${i % 2 === 0 ? -2 : 2}deg` }}
              >
                <img
                  src={`/video-invites/pandas-${o.slug}.jpg`}
                  alt={`Our pandas at a ${o.label.toLowerCase()} celebration`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 pt-10">
                  <span className="rv-display text-xl text-white italic">{o.label}</span>
                </figcaption>
              </figure>
            ))}
            </div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-10 px-6 py-24">
          <SectionHead kicker="How it works" title="Four steps to a" accent="full house." />
          <ol className="relative mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
            <div aria-hidden className="rv-dash absolute top-6 right-[12%] left-[12%] hidden h-0.5 md:block" />
            {[
              [
                "Design the invitation",
                "Start from a template, then change the colours, typography and cover image until it looks like your event rather than like software.",
              ],
              [
                "Share one link",
                "Copy it, send it by WhatsApp, SMS or email, or print the QR code for a physical card. Every guest gets the same invitation page.",
              ],
              [
                "Watch the replies land",
                "Responses appear as they come in, with plus-ones named and any dietary requirements attached.",
              ],
              [
                "Send the photos afterwards",
                "Paste a link to your shared album and send it to everyone you invited, or only to the people who actually came.",
              ],
            ].map(([title, body], i) => (
              <li key={title} className="relative">
                <span
                  aria-hidden
                  className="relative z-10 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-rose-400 via-amber-400 to-emerald-400 text-lg font-bold text-white shadow-lg"
                >
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-zinc-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-10 px-6 pb-24">
          <SectionHead kicker="Questions" title="Good" accent="questions." center />
          <div className="mt-12 space-y-3">
            {FAQ.map(({ q, a }) => (
              <details
                key={q}
                className="rv-faq rounded-2xl border border-zinc-200 bg-white/60 px-6 py-5 backdrop-blur transition-colors"
              >
                <summary className="flex items-center justify-between gap-4 font-medium text-zinc-900">
                  {q}
                  <Plus className="rv-plus size-5 shrink-0 text-zinc-400" />
                </summary>
                <p className="mt-3 text-zinc-600">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="px-6 pb-24">
          <div className="rv-glow relative mx-auto w-full max-w-6xl overflow-hidden rounded-[2.5rem] px-8 py-20 text-center text-white shadow-2xl">
            <Confetti count={22} />
            <h2 className="relative text-4xl font-semibold tracking-tight sm:text-6xl">
              Start with your <span className="rv-display rv-shimmer italic">next event.</span>
            </h2>
            <p className="relative mx-auto mt-5 max-w-md text-lg text-zinc-300">
              Create the invitation, share the link, and let the replies come to you.
            </p>
            <Link
              href="/login"
              className="rv-btn-shine relative mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-zinc-900 shadow-xl transition-transform hover:-translate-y-0.5"
            >
              Get started <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------- Hero stage: stacked invitations, live toasts ---------- */
// The sample invitation cycles through our panda scenes. Every name, date and
// place here is made up. Pure CSS: each layer runs the same rv-rot animation,
// offset by its slot, so nothing needs client JS.
const HERO_EVENTS = [
  { slug: "wedding", tag: "💍 Wedding", kicker: "You're invited", title: "Maya & Arjun", when: "Saturday, June 14 · 4:00 PM", where: "The Garden House", pos: "50% 60%" },
  { slug: "birthday", tag: "🎂 Birthday", kicker: "Party time", title: "Leo turns 7!", when: "Sunday, March 9 · 2:00 PM", where: "Sunny Park Pavilion", pos: "50% 55%" },
  { slug: "diwali", tag: "🪔 Diwali", kicker: "Festival of lights", title: "Diwali Night", when: "Friday, October 30 · 7:00 PM", where: "The Kapoor home", pos: "50% 60%" },
  { slug: "baby-shower", tag: "🍼 Baby shower", kicker: "Oh baby!", title: "Welcome, Baby Rose", when: "Saturday, May 3 · 11:00 AM", where: "Nina's place", pos: "50% 55%" },
  { slug: "graduation", tag: "🎓 Graduation", kicker: "Class of 2027", title: "Ava graduates!", when: "Saturday, May 22 · 5:00 PM", where: "Riverside Hall", pos: "50% 55%" },
  { slug: "housewarming", tag: "🏡 Housewarming", kicker: "Come on over", title: "Our new home", when: "Sunday, August 10 · 3:00 PM", where: "The new place on Maple Lane", pos: "50% 60%" },
  { slug: "anniversary", tag: "🥂 Anniversary", kicker: "25 years together", title: "Raj & Anita", when: "Saturday, November 7 · 6:30 PM", where: "Lotus Banquet Hall", pos: "50% 60%" },
  { slug: "holiday", tag: "🎄 Holiday party", kicker: "Season's greetings", title: "Holiday Party", when: "Friday, December 18 · 7:00 PM", where: "The office lounge", pos: "50% 60%" },
  { slug: "thanksgiving", tag: "🦃 Thanksgiving", kicker: "Gather round", title: "Friendsgiving", when: "Thursday, November 26 · 4:00 PM", where: "Sam's place", pos: "50% 60%" },
];
const SLOT_SECONDS = 3.5;

function rot(i: number, offset = 0): React.CSSProperties {
  const n = HERO_EVENTS.length;
  return {
    "--rot-dur": `${n * SLOT_SECONDS}s`,
    "--rot-delay": `${(((i - offset) % n) + n) % n * SLOT_SECONDS - SLOT_SECONDS * 0.15}s`,
    "--rot-slot": `${100 / n}%`,
  } as React.CSSProperties;
}

function BackCard({ className, offset }: { className: string; offset: number }) {
  return (
    <div className={`${className} absolute inset-x-10 top-10 bottom-16 overflow-hidden rounded-[2rem] bg-zinc-800 shadow-xl`}>
      {HERO_EVENTS.map((e, i) => (
        <img
          key={e.slug}
          src={`/video-invites/pandas-${e.slug}.jpg`}
          alt=""
          decoding="async"
          className="rv-rot absolute inset-0 h-full w-full object-cover"
          style={rot(i, offset)}
          data-first={i === offset || undefined}
        />
      ))}
    </div>
  );
}

function HeroStage() {
  return (
    <div aria-hidden className="rv-stage relative mx-auto h-[34rem] w-full max-w-md sm:h-[38rem]">
      {/* Back cards: the same scenes, a couple of slots ahead of the front */}
      <BackCard className="rv-back-a" offset={2} />
      <BackCard className="rv-back-b" offset={4} />

      {/* Front invitation */}
      <div className="rv-float absolute inset-x-6 top-4 bottom-10 sm:inset-x-8">
        <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-white shadow-[0_40px_80px_-30px_rgba(24,24,27,.55)] ring-1 ring-black/5">
          <div className="relative h-[70%] overflow-hidden bg-zinc-800">
            {HERO_EVENTS.map((e, i) => (
              <div key={e.slug} className="rv-rot absolute inset-0" style={rot(i)} data-first={i === 0 || undefined}>
                <img
                  src={`/video-invites/pandas-${e.slug}.jpg`}
                  alt=""
                  decoding="async"
                  className="rv-kenburns h-full w-full object-cover"
                  style={{ objectPosition: e.pos }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-black/10" />
              </div>
            ))}
            {HERO_EVENTS.map((e, i) => (
              <div key={e.slug} className="rv-rot rv-rot-text absolute inset-0" style={rot(i)} data-first={i === 0 || undefined}>
                <span className="absolute top-4 left-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-zinc-800 shadow backdrop-blur">
                  {e.tag}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <p className="text-[10px] font-semibold tracking-[.25em] uppercase opacity-80">
                    {e.kicker}
                  </p>
                  <p className="rv-display mt-1 text-4xl leading-none italic">{e.title}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-1 flex-col justify-center gap-4 p-5">
            <div className="relative h-10 text-sm text-zinc-600">
              {HERO_EVENTS.map((e, i) => (
                <div key={e.slug} className="rv-rot rv-rot-text absolute inset-0" style={rot(i)} data-first={i === 0 || undefined}>
                  <p className="font-semibold text-zinc-900">{e.when}</p>
                  <p className="truncate">{e.where}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
              <span className="rv-pulse rounded-full bg-emerald-500 py-2.5 text-center text-white">
                Going
              </span>
              <span className="rounded-full bg-zinc-100 py-2.5 text-center text-zinc-700">Maybe</span>
              <span className="rounded-full bg-zinc-100 py-2.5 text-center text-zinc-700">
                Can&apos;t
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Live RSVP toasts */}
      <div className="absolute top-[52%] -right-2 w-56 sm:-right-12">
        {[
          ["🎉", "Priya is going", "+2 guests", "0s"],
          ["🥂", "Marcus is going", "Vegetarian", "3s"],
          ["🤔", "Hannah said maybe", "Will confirm Friday", "6s"],
        ].map(([emoji, title, sub, t]) => (
          <div
            key={title}
            className="rv-toast absolute inset-x-0 flex items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-black/5 backdrop-blur"
            style={{ "--t": t } as React.CSSProperties}
          >
            <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-lg">
              {emoji}
            </span>
            <span className="text-xs">
              <span className="block font-semibold text-zinc-900">{title}</span>
              <span className="text-zinc-500">{sub}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Floating chips */}
      <div className="rv-chip absolute top-[34%] -left-4 flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-xs font-semibold text-zinc-800 shadow-xl ring-1 ring-black/5 sm:-left-12">
        <CalendarPlus className="size-4 text-sky-500" /> Added to calendar
      </div>
      <div className="rv-chip rv-chip-2 absolute right-0 bottom-2 rounded-2xl bg-zinc-900 px-4 py-3 text-white shadow-xl sm:-right-6">
        <p className="text-[10px] tracking-widest text-zinc-400 uppercase">Going</p>
        <p className="text-2xl leading-none font-bold">
          42 <span className="text-sm font-medium text-emerald-400">+3 today</span>
        </p>
      </div>
    </div>
  );
}

/* ---------- Small building blocks ---------- */
function SectionHead({
  kicker,
  title,
  accent,
  center,
}: {
  kicker: string;
  title: string;
  accent: string;
  center?: boolean;
}) {
  return (
    <div className={center ? "text-center" : ""}>
      <p className="text-xs font-semibold tracking-[.2em] text-emerald-700 uppercase">{kicker}</p>
      <h2 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
        {title} <span className="rv-display rv-shimmer italic">{accent}</span>
      </h2>
    </div>
  );
}

function ArcCard({
  tone,
  label,
  title,
  body,
  children,
}: {
  tone: string;
  label: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rv-tile rounded-3xl bg-gradient-to-br ${tone} p-7 ring-1 ring-black/5`}>
      <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-700">
        {label}
      </span>
      <div className="mt-6 min-h-20">{children}</div>
      <h3 className="mt-6 text-xl font-semibold text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
    </div>
  );
}

function Tally({ label, n, w, color }: { label: string; n: number; w: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-zinc-600">{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded-full bg-white/80">
        <span className={`rv-bar block h-full rounded-full ${color}`} style={{ width: w }} />
      </span>
      <span className="w-6 text-right text-zinc-900">{n}</span>
    </div>
  );
}

function Bubble({
  children,
  rot,
  right,
}: {
  children: React.ReactNode;
  rot: string;
  right?: boolean;
}) {
  return (
    <p
      className={`rv-wobble w-fit max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
        right ? "ml-auto rounded-br-sm bg-emerald-600/80" : "rounded-bl-sm bg-white/15"
      }`}
      style={{ "--rot": rot } as React.CSSProperties}
    >
      {children}
    </p>
  );
}

function Stat({ n, label, tone }: { n: string; label: string; tone: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 py-4">
      <p className={`text-3xl font-bold ${tone}`}>{n}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function Tile({
  icon: Icon,
  title,
  body,
  className = "",
  children,
}: {
  icon: typeof CalendarCheck;
  title: string;
  body: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`rv-tile flex flex-col rounded-3xl border border-zinc-200/80 bg-white/75 p-7 backdrop-blur ${className}`}
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-50 to-amber-50 ring-1 ring-black/5">
        <Icon className="size-5 text-emerald-600" />
      </span>
      <h3 className="mt-5 text-lg font-semibold text-zinc-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-zinc-600">{body}</p>
      {children}
    </li>
  );
}
