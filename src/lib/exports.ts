import { asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { answers, exams, questions, submissions, type User } from "@/db/schema";
import { stripMarkdown } from "@/lib/markdown";
import { buildCsv, formatDateTime, formatScore, LETTERS } from "@/lib/utils";

export type ExportFilters = {
  examId?: number;
  school?: string;
  studentClass?: string;
  search?: string;
};

export type ExportRow = {
  id: number;
  examId: number;
  examTitle: string;
  examSlug: string | null;
  studentName: string;
  studentClass: string;
  school: string;
  score: number | null;
  correctCount: number;
  totalMultiple: number;
  submittedAt: Date;
};

/** Busca as submissões conforme filtros, respeitando a permissão do usuário. */
export async function fetchExportData(
  user: User,
  filters: ExportFilters
): Promise<{ rows: ExportRow[]; exam: (typeof exams.$inferSelect) | null; questions: (typeof questions.$inferSelect)[] }> {
  const conditions = [];
  let allowedExamIds: number[] | null = null;

  if (user.role === "teacher") {
    const own = await db.select({ id: exams.id }).from(exams).where(eq(exams.teacherId, user.id));
    allowedExamIds = own.map((e) => e.id);
    if (allowedExamIds.length === 0) return { rows: [], exam: null, questions: [] };
    if (filters.examId) {
      if (!allowedExamIds.includes(filters.examId)) return { rows: [], exam: null, questions: [] };
      conditions.push(eq(submissions.examId, filters.examId));
    } else {
      conditions.push(inArray(submissions.examId, allowedExamIds));
    }
  } else if (filters.examId) {
    conditions.push(eq(submissions.examId, filters.examId));
  }

  if (filters.school) conditions.push(eq(submissions.school, filters.school));
  if (filters.studentClass) conditions.push(eq(submissions.studentClass, filters.studentClass));
  if (filters.search) conditions.push(ilike(submissions.studentName, `%${filters.search}%`));

  const rows = await db
    .select({
      id: submissions.id,
      examId: submissions.examId,
      examTitle: exams.title,
      examSlug: exams.slug,
      studentName: submissions.studentName,
      studentClass: submissions.studentClass,
      school: submissions.school,
      score: submissions.score,
      correctCount: submissions.correctCount,
      totalMultiple: submissions.totalMultiple,
      submittedAt: submissions.submittedAt,
    })
    .from(submissions)
    .innerJoin(exams, eq(submissions.examId, exams.id))
    .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` and `)}` : undefined)
    .orderBy(desc(submissions.submittedAt));

  let exam = null;
  let qs: (typeof questions.$inferSelect)[] = [];
  if (filters.examId) {
    const [found] = await db.select().from(exams).where(eq(exams.id, filters.examId)).limit(1);
    exam = found ?? null;
    qs = await db
      .select()
      .from(questions)
      .where(eq(questions.examId, filters.examId))
      .orderBy(asc(questions.order));
  }

  return {
    rows: rows.map((r) => ({ ...r, score: r.score === null ? null : Number(r.score) })),
    exam,
    questions: qs,
  };
}

/** Monta as linhas do CSV (com colunas por questão quando filtrado por uma prova). */
export async function buildSubmissionCsv(
  user: User,
  filters: ExportFilters
): Promise<{ csv: string; filename: string }> {
  const { rows, exam, questions: qs } = await fetchExportData(user, filters);

  const header: string[] = [
    "Aluno",
    "Turma",
    "Escola",
    "Prova",
    "Nota (0-10)",
    "Acertos",
    "Total múltipla escolha",
    "Enviada em",
  ];
  if (exam && qs.length > 0) {
    qs.forEach((q, i) => header.push(`Q${i + 1} — ${q.type === "multiple" ? "alternativa" : "dissertativa"}`));
  }

  const body: (string | number)[][] = rows.map((r) => {
    const base: (string | number)[] = [
      r.studentName,
      r.studentClass,
      r.school,
      r.examTitle,
      r.score === null ? "" : r.score.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
      r.correctCount,
      r.totalMultiple,
      formatDateTime(r.submittedAt),
    ];
    return base;
  });

  if (exam && qs.length > 0 && rows.length > 0) {
    const submissionIds = rows.map((r) => r.id);
    const ans = await db.select().from(answers).where(inArray(answers.submissionId, submissionIds));
    const bySubmission = new Map<number, Map<number, (typeof answers.$inferSelect)>>();
    for (const a of ans) {
      if (!bySubmission.has(a.submissionId)) bySubmission.set(a.submissionId, new Map());
      bySubmission.get(a.submissionId)!.set(a.questionId, a);
    }
    rows.forEach((r, idx) => {
      const map = bySubmission.get(r.id);
      for (const q of qs) {
        const a = map?.get(q.id);
        let value = "";
        if (a) {
          if (q.type === "multiple" && a.selectedIndex !== null) {
            value = LETTERS[a.selectedIndex] ?? String(a.selectedIndex + 1);
          } else if (a.essayText) {
            value = a.essayText.replace(/[\r\n]+/g, " ");
          }
        }
        body[idx].push(value);
      }
    });
  }

  const csv = buildCsv(body.length > 0 ? [header, ...body] : [header]);
  const suffix = exam ? `-${exam.slug ?? exam.id}` : "";
  const name = `respostas${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
  return { csv, filename: name };
}

/** Perguntas com maior índice de erro (múltipla escolha) para o relatório. */
export async function hardestQuestions(examId?: number): Promise<
  { questionId: number; examTitle: string; prompt: string; errors: number; total: number; rate: number }[]
> {
  const joinConditions = [eq(answers.questionId, questions.id), eq(questions.examId, exams.id)];
  const where = examId ? [eq(questions.examId, examId), eq(questions.type, "multiple")] : [eq(questions.type, "multiple")];

  const rows = await db
    .select({
      questionId: questions.id,
      examTitle: exams.title,
      prompt: questions.prompt,
      isCorrect: answers.isCorrect,
    })
    .from(answers)
    .innerJoin(questions, joinConditions[0])
    .innerJoin(exams, joinConditions[1])
    .where(where.length > 0 ? sql`${sql.join(where, sql` and `)}` : undefined);

  const stats = new Map<
    number,
    { questionId: number; examTitle: string; prompt: string; errors: number; total: number }
  >();
  for (const r of rows) {
    const s = stats.get(r.questionId) ?? {
      questionId: r.questionId,
      examTitle: r.examTitle,
      prompt: r.prompt,
      errors: 0,
      total: 0,
    };
    s.total += 1;
    if (!r.isCorrect) s.errors += 1;
    stats.set(r.questionId, s);
  }

  return Array.from(stats.values())
    .filter((s) => s.total >= 1)
    .map((s) => ({ ...s, rate: Math.round((s.errors / s.total) * 100) }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total)
    .slice(0, 8)
    .map((s) => ({ ...s, prompt: stripMarkdown(s.prompt) }));
}

export function scoreLabel(score: number | null): string {
  return score === null ? "—" : formatScore(score);
}
