import type { Metadata } from "next";
import { A, LegalPage, Mail } from "@/components/LegalPage";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the RsvpVault team at 3PandaLabs.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      intro={
        <>
          <p>
            Questions, problems, or a request about your data? Send us a message and we&apos;ll reply by email. You can
            also write to <Mail /> directly.
          </p>
          <p className="text-sm text-zinc-500">
            Guests: questions about an event itself (time, place, who&apos;s invited) are best asked of the host who
            invited you. To have your details removed, see the <A href="/privacy#rights">Privacy Policy</A>.
          </p>
        </>
      }
    >
      <ContactForm />
    </LegalPage>
  );
}
