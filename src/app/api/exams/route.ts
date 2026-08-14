import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { parseExamPayload, validateDeadlineForPublish } from "@/lib/exam-validation";
import { generateSlug } from "@/lib/utils";

/** Cria uma nova prova (rascunho ou publicada). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = parseExamPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.errors.join(" ") }, { status: 400 });
  }
  const { value } = parsed;
  const publish = body?.publish === true || body?.status === "active";

  if (publish) {
    const deadlineError = validateDeadlineForPublish(value.deadline);
    if (deadlineError) return NextResponse.json({ error: deadlineError }, { status: 400 });
  }

  const examId = await db.transaction(async (tx) => {
    const slug = publish ? generateSlug() : null;
    const [exam] = await tx
      .insert(exams)
      .values({
        title: value.title,
        description: value.description,
        teacherId: user.id,
        status: publish ? "active" : "draft",
        deadline: value.deadline,
        targetClasses: value.targetClasses,
        displayMode: value.displayMode,
        slug,
        publishedAt: publish ? new Date() : null,
      })
      .returning({ id: exams.id });

    await tx.insert(questions).values(
      value.questions.map((q, i) => ({
        examId: exam.id,
        prompt: q.prompt,
        type: q.type,
        order: i,
        options: q.options,
        correctIndex: q.correctIndex,
      }))
    );
    return exam.id;
  });

  return NextResponse.json({ ok: true, id: examId });
}
