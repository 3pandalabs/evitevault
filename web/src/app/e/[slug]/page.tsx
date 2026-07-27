import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddToCalendar } from "./add-to-calendar";
import { Guestbook } from "./guestbook";
import { RsvpForm } from "./rsvp-form";
import { fetchGuestbook, fetchPublicEvent } from "@/lib/api/public";
import { googleFontsHref, themeStyle } from "@/lib/theme";
import { formatEventDate, formatEventTime } from "@/lib/utils";

// Next 15+ passes params and searchParams as promises.
type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  // No token here on purpose — metadata is what gets embedded in a link preview
  // when the invitation is forwarded, and a personalised card would leak the
  // original recipient's name into a group chat.
  const event = await fetchPublicEvent(slug);
  if (!event) return { title: "Invitation not found" };

  return {
    title: `${event.title} · EviteVault`,
    description: event.description ?? undefined,
    openGraph: {
      title: event.title,
      description: event.description ?? undefined,
      images: event.coverImageUrl ? [event.coverImageUrl] : undefined,
    },
    // An invitation is unlisted by design: the slug is the only credential, so
    // it must never end up in a search index.
    robots: { index: false, follow: false },
  };
}

export default async function InvitationPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { t: token } = await searchParams;

  const event = await fetchPublicEvent(slug, token);
  if (!event) notFound();

  const posts = event.guestbook.enabled ? await fetchGuestbook(slug) : [];
  const style = themeStyle(event.theme);
  const isPhotoLayout = event.theme.layout === "photo" && event.coverImageUrl;

  return (
    <>
      {/* Only the two families this event actually uses are requested. */}
      <link rel="stylesheet" href={googleFontsHref(event.theme)} />

      <main className="ev-themed min-h-screen" style={style}>
        {/* Cover art. Deliberately a plain <img>, not next/image: the src is a
            presigned R2 URL that expires in ten minutes, and the optimizer
            would cache it and then serve a dead link. */}
        {event.coverImageUrl ? (
          <div
            className={
              isPhotoLayout
                ? "relative h-[60vh] min-h-[320px] w-full"
                : "relative h-56 w-full sm:h-72 md:h-96"
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.coverImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            {isPhotoLayout ? (
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-6 sm:p-10">
                <div className="text-white">
                  <h1 className="ev-heading text-3xl font-semibold sm:text-5xl">{event.title}</h1>
                  {event.hostName ? (
                    <p className="mt-2 text-sm opacity-90">Hosted by {event.hostName}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
          {!isPhotoLayout ? (
            <header className="text-center">
              {event.hostName ? (
                <p className="ev-muted text-xs uppercase tracking-[0.2em]">
                  {event.hostName} invites you
                </p>
              ) : null}
              <h1 className="ev-heading mt-3 text-3xl font-semibold leading-tight sm:text-5xl">
                {event.title}
              </h1>
            </header>
          ) : null}

          <section className="ev-surface mt-8 rounded-2xl p-5 shadow-sm sm:p-8">
            <dl className="space-y-4 text-sm sm:text-base">
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 size-5 shrink-0" style={{ color: "var(--ev-accent)" }} />
                <div>
                  <dt className="font-medium">{formatEventDate(event.startsAt, event.timezone)}</dt>
                  <dd className="ev-muted flex items-center gap-1.5 text-sm">
                    <Clock className="size-3.5" />
                    {formatEventTime(event.startsAt, event.timezone)}
                    {event.endsAt ? ` – ${formatEventTime(event.endsAt, event.timezone)}` : ""}
                  </dd>
                </div>
              </div>

              {event.location.name || event.location.address ? (
                <div className="flex gap-3">
                  <MapPin className="mt-0.5 size-5 shrink-0" style={{ color: "var(--ev-accent)" }} />
                  <div>
                    {event.location.name ? (
                      <dt className="font-medium">{event.location.name}</dt>
                    ) : null}
                    {event.location.address ? (
                      <dd className="ev-muted text-sm">{event.location.address}</dd>
                    ) : null}
                    {event.location.mapUrl ? (
                      <dd className="mt-1 text-sm">
                        <a
                          href={event.location.mapUrl}
                          target="_blank"
                          // noreferrer as well as noopener: the map link is
                          // host-supplied and shouldn't receive the invitation
                          // URL — which is the guest's credential — as a
                          // referrer.
                          rel="noopener noreferrer"
                          className="underline underline-offset-4"
                          style={{ color: "var(--ev-accent)" }}
                        >
                          View map
                        </a>
                      </dd>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {event.attending.count > 0 ? (
                <div className="flex gap-3">
                  <Users className="mt-0.5 size-5 shrink-0" style={{ color: "var(--ev-accent)" }} />
                  <div>
                    <dt className="font-medium">
                      {event.attending.headcount} going
                    </dt>
                    {event.attending.attendees?.length ? (
                      <dd className="ev-muted text-sm">
                        {event.attending.attendees
                          .slice(0, 8)
                          .map((a) => a.name)
                          .join(", ")}
                        {event.attending.attendees.length > 8
                          ? ` and ${event.attending.attendees.length - 8} more`
                          : ""}
                      </dd>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </dl>

            {event.description ? (
              <p className="mt-6 whitespace-pre-line border-t border-black/5 pt-6 text-sm leading-relaxed sm:text-base">
                {event.description}
              </p>
            ) : null}

            <div className="mt-6">
              <AddToCalendar icsUrl={event.calendar.icsUrl} googleUrl={event.calendar.googleUrl} />
            </div>
          </section>

          <section className="mt-8">
            <RsvpForm
              slug={event.slug}
              token={token}
              rsvp={event.rsvp}
              you={event.you}
              calendar={event.calendar}
            />
          </section>

          {event.guestbook.enabled ? (
            <section className="mt-10">
              <Guestbook
                slug={event.slug}
                token={token}
                initialPosts={posts}
                photosEnabled={event.guestbook.photosEnabled}
                knownName={event.you?.name ?? null}
              />
            </section>
          ) : null}

          {/* No product footer here by design. The invitation belongs to the
              host, and a guest arriving from a personal link is not an audience
              to market to — the branding sat between them and the page's
              actual purpose. */}
        </div>
      </main>
    </>
  );
}
