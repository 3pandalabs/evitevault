import type { Metadata } from "next";
import { A, LAST_UPDATED, LegalPage, Mail, Section, UL } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using RsvpVault, for hosts who send invitations and guests who respond to them.",
  alternates: { canonical: "/terms" },
};

const TOC = [
  { id: "agreement", title: "Agreement" },
  { id: "service", title: "The service" },
  { id: "accounts", title: "Host accounts" },
  { id: "guest-lists", title: "Your guest list and emails" },
  { id: "content", title: "Your content" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "guests", title: "Guests" },
  { id: "availability", title: "Availability and limits" },
  { id: "termination", title: "Ending your account" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnity" },
  { id: "law", title: "Governing law" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={LAST_UPDATED}
      toc={TOC}
      intro={
        <p>
          These terms are the agreement between you and 3PandaLabs LLC for using RsvpVault. Please read them with our{" "}
          <A href="/privacy">Privacy Policy</A>, which explains how we handle information.
        </p>
      }
    >
      <Section id="agreement" title="1. Agreement">
        <p>
          RsvpVault is operated by <strong>3PandaLabs LLC</strong>, a New Jersey (USA) limited liability company
          (&ldquo;3PandaLabs&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account, or by viewing or
          responding to an invitation, you agree to these terms. If you don&apos;t agree, please don&apos;t use
          RsvpVault.
        </p>
      </Section>

      <Section id="service" title="2. The service">
        <p>
          RsvpVault lets a host design a digital invitation, share it by link or email, collect RSVPs, run a guestbook,
          send announcements to guests, and share a photo album link afterwards. Guests use RsvpVault without an account.
          RsvpVault is currently free to use. If we ever introduce paid features, we will tell you before anything is
          charged, and nothing will be charged without your agreement.
        </p>
      </Section>

      <Section id="accounts" title="3. Host accounts">
        <UL>
          <li>You must be at least 18 to create a host account.</li>
          <li>Give a real email address you control; it is how you sign in and recover your account.</li>
          <li>
            Keep your password private. You are responsible for what happens under your account; tell us at <Mail /> if
            you think someone else has access.
          </li>
        </UL>
      </Section>

      <Section id="guest-lists" title="4. Your guest list and emails">
        <p>
          When you add guests, you are deciding to share their details with us so we can invite them on your behalf. You
          confirm that you know the people you invite, that you have a genuine reason to invite them, and that you are
          allowed to give us their details.
        </p>
        <UL>
          <li>
            Use RsvpVault only for real events and the people you are actually inviting. No marketing, newsletters,
            purchased or scraped lists, or messages unrelated to the event.
          </li>
          <li>
            Invitations and announcements are sent from <strong>invitations@rsvpvault.3pandalabs.com</strong> with your
            event details. The service has a daily limit on how many emails it can send, so a large
            list may be delivered over more than one day.
          </li>
          <li>If a guest asks you to remove their details, please do so.</li>
        </UL>
      </Section>

      <Section id="content" title="5. Your content">
        <p>
          You keep ownership of what you put into RsvpVault: event details, images, designs, messages and guestbook
          posts. You give us a limited licence to store, display, copy and transmit that content only as needed to run
          the service for you and your guests, for example to show your invitation to people with the link and to
          email it. This licence ends when you delete the content, apart from copies in backups that rotate out.
        </p>
        <p>
          You confirm that you have the right to use what you upload, including photos of other people, and that it
          doesn&apos;t break the law or anyone else&apos;s rights.
        </p>
      </Section>

      <Section id="acceptable-use" title="6. Acceptable use">
        <p>Don&apos;t use RsvpVault to:</p>
        <UL>
          <li>send spam, phishing, scams, or anything pretending to be someone else;</li>
          <li>post content that is illegal, hateful, harassing, sexually explicit, or that exploits children;</li>
          <li>collect other people&apos;s information beyond what an invitation needs;</li>
          <li>
            probe, overload or break the service, get around rate limits, or try to access events or accounts that
            aren&apos;t yours, including by guessing links;
          </li>
          <li>upload malware or anything you don&apos;t have the rights to.</li>
        </UL>
        <p>
          We may remove content, stop emails, or suspend or close an account that breaks these rules, and where it is
          serious we may do so without notice.
        </p>
      </Section>

      <Section id="guests" title="7. Guests">
        <p>
          If you are a guest, you are using RsvpVault at the host&apos;s invitation. The host, not 3PandaLabs, organises
          the event and is responsible for it, including any changes, cancellations and what they do with your response.
          Your personal RSVP link lets anyone holding it respond as you, so please don&apos;t forward it. Guestbook posts
          are visible to everyone with the event link, so keep them friendly. To have your details removed, see section
          8 of the <A href="/privacy#rights">Privacy Policy</A>.
        </p>
      </Section>

      <Section id="availability" title="8. Availability and limits">
        <p>
          We work to keep RsvpVault running, but we don&apos;t guarantee it will always be available, error-free, or that
          every email will be delivered; email can be delayed, filtered as spam, or rejected by the recipient&apos;s
          provider. Please keep your own copy of anything important, such as your guest list (you can export it as a
          spreadsheet). We may change, add or remove features.
        </p>
      </Section>

      <Section id="termination" title="9. Ending your account">
        <p>
          You can delete your account at any time from <A href="/delete-account">Delete account</A>. This permanently
          deletes your events, guest lists, responses, guestbook posts and uploaded images, and the invitation links stop
          working. We may suspend or close accounts that break these terms. Sections 5 (the part about rights you
          confirm), 10, 11, 12 and 13 continue after your account ends.
        </p>
      </Section>

      <Section id="disclaimers" title="10. Disclaimers">
        <p>
          RsvpVault is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>. To the extent the law
          allows, we disclaim all warranties, express or implied, including merchantability, fitness for a particular
          purpose and non-infringement. We are not a party to any event and are not responsible for events, hosts or
          guests.
        </p>
      </Section>

      <Section id="liability" title="11. Limitation of liability">
        <p>
          To the extent the law allows, 3PandaLabs will not be liable for any indirect, incidental, special,
          consequential or punitive damages, or for lost profits, data, goodwill or event costs, arising from your use of
          RsvpVault, including a missed, late or undelivered invitation or response. Our total liability for any claim
          relating to RsvpVault is limited to the greater of the amount you paid us in the 12 months before the claim and
          US$50. Some places don&apos;t allow these limits, so they may not all apply to you.
        </p>
      </Section>

      <Section id="indemnity" title="12. Indemnity">
        <p>
          If you are a host, you agree to cover 3PandaLabs&apos;s reasonable costs, including legal fees, arising from a
          claim that your events, uploads or guest list, or your emails to guests, broke the law, these terms or someone
          else&apos;s rights.
        </p>
      </Section>

      <Section id="law" title="13. Governing law">
        <p>
          These terms are governed by the laws of the <strong>State of New Jersey</strong>, USA, without regard to its
          conflict-of-laws rules. Any dispute will be resolved in the state or federal courts located in New Jersey, and
          you and we agree to their jurisdiction. This doesn&apos;t take away any protection you have under the
          mandatory consumer laws of the place you live.
        </p>
      </Section>

      <Section id="changes" title="14. Changes">
        <p>
          We may update these terms. We will change the date at the top of this page and, for significant changes, tell
          hosts by email or in the app before they take effect. Continuing to use RsvpVault after that means you accept
          the new terms.
        </p>
      </Section>

      <Section id="contact" title="15. Contact">
        <p>
          3PandaLabs LLC, New Jersey, USA. Email <Mail /> or use the <A href="/contact">contact form</A>.
        </p>
      </Section>
    </LegalPage>
  );
}
