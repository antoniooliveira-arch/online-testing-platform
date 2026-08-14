import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { answers, exams, questions, submissions } from "@/db/schema";
import { isExamClosed, normalize } from "@/lib/utils";

type AnswerInput = { questionId: number; selectedIndex?: number | null; essayText?: string };

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Recebe as respostas do aluno, corrige automaticamente múltipla escolha e salva a submissão. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) ?? {};

  const examSlug = asText(body.examSlug).toUpperCase();
  const studentName = asText(body.studentName);
  const studentClass = asText(body.studentClass);
  const school = asText(body.school);

  if (!examSlug) return NextResponse.json({ error: "Código da prova inválido." }, { status: 400 });
  if (studentName.length < 3) {
    return NextResponse.json({ error: "Preencha seu nome completo." }, { status: 400 });
  }
  if (!studentClass) return NextResponse.json({ error: "Informe a sua turma." }, { status: 400 });
  if (!school) return NextResponse.json({ error: "Informe a sua escola." }, { status: 400 });

  const [exam] = await db.select().from(exams).where(eq(exams.slug, examSlug)).limit(1);
  if (!exam || exam.status === "draft") {
    return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  }
  if (isExamClosed(exam)) {
    return NextResponse.json({ error: "O prazo para envio desta prova foi encerrado." }, { status: 403 });
  }

  // Impede duplicidade: mesmo aluno (nome normalizado) + turma + escola na mesma prova
  const existing = await db.select().from(submissions).where(eq(submissions.examId, exam.id));
  const duplicate = existing.some(
    (s) =>
      normalize(s.studentName) === normalize(studentName) &&
      normalize(s.studentClass) === normalize(studentClass) &&
      normalize(s.school) === normalize(school)
  );
  if (duplicate) {
    return NextResponse.json(
      { error: "Você já enviou esta prova. Cada aluno pode enviar apenas uma vez." },
      { status: 409 }
    );
  }

  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, exam.id))
    .orderBy(asc(questions.order));

  const rawAnswers = Array.isArray(body.answers) ? (body.answers as AnswerInput[]) : [];
  const byQuestion = new Map<number, AnswerInput>();
  for (const a of rawAnswers) {
    if (typeof a.questionId === "number") byQuestion.set(a.questionId, a);
  }

  let correctCount = 0;
  let totalMultiple = 0;
  const rows: { questionId: number; selectedIndex: number | null; essayText: string | null; isCorrect: boolean | null }[] = [];

  for (const q of qs) {
    const given = byQuestion.get(q.id);
    if (q.type === "multiple") {
      totalMultiple += 1;
      const selected = Number.isInteger(given?.selectedIndex) ? (given!.selectedIndex as number) : null;
      const correct = selected !== null && selected === q.correctIndex;
      if (correct) correctCount += 1;
      rows.push({ questionId: q.id, selectedIndex: selected, essayText: null, isCorrect: selected === null ? false : correct });
    } else {
      const text = asText(given?.essayText).slice(0, 5000);
      rows.push({ questionId: q.id, selectedIndex: null, essayText: text || null, isCorrect: null });
    }
  }

  const score = totalMultiple > 0 ? Math.round((correctCount / totalMultiple) * 1000) / 100 : null;

  const submissionId = await db.transaction(async (tx) => {
    const [sub] = await tx
      .insert(submissions)
      .values({
        examId: exam.id,
        studentName,
        studentClass,
        school,
        score: score === null ? null : String(score),
        correctCount,
        totalMultiple,
      })
      .returning({ id: submissions.id });
    await tx.insert(answers).values(rows.map((r) => ({ submissionId: sub.id, ...r })));
    return sub.id;
  });

  return NextResponse.json({ ok: true, submissionId, correctCount, totalMultiple, score });
}
