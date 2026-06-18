"use server";

import { getLocale } from "next-intl/server";
import type { ReportCategory } from "@prisma/client";

import { auth } from "@/lib/auth/auth";
import { requireUser } from "@/lib/auth/guards";
import { createBookingReport, createListingReport } from "@/lib/reports/create";
import { redirect } from "@/i18n/navigation";

/**
 * Report submission actions (§3.8/§4.5, issue #27). Bound to a target id at the
 * entry point; FormData carries `category` + `text`. Listing reports allow a
 * logged-out reporter; booking reports require the booking's guest/host.
 */

const CATEGORIES = new Set<string>([
  "DOESNT_MATCH_LISTING",
  "CLEANLINESS",
  "SAFETY",
  "HOST_BEHAVIOR",
  "SUSPECTED_FRAUD",
  "OTHER",
]);

function readCategory(fd: FormData): ReportCategory {
  const raw = String(fd.get("category") ?? "");
  return (CATEGORIES.has(raw) ? raw : "OTHER") as ReportCategory;
}

export async function submitListingReportAction(listingId: string, fd: FormData): Promise<void> {
  const session = await auth();
  const reporterId = session?.user?.id ?? null;
  await createListingReport(reporterId, listingId, readCategory(fd), String(fd.get("text") ?? ""));

  const locale = await getLocale();
  redirect({ href: reporterId ? "/reports" : `/listings/${listingId}`, locale });
}

export async function submitBookingReportAction(bookingId: string, fd: FormData): Promise<void> {
  const user = await requireUser();
  await createBookingReport(user.id, bookingId, readCategory(fd), String(fd.get("text") ?? ""));

  const locale = await getLocale();
  redirect({ href: "/reports", locale });
}
