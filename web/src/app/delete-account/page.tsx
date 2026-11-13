import type { Metadata } from "next";
import { A, LegalPage, Mail } from "@/components/LegalPage";
import { DeleteAccountForm } from "./DeleteAccountForm";

export const metadata: Metadata = {
  title: "Delete your account",
  description: "How to permanently delete your RsvpVault host account and everything in it.",
  alternates: { canonical: "/delete-account" },
};

// Public on purpose: app stores and privacy laws expect a deletion page anyone
// can find. Signed out it explains how; signed in it shows the confirm form.
export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account"
      intro={
        <p>
          Hosts can delete their RsvpVault account at any time. Guests don&apos;t have accounts: to have your details
          removed from an invitation, ask the host, or email <Mail /> (see the{" "}
          <A href="/privacy#rights">Privacy Policy</A>).
        </p>
      }
    >
      <DeleteAccountForm />
    </LegalPage>
  );
}
