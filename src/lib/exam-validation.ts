import { questions, type Exam } from "@/db/schema";

export type QuestionInput = {
  prompt: string;
  type: "multiple" | "essay";
  options: string[];
  correctIndex: number | null;
};

export type ExamInput = {
  title: string;
  description: string;
  deadline: Date | null;
  targetClasses: string;
  displayMode: "list" | "paged";
  questions: QuestionInput[];
};

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Normaliza e valida o payload de criação/edição de prova. */
export function parseExamPayload(body: unknown): { ok: true; value: ExamInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const b = (body ?? {}) as Record<string, unknown>;

  const title = asString(b.title);
  if (title.length < 3) errors.push("Informe um título para a prova.");

  const description = asString(b.description);

  let deadline: Date | null = null;
  const rawDeadline = asString(b.deadline);
  if (rawDeadline) {
    const d = new Date(rawDeadline);
    if (Number.isNaN(d.getTime())) errors.push("Data limite inválida.");
    else deadline = d;
  }

  const targetClasses = asString(b.targetClasses);
  const displayMode: ExamInput["displayMode"] =
    asString(b.displayMode) === "paged" ? "paged" : "list";

  const rawQuestions = Array.isArray(b.questions) ? b.questions : [];
  const parsedQuestions: QuestionInput[] = [];

  if (rawQuestions.length === 0) {
    errors.push("Adicione pelo menos uma questão.");
  } else {
    rawQuestions.forEach((q, i) => {
      const item = (q ?? {}) as Record<string, unknown>;
      const prompt = asString(item.prompt);
      if (!prompt) {
        errors.push(`A questão ${i + 1} está sem enunciado.`);
        return;
      }
      const type = asString(item.type) === "essay" ? "essay" : "multiple";
      const rawOptions = Array.isArray(item.options) ? item.options.map(asString) : [];
      const options = rawOptions.filter((o) => o.length > 0);

      if (type === "multiple") {
        if (options.length < 2) {
          errors.push(`A questão ${i + 1} precisa de pelo menos 2 alternativas preenchidas.`);
          return;
        }
        const correctIndex = Number(item.correctIndex);
        if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
          errors.push(`Marque a alternativa correta da questão ${i + 1}.`);
          return;
        }
        parsedQuestions.push({ prompt, type, options, correctIndex });
      } else {
        parsedQuestions.push({ prompt, type: "essay", options: [], correctIndex: null });
      }
    });
  }

  if (parsedQuestions.length === 0 && errors.length === 0) {
    errors.push("Adicione pelo menos uma questão válida.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { title, description, deadline, targetClasses, displayMode, questions: parsedQuestions },
  };
}

/** Validação rápida de status/publicação. */
export function validateDeadlineForPublish(deadline: Date | null): string | null {
  if (deadline && deadline.getTime() < Date.now()) {
    return "A data limite de entrega precisa estar no futuro para publicar a prova.";
  }
  return null;
}

export function isDraft(exam: Pick<Exam, "status">): boolean {
  return exam.status === "draft";
}
