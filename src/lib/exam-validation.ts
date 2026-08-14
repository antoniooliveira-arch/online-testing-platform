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

/** Tamanho máximo do PDF da prova (limite de corpo do Vercel é 4.5MB). */
export const MAX_PDF_BYTES = 4_000_000;

export type ExamPdfInput = { name: string; data: string; size: number };

export type ExamRequestParsed = {
  value: ExamInput;
  publish: boolean;
  pdf: ExamPdfInput | null;
  removePdf: boolean;
};

/**
 * Lê e valida o corpo da requisição de criação/edição de prova.
 * Aceita tanto JSON (compatibilidade) quanto multipart/form-data (upload de PDF).
 */
export async function parseExamRequest(
  req: Request
): Promise<{ ok: true; parsed: ExamRequestParsed } | { ok: false; status: number; error: string }> {
  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  let body: Record<string, unknown>;
  let publish = false;
  let removePdf = false;
  let pdfFile: File | null = null;

  if (isMultipart) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return { ok: false, status: 400, error: "Não foi possível ler o envio da prova." };
    let questions: unknown = [];
    const rawQuestions = fd.get("questions");
    if (rawQuestions) {
      try {
        questions = JSON.parse(String(rawQuestions));
      } catch {
        return { ok: false, status: 400, error: "Dados das questões inválidos." };
      }
    }
    body = {
      title: fd.get("title"),
      description: fd.get("description"),
      deadline: fd.get("deadline"),
      targetClasses: fd.get("targetClasses"),
      displayMode: fd.get("displayMode"),
      questions,
    };
    publish = fd.get("publish") === "1" || fd.get("publish") === "true";
    removePdf = fd.get("removePdf") === "1" || fd.get("removePdf") === "true";
    const file = fd.get("pdf");
    if (file && typeof file === "object" && "arrayBuffer" in file) pdfFile = file as File;
  } else {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    publish = body.publish === true || body.status === "active";
    removePdf = body.removePdf === true;
  }

  const parsed = parseExamPayload(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.errors.join(" ") };
  const { value } = parsed;

  let pdf: ExamPdfInput | null = null;
  if (pdfFile) {
    if (pdfFile.size === 0) return { ok: false, status: 400, error: "O arquivo PDF está vazio." };
    if (!pdfFile.name.toLowerCase().endsWith(".pdf")) {
      return { ok: false, status: 400, error: "Envie um arquivo no formato PDF." };
    }
    if (pdfFile.size > MAX_PDF_BYTES) {
      return { ok: false, status: 400, error: "O arquivo PDF deve ter no máximo 4 MB." };
    }
    const buf = Buffer.from(await pdfFile.arrayBuffer());
    if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return { ok: false, status: 400, error: "O arquivo enviado não é um PDF válido." };
    }
    pdf = { name: pdfFile.name, data: buf.toString("base64"), size: buf.length };
  }

  return { ok: true, parsed: { value, publish, pdf, removePdf } };
}
