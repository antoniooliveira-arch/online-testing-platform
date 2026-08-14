import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleAlert, FileText, GraduationCap } from "lucide-react";
import { db } from "@/db";
import { answers, exams, questions, submissions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { renderPrompt } from "@/lib/markdown";
import { cn, formatDateTime, formatScore, LETTERS } from "@/lib/utils";

/** Visualização detalhada da prova respondida por um aluno (professor dono ou admin). */
export default async function SubmissionDetail({
  submissionId,
  backHref,
}: {
  submissionId: number;
  backHref: string;
}) {
  const user = await requireUser(["admin", "teacher"]);

  const [submission] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  if (!submission) notFound();

  const [exam] = await db.select().from(exams).where(eq(exams.id, submission.examId)).limit(1);
  if (!exam) notFound();
  if (user.role !== "admin" && user.id !== exam.teacherId) notFound();

  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, exam.id))
    .orderBy(asc(questions.order));
  const ans = await db.select().from(answers).where(eq(answers.submissionId, submission.id));
  const answerMap = new Map(ans.map((a) => [a.questionId, a]));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      {/* Cabeçalho do aluno */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">
              {submission.studentName.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{submission.studentName}</h1>
              <p className="text-sm text-slate-500">
                {submission.studentClass} · {submission.school}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-indigo-700">
              {formatScore(submission.score === null ? null : Number(submission.score))}
            </p>
            <p className="text-xs text-slate-400">
              {submission.totalMultiple > 0
                ? `${submission.correctCount}/${submission.totalMultiple} acertos objetivos`
                : "Sem questões objetivas"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
            Prova: {exam.title}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            Enviada em {formatDateTime(submission.submittedAt)}
          </span>
        </div>
      </div>

      {/* Questões */}
      <div className="mt-6 space-y-4">
        {qs.map((q) => {
          const answer = answerMap.get(q.id);
          const isCorrect = answer?.isCorrect === true;
          const isWrong = answer?.isCorrect === false;
          return (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                  {q.order + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] leading-relaxed text-slate-900">{renderPrompt(q.prompt)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {q.type === "multiple" ? "Múltipla escolha" : "Dissertativa"}
                    </span>
                    {q.type === "multiple" && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                          isCorrect
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        )}
                      >
                        {isCorrect ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Acertou
                          </>
                        ) : (
                          <>
                            <CircleAlert className="h-3.5 w-3.5" /> Errou
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {q.type === "multiple" ? (
                <div className="mt-4 space-y-2">
                  {(q.options ?? []).map((option, i) => {
                    const chosen = answer?.selectedIndex === i;
                    const isAnswer = q.correctIndex === i;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm",
                          isAnswer
                            ? "border-emerald-300 bg-emerald-50"
                            : chosen
                              ? "border-rose-300 bg-rose-50"
                              : "border-slate-100 bg-white"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            isAnswer
                              ? "bg-emerald-600 text-white"
                              : chosen
                                ? "bg-rose-500 text-white"
                                : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {LETTERS[i]}
                        </span>
                        <span className="flex-1 text-slate-800">{option}</span>
                        {isAnswer && (
                          <span className="text-[11px] font-bold uppercase text-emerald-600">
                            Correta
                          </span>
                        )}
                        {chosen && (
                          <span
                            className={cn(
                              "text-[11px] font-bold uppercase",
                              isAnswer ? "text-emerald-600" : "text-rose-600"
                            )}
                          >
                            Resposta do aluno
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {answer?.selectedIndex === null && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                      Questão deixada em branco pelo aluno.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-semibold text-slate-500">Resposta do aluno</p>
                  {answer?.essayText ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800">
                      {answer.essayText}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">
                      Questão deixada em branco pelo aluno.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    Correção manual do professor — não incluída na nota automática.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
