"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { deleteEvent } from "@/lib/api/host";
import { Button } from "@/components/ui/button";

/**
 * Two-step delete: the first click swaps in a confirmation panel rather than
 * opening a `window.confirm`. A native dialog is easy to dismiss without
 * reading, looks nothing like the rest of the app, and — on the dashboard list
 * — gives no room to name what is about to be destroyed.
 *
 * Deleting is not soft: the event, its guests and their RSVPs go with it, and
 * any invitation link already in a guest's hands stops resolving. The
 * confirmation says so.
 */
export function DeleteEventButton({
  eventId,
  title,
  onDeleted,
  size = "sm",
}: {
  eventId: string;
  title: string;
  onDeleted: () => void;
  size?: "sm" | "default";
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={() => setConfirming(true)}
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        <Trash2 className="size-4" />
        Delete
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-medium text-red-900">Delete “{title}”?</p>
      <p className="mt-1 text-xs text-red-700">
        This also deletes every guest and RSVP on it, and any invitation link already shared stops
        working. It can&apos;t be undone.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={deleting}
          onClick={async () => {
            setDeleting(true);
            setError(null);
            try {
              await deleteEvent(eventId);
              onDeleted();
            } catch (err) {
              setDeleting(false);
              setError(
                err instanceof ApiError && err.status === 401
                  ? "Your session expired. Sign in again."
                  : "Couldn't delete that. Try again.",
              );
            }
          }}
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Yes, delete it
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={deleting}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
        >
          Keep it
        </Button>
      </div>
    </div>
  );
}
