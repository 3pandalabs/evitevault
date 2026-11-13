import type { Metadata } from "next";
import { A, LAST_UPDATED, LegalPage, Mail, PRIVACY_EMAIL, Section, UL } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What RsvpVault stores about hosts and guests, why, who processes it, how long it is kept, and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

const TOC = [
  { id: "who", title: "Who we are" },
  { id: "hosts", title: "What we store about hosts" },
  { id: "guests", title: "What we store about guests" },
  { id: "why", title: "Why we use it" },
  { id: "visible", title: "Who can see what" },
  { id: "processors", title: "Who processes it for us" },
  { id: "retention", title: "How long we keep it" },
  { id: "rights", title: "Deleting your data and your rights" },
  { id: "storage", title: "Cookies and local storage" },
  { id: "children", title: "Children" },
  { id: "security", title: "Security" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={LAST_UPDATED}
      toc={TOC}
      intro={
        <p>
          RsvpVault lets a host design a digital invitation, share one link, and track who is coming. Guests open the
          link and respond; they never need an account. This policy explains, in plain English, what information we
          handle to make that work, for both hosts and guests.
        </p>
      }
    >
      <Section id="who" title="1. Who we are">
        <p>
          RsvpVault is run by <strong>3PandaLabs LLC</strong>, a New Jersey (USA) limited liability company
          (&ldquo;3PandaLabs&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). We decide how the information described here
          is used. Contact us at <Mail /> or, for privacy requests, <Mail to={PRIVACY_EMAIL} />.
        </p>
        <p>
          A host who adds guests to an event decides whose details to enter and why. For that guest list, the host is
          responsible for having a reason to invite those people, and we process the list on the host&apos;s behalf to
          deliver their invitations and collect responses.
        </p>
      </Section>

      <Section id="hosts" title="2. What we store about hosts">
        <UL>
          <li>
            <strong>Your account:</strong> email address, an optional display name, and your password, stored only as a
            one-way hash that we cannot read. Sign-in sessions and, if you ask for one, a single-use password reset link
            (also stored only as a hash).
          </li>
          <li>
            <strong>Your events:</strong> title, description, the host name you show guests, date, time and time zone,
            location and map link, RSVP settings (deadline, capacity, plus-ones, dietary question, open RSVP), and an
            optional shared photo album link.
          </li>
          <li>
            <strong>Images you upload:</strong> event cover images and the invitation card you export from the designer,
            stored in Cloudflare R2.
          </li>
          <li>
            <strong>Designs:</strong> the template and colour or font choices for each event, and any templates you save.
          </li>
          <li>
            <strong>Announcements</strong> you send to your guests: subject, message, which guests it went to, and when.
          </li>
          <li>
            <strong>Contact form messages:</strong> your name, email and message, which reach us as an email. We
            don&apos;t store them in the RsvpVault database.
          </li>
        </UL>
      </Section>

      <Section id="guests" title="3. What we store about guests">
        <p>
          <strong>Guests never have an RsvpVault account.</strong> A guest reaches an invitation through the
          event&apos;s link, and an invited guest through their own personal link, which is the only thing that lets
          someone respond as them.
        </p>
        <UL>
          <li>
            <strong>Entered by the host:</strong> the guest&apos;s name, and optionally an email address and phone
            number.
          </li>
          <li>
            <strong>Entered by the guest when they respond:</strong> their answer (going, maybe, not going), how many
            people they are bringing and those people&apos;s names, dietary notes if the host asked, and an optional
            message to the host. If the host allows open RSVPs, a guest who responds through the event link gives their
            name and optionally an email, and that creates their guest record. Each change of answer is kept in a short
            history so the host can see it.
          </li>
          <li>
            <strong>Guestbook:</strong> if the event has a guestbook, the name, message, optional email address and
            optional photo a visitor posts. Photos are stored in Cloudflare R2.
          </li>
          <li>
            <strong>Delivery records:</strong> when an invitation email was sent, and when the guest first and last
            opened their invitation.
          </li>
          <li>
            <strong>Page views:</strong> to show the host how many people viewed an invitation, we record each view with
            a salted, one-way hash of the visitor&apos;s IP address and browser identifier. The IP address itself is not
            stored, and the hash cannot be turned back into it.
          </li>
        </UL>
      </Section>

      <Section id="why" title="4. Why we use it">
        <UL>
          <li>To run host accounts and sign hosts in.</li>
          <li>To show invitations to the people who have the link, and to record their responses for the host.</li>
          <li>
            To send email on the host&apos;s behalf: invitations, RSVP confirmations to guests who give an email,
            announcements and the photo album link. These come from{" "}
            <strong>invitations@rsvpvault.3pandalabs.com</strong>. We also send hosts password reset emails.
          </li>
          <li>To show hosts response counts, headcount and view statistics for their own events.</li>
          <li>To keep the service working and stop abuse, and to answer you when you contact us.</li>
        </UL>
        <p>
          We don&apos;t sell personal information, we don&apos;t use it for advertising, and we don&apos;t email guests
          about anything other than the event they were invited to.
        </p>
      </Section>

      <Section id="visible" title="5. Who can see what">
        <UL>
          <li>
            <strong>The host</strong> sees everything about their own events and guest lists, including guests&apos;
            email addresses, phone numbers, responses, dietary notes and messages, and can export the list as a
            spreadsheet.
          </li>
          <li>
            <strong>Anyone with an event&apos;s link</strong> can view the published invitation and its guestbook. Guest
            email addresses and phone numbers are never shown on the invitation page. The guest list is shown only if the
            host turns that on, and then only names.
          </li>
          <li>
            <strong>Invitation links are unlisted, not secret.</strong> Anyone the link is forwarded to can open it, so
            please treat it like a paper invitation. Invitation pages ask search engines not to index them.
          </li>
        </UL>
      </Section>

      <Section id="processors" title="6. Who processes it for us">
        <p>We use a small number of service providers, only to run RsvpVault:</p>
        <UL>
          <li>
            <strong>Cloudflare</strong> (USA): hosts the website, DNS and network protection, runs 3PandaLabs&apos; shared
            email gateway, and stores uploaded images and our database backups (Cloudflare R2).
          </li>
          <li>
            <strong>Hetzner Online</strong> (Germany): runs our API server and database, where accounts, events and guest
            lists are stored.
          </li>
          <li>
            <strong>Resend</strong> (USA): delivers our emails, so it handles the recipient address and the email
            content.
          </li>
          <li>
            <strong>Google Fonts</strong>: some invitation designs load typefaces from Google&apos;s font service, which
            sees the visitor&apos;s IP address when the font is fetched.
          </li>
        </UL>
        <p>
          Your information may therefore be processed in the United States, Germany and wherever these providers operate.
          We may also disclose information if the law requires it, or to protect someone&apos;s safety.
        </p>
      </Section>

      <Section id="retention" title="7. How long we keep it">
        <UL>
          <li>
            <strong>Host accounts and events</strong>: until the host deletes the event or their account.
          </li>
          <li>
            <strong>Guest details and responses</strong>: as long as the event exists. Deleting a guest, an event, or the
            host&apos;s account deletes the guest records with it.
          </li>
          <li>
            <strong>Uploaded images</strong>: deleted when the event or account they belong to is deleted, or when a
            host removes a guestbook post or replaces a cover image.
          </li>
          <li>
            <strong>Backups</strong>: database backups are kept for a limited period and then overwritten, so deleted
            data can survive in a backup until it rotates out. We only restore backups to recover from a failure.
          </li>
          <li>
            <strong>Server logs</strong>: kept briefly to run the service and investigate problems.
          </li>
        </UL>
      </Section>

      <Section id="rights" title="8. Deleting your data and your rights">
        <p>
          <strong>Hosts</strong> can delete a guest, an event, or their whole account at any time. To delete your
          account, sign in and use <A href="/delete-account">Delete account</A>; it removes your account, every event
          you created, all of their guests, responses, guestbook posts and uploaded images, your saved templates, and
          signs you out everywhere. It can&apos;t be undone.
        </p>
        <p>
          <strong>Guests</strong>: the quickest way to have your details changed or removed is to ask the host who
          invited you, who can edit or delete your entry. If you can&apos;t reach the host, or would rather not, email{" "}
          <Mail /> with the invitation link and the details you want removed, and we will remove them.
        </p>
        <p>
          Depending on where you live, you may also have the right to access, correct, export or object to the use of
          your information. Email <Mail to={PRIVACY_EMAIL} /> and we will respond within 30 days. We may need to confirm
          the request comes from you.
        </p>
      </Section>

      <Section id="storage" title="9. Cookies and local storage">
        <p>
          We don&apos;t use advertising or analytics cookies or third-party trackers. When a host signs in, the website
          keeps the sign-in tokens in the browser&apos;s local storage so the host stays signed in; signing out removes
          them. Guests don&apos;t need anything stored to view or respond to an invitation.
        </p>
      </Section>

      <Section id="children" title="10. Children">
        <p>
          Host accounts are for adults (18 or older). A host may of course invite children, for example to a birthday
          party, in which case the host, usually a parent, decides what to enter about them. Please enter no more than a
          name. If you believe a child&apos;s information was added without permission, contact <Mail />.
        </p>
      </Section>

      <Section id="security" title="11. Security">
        <p>
          Connections are encrypted (HTTPS), passwords and sign-in tokens are stored only as hashes, invitation and
          personal RSVP links use long random identifiers, and uploaded images are served only through short-lived
          signed links. No system is perfectly secure; if we learn of a breach that affects you, we will tell you as
          the law requires.
        </p>
      </Section>

      <Section id="changes" title="12. Changes">
        <p>
          If we change this policy, we will update the date at the top of this page. For significant changes we will
          also tell hosts by email or in the app before they take effect.
        </p>
      </Section>

      <Section id="contact" title="13. Contact">
        <p>
          3PandaLabs LLC, New Jersey, USA. Email <Mail /> or <Mail to={PRIVACY_EMAIL} />, or use the{" "}
          <A href="/contact">contact form</A>.
        </p>
      </Section>
    </LegalPage>
  );
}
