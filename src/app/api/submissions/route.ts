import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  alunos,
  answers,
  escolas,
  exams,
  matriculas,
  questions,
  submissions,
  turmas,
} from "@/db/schema";
import { isExamClosed, normalize } from "@/lib/utils";

const ANO_LETIVO = 2026;

type AnswerInput = { questionId: number; selectedIndex?: number | null; essayText?: string };

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Recebe as respostas do aluno, corrige automaticamente múltipla escolha e salva a submissão. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) ?? {};

  const examSlug = asText(body.examSlug).toUpperCase();
  const alunoId = typeof body.alunoId === "string" ? body.alunoId.trim() : "";
  const turmaId = typeof body.turmaId === "string" ? body.turmaId.trim() : "";

  if (!examSlug) return NextResponse.json({ error: "Código da prova inválido." }, { status: 400 });

  // Identificação pela matrícula real (escola/turma/aluno do banco escolar)
  let studentName = asText(body.studentName);
  let studentClass = asText(body.studentClass);
  let school = asText(body.school);

  if (alunoId && turmaId) {
    const [mat] = await db
      .select({
        alunoNome: alunos.nome,
        turmaNome: turmas.nome,
        escolaNome: escolas.nome,
      })
      .from(matriculas)
      .innerJoin(alunos, eq(matriculas.alunoId, alunos.id))
      .innerJoin(turmas, eq(matriculas.turmaId, turmas.id))
      .innerJoin(escolas, eq(turmas.escolaId, escolas.id))
      .where(
        and(
          eq(matriculas.alunoId, alunoId),
          eq(matriculas.turmaId, turmaId),
          eq(matriculas.anoLetivo, ANO_LETIVO),
          eq(matriculas.status, "ativo")
        )
      )
      .limit(1);
    if (!mat) {
      return NextResponse.json(
        { error: "Matrícula não encontrada para o aluno/turma informados. Verifique com o professor." },
        { status: 400 }
      );
    }
    studentName = mat.alunoNome;
    studentClass = mat.turmaNome;
    school = mat.escolaNome;
  } else {
    if (studentName.length < 3) {
      return NextResponse.json({ error: "Preencha seu nome completo." }, { status: 400 });
    }
    if (!studentClass) return NextResponse.json({ error: "Informe a sua turma." }, { status: 400 });
    if (!school) return NextResponse.json({ error: "Informe a sua escola." }, { status: 400 });
  }

  const [exam] = await db.select().from(exams).where(eq(exams.slug, examSlug)).limit(1);
  if (!exam || exam.status === "draft") {
    return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  }
  if (isExamClosed(exam)) {
    return NextResponse.json({ error: "O prazo para envio desta prova foi encerrado." }, { status: 403 });
  }

  // Impede duplicidade: mesmo aluno (matrícula ou nome normalizado) na mesma prova
  if (alunoId) {
    const [duplicate] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.examId, exam.id), eq(submissions.alunoId, alunoId)))
      .limit(1);
    if (duplicate) {
      return NextResponse.json(
        { error: "Você já enviou esta prova. Cada aluno pode enviar apenas uma vez." },
        { status: 409 }
      );
    }
  } else {
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
        alunoId: alunoId || null,
        turmaId: turmaId || null,
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
