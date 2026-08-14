import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { isExamClosed } from "@/lib/utils";

type Ctx = { params: Promise<{ code: string }> };

/**
 * Endpoint público usado pela tela do aluno.
 * Nunca expõe a alternativa correta das questões.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const code = ((await params).code ?? "").trim().toUpperCase();
  const [exam] = await db.select().from(exams).where(eq(exams.slug, code)).limit(1);

  if (!exam || exam.status === "draft") {
    return NextResponse.json({ ok: false, error: "Prova não encontrada. Verifique o código." }, { status: 404 });
  }

  const qs = await db
    .select({
      id: questions.id,
      prompt: questions.prompt,
      type: questions.type,
      order: questions.order,
      options: questions.options,
    })
    .from(questions)
    .where(eq(questions.examId, exam.id))
    .orderBy(asc(questions.order));

  if (isExamClosed(exam)) {
    return NextResponse.json(
      {
        ok: true,
        closed: true,
        exam: {
          id: exam.id,
          title: exam.title,
          description: exam.description,
          deadline: exam.deadline ? exam.deadline.toISOString() : null,
        },
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    closed: false,
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      deadline: exam.deadline ? exam.deadline.toISOString() : null,
      displayMode: exam.displayMode,
      targetClasses: exam.targetClasses,
      pdfName: exam.pdfName,
    },
    questions: qs.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      order: q.order,
      options: (q.options ?? []) as string[],
    })),
  });
}
