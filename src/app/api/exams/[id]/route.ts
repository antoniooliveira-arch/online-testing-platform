import { and, asc, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { exams, questions, submissions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { parseExamPayload, parseExamRequest, validateDeadlineForPublish } from "@/lib/exam-validation";
import { generateSlug } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

async function loadOwnedExam(id: number) {
  const [exam] = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
  return exam;
}

function canAccess(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>, exam: { teacherId: number }) {
  return user.role === "admin" || user.id === exam.teacherId;
}

/** Detalhes da prova + questões (professor dono ou admin). */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const id = Number((await params).id);
  const exam = await loadOwnedExam(id);
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccess(user, exam)) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });

  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, id))
    .orderBy(asc(questions.order));

  const [{ total }] = await db
    .select({ total: count() })
    .from(submissions)
    .where(eq(submissions.examId, id));

  return NextResponse.json({
    ok: true,
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      teacherId: exam.teacherId,
      status: exam.status,
      deadline: exam.deadline ? exam.deadline.toISOString() : null,
      targetClasses: exam.targetClasses,
      displayMode: exam.displayMode,
      slug: exam.slug,
      pdfName: exam.pdfName,
      pdfSize: exam.pdfSize,
      publishedAt: exam.publishedAt ? exam.publishedAt.toISOString() : null,
      submissionCount: Number(total),
    },
    questions: qs.map((q) => ({
      ...q,
      options: (q.options ?? []) as string[],
    })),
  });
}

/** Edita (rascunho), publica, encerra ou exclui uma prova. */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const id = Number((await params).id);
  const exam = await loadOwnedExam(id);
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccess(user, exam)) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  // Edição de conteúdo com upload de PDF (multipart) — apenas em rascunho
  if (isMultipart) {
    if (exam.status !== "draft") {
      return NextResponse.json(
        { error: "Provas publicadas não podem ser editadas. Crie uma nova prova ou encerre esta." },
        { status: 400 }
      );
    }

    const result = await parseExamRequest(req);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { value, publish, pdf, removePdf } = result.parsed;

    if (publish) {
      const deadlineError = validateDeadlineForPublish(value.deadline);
      if (deadlineError) return NextResponse.json({ error: deadlineError }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      const pdfFields: Record<string, unknown> = {};
      if (pdf) {
        pdfFields.pdfName = pdf.name;
        pdfFields.pdfData = pdf.data;
        pdfFields.pdfSize = pdf.size;
      } else if (removePdf) {
        pdfFields.pdfName = null;
        pdfFields.pdfData = null;
        pdfFields.pdfSize = null;
      }

      await tx
        .update(exams)
        .set({
          title: value.title,
          description: value.description,
          deadline: value.deadline,
          targetClasses: value.targetClasses,
          displayMode: value.displayMode,
          ...pdfFields,
          ...(publish && exam.status === "draft"
            ? { status: "active", slug: exam.slug ?? generateSlug(), publishedAt: exam.publishedAt ?? new Date() }
            : {}),
        })
        .where(eq(exams.id, id));

      await tx.delete(questions).where(eq(questions.examId, id));
      await tx.insert(questions).values(
        value.questions.map((q, i) => ({
          examId: id,
          prompt: q.prompt,
          type: q.type,
          order: i,
          options: q.options,
          correctIndex: q.correctIndex,
        }))
      );
    });

    return NextResponse.json({ ok: true });
  }

  const body = (await req.json().catch(() => null)) ?? {};
  const targetStatus = typeof body.status === "string" ? body.status : null;

  // Transições de status permitidas
  if (targetStatus && targetStatus !== exam.status) {
    if (targetStatus === "active" && exam.status === "draft") {
      const deadlineError = validateDeadlineForPublish(exam.deadline);
      if (deadlineError) return NextResponse.json({ error: deadlineError }, { status: 400 });
      const [countRow] = await db
        .select({ total: count() })
        .from(questions)
        .where(eq(questions.examId, id));
      if (Number(countRow?.total ?? 0) === 0) {
        return NextResponse.json({ error: "Adicione pelo menos uma questão antes de publicar." }, { status: 400 });
      }
      await db
        .update(exams)
        .set({
          status: "active",
          slug: exam.slug ?? generateSlug(),
          publishedAt: exam.publishedAt ?? new Date(),
          deadline: body.deadline ? new Date(body.deadline) : exam.deadline,
        })
        .where(eq(exams.id, id));
    } else if (targetStatus === "finished" && exam.status === "active") {
      await db.update(exams).set({ status: "finished" }).where(eq(exams.id, id));
    } else if (targetStatus === "draft" && exam.status === "finished") {
      // Reabre como rascunho (mantém o link)
      await db.update(exams).set({ status: "draft" }).where(eq(exams.id, id));
    } else {
      return NextResponse.json({ error: "Transição de status inválida." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  // Edição de conteúdo: apenas em rascunho
  if (exam.status !== "draft") {
    return NextResponse.json(
      { error: "Provas publicadas não podem ser editadas. Crie uma nova prova ou encerre esta." },
      { status: 400 }
    );
  }

  const parsed = parseExamPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.errors.join(" ") }, { status: 400 });
  }
  const { value } = parsed;

  const pdfFields: Record<string, unknown> = {};
  if (body.removePdf === true) {
    pdfFields.pdfName = null;
    pdfFields.pdfData = null;
    pdfFields.pdfSize = null;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(exams)
      .set({
        title: value.title,
        description: value.description,
        deadline: value.deadline,
        targetClasses: value.targetClasses,
        displayMode: value.displayMode,
        ...pdfFields,
      })
      .where(eq(exams.id, id));

    await tx.delete(questions).where(eq(questions.examId, id));
    await tx.insert(questions).values(
      value.questions.map((q, i) => ({
        examId: id,
        prompt: q.prompt,
        type: q.type,
        order: i,
        options: q.options,
        correctIndex: q.correctIndex,
      }))
    );
  });

  return NextResponse.json({ ok: true });
}

/** Exclui a prova (com questões, respostas e submissões). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const id = Number((await params).id);
  const exam = await loadOwnedExam(id);
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccess(user, exam)) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });

  const [{ total }] = await db
    .select({ total: count() })
    .from(submissions)
    .where(and(eq(submissions.examId, id)));

  if (Number(total) > 0 && exam.status === "active") {
    return NextResponse.json(
      { error: "Não é possível excluir uma prova publicada que já possui respostas. Encerre a prova." },
      { status: 400 }
    );
  }

  await db.delete(exams).where(eq(exams.id, id));
  return NextResponse.json({ ok: true });
}
