"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bold,
  ChevronDown,
  ChevronUp,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { renderPrompt } from "@/lib/markdown";
import { cn } from "@/lib/utils";

export type QuestionDraft = {
  key: string;
  prompt: string;
  type: "multiple" | "essay";
  options: string[];
  correctIndex: number | null;
};

export type ExamDraft = {
  title: string;
  description: string;
  deadline: string; // datetime-local
  targetClasses: string;
  displayMode: "list" | "paged";
  questions: QuestionDraft[];
};

const EMPTY_QUESTION = (): QuestionDraft => ({
  key: Math.random().toString(36).slice(2),
  prompt: "",
  type: "multiple",
  options: ["", ""],
  correctIndex: null,
});

const DEFAULT_DEADLINE = () => {
  const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ExamForm({
  examId,
  initial,
}: {
  examId?: number;
  initial?: ExamDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ExamDraft>(
    initial ?? {
      title: "",
      description: "",
      deadline: DEFAULT_DEADLINE(),
      targetClasses: "",
      displayMode: "list",
      questions: [EMPTY_QUESTION()],
    }
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);

  const update = (patch: Partial<ExamDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) =>
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)),
    }));

  function addQuestion() {
    setDraft((d) => ({ ...d, questions: [...d.questions, EMPTY_QUESTION()] }));
  }
  function removeQuestion(key: string) {
    setDraft((d) => ({ ...d, questions: d.questions.filter((q) => q.key !== key) }));
  }
  function moveQuestion(index: number, dir: -1 | 1) {
    setDraft((d) => {
      const next = [...d.questions];
      const target = index + dir;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, questions: next };
    });
  }

  /** Aplica negrito/itálico/listas na seleção atual do textarea. */
  function applyMarkup(kind: "bold" | "italic" | "bullet" | "ordered") {
    const el = document.activeElement as HTMLTextAreaElement | null;
    if (!el || el.tagName !== "TEXTAREA") return;
    const key = el.dataset.qkey;
    if (!key) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value;
    const selected = value.slice(start, end);

    let replacement = selected;
    if (kind === "bold") replacement = selected ? `**${selected}**` : "**negrito**";
    if (kind === "italic") replacement = selected ? `*${selected}*` : "*itálico*";
    if (kind === "bullet") {
      replacement = (selected || "item da lista")
        .split("\n")
        .map((l) => `- ${l}`)
        .join("\n");
    }
    if (kind === "ordered") {
      replacement = (selected || "item da lista")
        .split("\n")
        .map((l, i) => `${i + 1}. ${l}`)
        .join("\n");
    }

    const next = value.slice(0, start) + replacement + value.slice(end);
    updateQuestion(key, { prompt: next });

    // Restaura o foco e a seleção após re-render
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(`textarea[data-qkey="${key}"]`);
      if (ta) {
        ta.focus();
        ta.setSelectionRange(start, start + replacement.length);
      }
    });
  }

  function validate(requireDeadline = false): string {
    if (draft.title.trim().length < 3) return "Informe um título para a prova.";
    if (draft.questions.length === 0) return "Adicione pelo menos uma questão.";
    for (let i = 0; i < draft.questions.length; i++) {
      const q = draft.questions[i];
      if (!q.prompt.trim()) return `A questão ${i + 1} está sem enunciado.`;
      if (q.type === "multiple") {
        const filled = q.options.filter((o) => o.trim());
        if (filled.length < 2) return `A questão ${i + 1} precisa de pelo menos 2 alternativas preenchidas.`;
        if (q.correctIndex === null || !q.options[q.correctIndex]?.trim())
          return `Marque a alternativa correta da questão ${i + 1}.`;
      }
    }
    if (requireDeadline && draft.deadline && new Date(draft.deadline).getTime() < Date.now()) {
      return "A data limite precisa estar no futuro para publicar a prova.";
    }
    return "";
  }

  async function save(publish: boolean) {
    setError("");
    const invalid = validate(publish);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(publish ? "publish" : "save");
    try {
      const body = {
        title: draft.title,
        description: draft.description,
        deadline: draft.deadline || null,
        targetClasses: draft.targetClasses,
        displayMode: draft.displayMode,
        publish,
        questions: draft.questions.map((q) => ({
          prompt: q.prompt,
          type: q.type,
          options: q.options,
          correctIndex: q.type === "multiple" ? q.correctIndex : null,
        })),
      };
      const res = await fetch(examId ? `/api/exams/${examId}` : "/api/exams", {
        method: examId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar a prova.");
        setBusy(null);
        return;
      }
      router.push(`/professor/exames/${examId ?? data.id}?saved=${publish ? "published" : "draft"}`);
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {examId ? "Editar prova" : "Nova prova"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Defina as informações, adicione as questões e publique quando estiver pronto.
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Voltar
        </button>
      </div>

      {/* Informações gerais */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Informações da prova</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Título *</label>
            <input
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Ex.: Avaliação de Matemática — 3º bimestre"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Descrição / instruções</label>
            <textarea
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              placeholder="Ex.: Leia as questões com atenção. Você tem até 60 minutos."
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Data/hora limite de entrega</label>
              <input
                type="datetime-local"
                value={draft.deadline}
                onChange={(e) => update({ deadline: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Turmas destinadas</label>
              <input
                value={draft.targetClasses}
                onChange={(e) => update({ targetClasses: e.target.value })}
                placeholder="Ex.: 9º ano A, 9º ano B"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Exibição das questões</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeCard
                active={draft.displayMode === "list"}
                onClick={() => update({ displayMode: "list" })}
                title="Lista vertical única"
                desc="Todas as questões em uma única página, com barra de progresso."
              />
              <ModeCard
                active={draft.displayMode === "paged"}
                onClick={() => update({ displayMode: "paged" })}
                title="Uma questão por página"
                desc="O aluno navega questão a questão, com indicador de progresso."
              />
            </div>
          </div>
        </div>
      </section>

      {/* Questões */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
            Questões ({draft.questions.length})
          </h2>
        </div>
        <div className="space-y-4">
          {draft.questions.map((q, index) => (
            <div key={q.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-slate-900">Questão {index + 1}</p>
                <div className="flex items-center gap-1.5">
                  <select
                    value={q.type}
                    onChange={(e) =>
                      updateQuestion(q.key, {
                        type: e.target.value === "essay" ? "essay" : "multiple",
                        options: e.target.value === "essay" ? [] : q.options.length >= 2 ? q.options : ["", ""],
                        correctIndex: e.target.value === "essay" ? null : q.correctIndex,
                      })
                    }
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400"
                  >
                    <option value="multiple">Múltipla escolha</option>
                    <option value="essay">Dissertativa</option>
                  </select>
                  <button
                    onClick={() => moveQuestion(index, -1)}
                    disabled={index === 0}
                    title="Mover para cima"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => moveQuestion(index, 1)}
                    disabled={index === draft.questions.length - 1}
                    title="Mover para baixo"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeQuestion(q.key)}
                    disabled={draft.questions.length === 1}
                    title="Remover questão"
                    className="rounded-lg border border-rose-200 p-1.5 text-rose-500 transition hover:bg-rose-50 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Editor de enunciado */}
              <div className="mt-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5">
                  <ToolbarButton title="Negrito" onClick={() => applyMarkup("bold")}>
                    <Bold className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton title="Itálico" onClick={() => applyMarkup("italic")}>
                    <Italic className="h-4 w-4" />
                  </ToolbarButton>
                  <span className="mx-1 h-4 w-px bg-slate-200" />
                  <ToolbarButton title="Lista com marcadores" onClick={() => applyMarkup("bullet")}>
                    <List className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton title="Lista numerada" onClick={() => applyMarkup("ordered")}>
                    <ListOrdered className="h-4 w-4" />
                  </ToolbarButton>
                  <span className="ml-auto pr-2 text-[11px] text-slate-400">
                    Selecione o texto e aplique a formatação
                  </span>
                </div>
                <textarea
                  data-qkey={q.key}
                  value={q.prompt}
                  onChange={(e) => updateQuestion(q.key, { prompt: e.target.value })}
                  rows={3}
                  placeholder="Digite o enunciado da questão..."
                  className="w-full resize-y rounded-b-xl border-0 px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-200"
                />
                {q.prompt.trim() && (
                  <div className="border-t border-slate-100 bg-indigo-50/40 px-4 py-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-400">
                      Pré-visualização
                    </p>
                    <div className="text-sm text-slate-800">{renderPrompt(q.prompt)}</div>
                  </div>
                )}
              </div>

              {/* Alternativas */}
              {q.type === "multiple" && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    Alternativas — marque o círculo da resposta correta
                  </p>
                  <div className="space-y-2">
                    {q.options.map((option, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuestion(q.key, { correctIndex: oi })}
                          title="Marcar como correta"
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition",
                            q.correctIndex === oi
                              ? "border-emerald-500 bg-emerald-100 text-emerald-700"
                              : "border-slate-300 text-transparent hover:border-emerald-300"
                          )}
                        >
                          <span className="text-sm font-bold">✓</span>
                        </button>
                        <input
                          value={option}
                          onChange={(e) => {
                            const options = [...q.options];
                            options[oi] = e.target.value;
                            updateQuestion(q.key, { options });
                          }}
                          placeholder={`Alternativa ${String.fromCharCode(65 + oi)}`}
                          className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const options = q.options.filter((_, i) => i !== oi);
                            const correctIndex =
                              q.correctIndex === oi ? null : q.correctIndex !== null && q.correctIndex > oi ? q.correctIndex - 1 : q.correctIndex;
                            updateQuestion(q.key, { options, correctIndex });
                          }}
                          disabled={q.options.length <= 2}
                          title="Remover alternativa"
                          className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateQuestion(q.key, { options: [...q.options, ""] })}
                    disabled={q.options.length >= 8}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar alternativa
                  </button>
                </div>
              )}

              {q.type === "essay" && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  O aluno responderá com texto livre. A correção será feita pelo professor após o envio.
                </p>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addQuestion}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-4 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
        >
          <Plus className="h-4 w-4" /> Adicionar questão
        </button>
      </section>

      {error && (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      {/* Barra de ações */}
      <div className="sticky bottom-0 z-30 mt-6 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-end gap-3">
          <button
            onClick={() => save(false)}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar como rascunho
          </button>
          <button
            onClick={() => save(true)}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Salvar e publicar
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="rounded-md p-1.5 text-slate-600 transition hover:bg-indigo-100 hover:text-indigo-700"
    >
      {children}
    </button>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border-2 p-4 text-left transition",
        active ? "border-indigo-500 bg-indigo-50/60" : "border-slate-200 bg-white hover:border-indigo-200"
      )}
    >
      <p className={cn("text-sm font-semibold", active ? "text-indigo-700" : "text-slate-700")}>{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
    </button>
  );
}
