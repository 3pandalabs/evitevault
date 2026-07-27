import Link from "next/link";

// Draft, cancelled and nonexistent events all land here identically — the API
// deliberately can't distinguish them, so a harvested slug reveals nothing.
export default function InvitationNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">This invitation isn&apos;t available</h1>
        <p className="mt-2 text-sm text-slate-500">
          The link may be incorrect, or the host may have unpublished the event.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">
          Go to EviteVault
        </Link>
      </div>
    </main>
  );
}
