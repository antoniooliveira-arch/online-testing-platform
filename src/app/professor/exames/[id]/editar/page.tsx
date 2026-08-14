import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ExamForm, { type ExamDraft, type QuestionDraft } from "@/components/exam-form";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { requireUser } from "@/lib/auth";

function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditExamPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin", "teacher"]);
  const id = Number((await params).id);

  const [exam] = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
  if (!exam) notFound();
  if (user.role !== "admin" && user.id !== exam.teacherId) notFound();

  const qs = await db.select().from(questions).where(eq(questions.examId, id)).orderBy(asc(questions.order));

  const initial: ExamDraft = {
    title: exam.title,
    description: exam.description,
    deadline: toLocalInput(exam.deadline),
    targetClasses: exam.targetClasses,
    displayMode: exam.displayMode === "paged" ? "paged" : "list",
    pdfName: exam.pdfName,
    questions: qs.map(
      (q): QuestionDraft => ({
        key: `q-${q.id}`,
        prompt: q.prompt,
        type: q.type === "essay" ? "essay" : "multiple",
        options: ((q.options ?? []) as string[]).length > 0 ? (q.options as string[]) : ["", ""],
        correctIndex: q.correctIndex,
      })
    ),
  };

  if (exam.status !== "draft") {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-10">
          <h1 className="text-xl font-bold text-amber-900">Prova não editável</h1>
          <p className="mt-2 text-sm text-amber-800">
            Esta prova já foi publicada e recebeu respostas. Para preservar a integridade dos
            resultados, apenas rascunhos podem ser editados. Você pode encerrá-la e criar uma nova
            versão.
          </p>
          <Link
            href={`/professor/exames/${exam.id}`}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para a prova
          </Link>
        </div>
      </div>
    );
  }

  return <ExamForm examId={exam.id} initial={initial} />;
}
