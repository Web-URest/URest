"use server";

import { revalidatePath } from "next/cache";
import { FaqSource, FaqStatus } from "@prisma/client";

import { requireAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

/**
 * Suggest a question as a host FAQ entry (PRODUCT_FLOWS §5.7).
 * Creates a ListingFaqEntry with source ADMIN_SUGGESTED and status DRAFT,
 * then marks all matching open questions for that listing as CONVERTED.
 *
 * Used with .bind(null, questionId) so FormData is the second arg.
 */
export async function suggestAsFaqAction(
  questionId: string,
  _fd: FormData,
): Promise<void> {
  await requireAdmin();

  const question = await prisma.unansweredQuestion.findUnique({
    where: { id: questionId },
  });

  if (!question || question.status !== "OPEN" || !question.listingId) return;

  const last = await prisma.listingFaqEntry.findFirst({
    where: { listingId: question.listingId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.$transaction([
    prisma.listingFaqEntry.create({
      data: {
        listingId: question.listingId,
        question: question.questionText,
        answer: "",
        source: FaqSource.ADMIN_SUGGESTED,
        status: FaqStatus.DRAFT,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    }),
    // Mark ALL open questions with the same text+listing as CONVERTED
    prisma.unansweredQuestion.updateMany({
      where: {
        listingId: question.listingId,
        questionText: question.questionText,
        status: "OPEN",
      },
      data: { status: "CONVERTED" },
    }),
  ]);

  revalidatePath("/admin/unanswered-questions");
}

/** Dismiss a single unanswered question (off-topic / abuse). */
export async function dismissQuestionAction(
  questionId: string,
  _fd: FormData,
): Promise<void> {
  await requireAdmin();

  await prisma.unansweredQuestion.updateMany({
    where: { id: questionId, status: "OPEN" },
    data: { status: "DISMISSED" },
  });

  revalidatePath("/admin/unanswered-questions");
}
