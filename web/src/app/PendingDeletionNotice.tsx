import Link from "next/link";
import { getContext } from "@/lib/household";

// App-wide bar shown when a signed-in user's household is soft-deleted: their
// account is recoverable but counting down to permanent erasure, so keep the way
// back one tap away on every page.
export default async function PendingDeletionNotice() {
  const ctx = await getContext().catch(() => null);
  if (!ctx?.pendingDeletion) return null;
  return (
    <Link
      href="/account"
      className="block bg-amber-500 px-4 py-2 text-center text-xs font-medium text-white hover:bg-amber-600"
    >
      ⏳ Your account is scheduled for deletion — tap to restore it.
    </Link>
  );
}
