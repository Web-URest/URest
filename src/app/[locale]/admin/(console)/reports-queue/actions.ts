"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/auth";
import {
  acceptIntoReview,
  dismissReport,
  escalateToDispute,
  resolveReport,
  strikeHostFromReport,
  unlistFromReport,
} from "@/lib/admin/report-review";
import { redirect } from "@/i18n/navigation";

/**
 * Reports-queue triage actions (§5.6, issue #27). Each re-guards with
 * requireAdmin() and delegates to the coordinator. Used with `.bind(null, reportId)`.
 */

function revalidate(reportId: string): void {
  revalidatePath("/admin/reports-queue");
  revalidatePath(`/admin/reports-queue/${reportId}`);
}

async function backToQueue(): Promise<void> {
  revalidatePath("/admin/reports-queue");
  const locale = await getLocale();
  redirect({ href: "/admin/reports-queue", locale });
}

export async function acceptAction(reportId: string, _fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await acceptIntoReview(admin, reportId);
  revalidate(reportId);
}

export async function resolveAction(reportId: string, fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await resolveReport(admin, reportId, String(fd.get("reason") ?? ""));
  await backToQueue();
}

export async function dismissAction(reportId: string, fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await dismissReport(admin, reportId, String(fd.get("reason") ?? ""));
  await backToQueue();
}

export async function unlistAction(reportId: string, _fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await unlistFromReport(admin, reportId);
  revalidate(reportId);
}

export async function escalateAction(reportId: string, _fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await escalateToDispute(admin, reportId);
  revalidate(reportId);
}

export async function strikeAction(reportId: string, _fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await strikeHostFromReport(admin, reportId, "ADMIN_MANUAL");
  revalidate(reportId);
}
