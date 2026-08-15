"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  SearchX,
  Send,
  UserRound,
} from "lucide-react";
import { renderPrompt } from "@/lib/markdown";
import { cn, formatDateTime } from "@/lib/utils";

type StudentAlternativa = { id: number; letra: string; texto: string };

type StudentQuestion = {
  id: number;
  numero: number;
  pergunta: string;
  tipo: "multiple" | "essay";
  valor: number;
  ordem: number;
  alternativas: StudentAlternativa[];
};

type ExamInfo = {
  id: number;
  titulo: string;
  disciplina: string;
  turma: string;
  instrucoes: string;
  dataInicio: string | null;
  dataFim: string | null;
  arquivoNome?: string | null;
};

type SchoolAluno = { id: string; nome: string; numeroChamada: number | null };
type SchoolTurma = {
  id: string;
  nome: string;
  ano: string;
  turno: string;
  professor: string | null;
  alunos: SchoolAluno[];
};
type SchoolOption = { id: string; nome: string; turmas: SchoolTurma[] };

type Identify = {
  studentName: string;
  studentClass: string;
  school: string;
  escolaId: string;
  turmaId: string;
  alunoId: string;
};
type AnswerMap = Record<number, { alternativaId: number | null; textoResposta: string }>;

type Result = { acertos: number; erros: number; nota: number; percentual: number };

type Stage = "loading" | "notfound" | "closed" | "identify" | "exam" | "done";

const STORAGE_KEY_PREFIX = "avalialab:prova:";

export default function ExamPlayer({ code }: { code: string }) {
  const [stage, setStage] = useState<Stage>("loading");
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [identify, setIdentify] = useState<Identify>({
    studentName: "",
    studentClass: "",
    school: "",
    escolaId: "",
    turmaId: "",
    alunoId: "",
  });
  const [schoolData, setSchoolData] = useState<SchoolOption[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const loadedRef = useRef(false);
  const storageKey = `${STORAGE_KEY_PREFIX}${code.toUpperCase()}`;

  // Carrega a prova
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/prova/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setStage("notfound");
          return;
        }
        if (data.alreadySubmitted && data.result && data.aluno) {
          setExam(data.exam);
          setAlreadyDone(true);
          setIdentify({
            studentName: data.aluno.nome,
            studentClass: data.aluno.turma,
            school: data.aluno.escola,
            escolaId: "",
            turmaId: data.aluno.turmaId,
            alunoId: data.aluno.id,
          });
          setResult(data.result);
          setStage("done");
          return;
        }
        if (data.closed) {
          setExam(data.exam);
          setStage("closed");
          return;
        }
        setExam(data.exam);
        setQuestions(data.questions);
        if (data.aluno) {
          // Aluno logado: identidade vem da sessão, sem etapa de identificação
          setIdentify({
            studentName: data.aluno.nome,
            studentClass: data.aluno.turma,
            school: data.aluno.escola,
            escolaId: "",
            turmaId: data.aluno.turmaId,
            alunoId: data.aluno.id,
          });
          setStage("exam");
        } else {
          setStage("identify");
        }
      } catch {
        if (!cancelled) setStage("notfound");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Carrega as escolas/turmas/alunos reais para a identificação
  useEffect(() => {
    let cancelled = false;
    fetch("/api/escolas")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) setSchoolData(data.escolas);
      })
      .catch(() => {
        /* mantém identificação livre se a consulta falhar */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEscola = schoolData.find((e) => e.id === identify.escolaId);
  const selectedTurma = selectedEscola?.turmas.find((t) => t.id === identify.turmaId);

  // Todos os alunos da escola selecionada (deduplicados), com a turma de cada um.
  const escolaAlunos = useMemo(() => {
    if (!selectedEscola) return [] as { id: string; nome: string; numeroChamada: number | null; turmaId: string; turmaNome: string }[];
    const seen = new Map<string, { id: string; nome: string; numeroChamada: number | null; turmaId: string; turmaNome: string }>();
    for (const t of selectedEscola.turmas) {
      for (const a of t.alunos) {
        if (!seen.has(a.id)) seen.set(a.id, { ...a, turmaId: t.id, turmaNome: t.nome });
      }
    }
    return Array.from(seen.values()).sort(
      (x, y) =>
        x.turmaNome.localeCompare(y.turmaNome) || (x.numeroChamada ?? 0) - (y.numeroChamada ?? 0)
    );
  }, [selectedEscola]);

  // Restaura o rascunho salvo automaticamente
  useEffect(() => {
    if (stage !== "identify" && stage !== "exam") return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { identify?: Identify; answers?: AnswerMap };
      if (saved.identify?.studentName) {
        setIdentify(saved.identify);
        if (saved.answers) {
          setAnswers(saved.answers);
          setStage("exam");
        }
      }
    } catch {
      /* ignora rascunho corrompido */
    }
  }, [stage, storageKey]);

  // Autosave contínuo (proteção contra perda de conexão)
  useEffect(() => {
    if (stage !== "identify" && stage !== "exam") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ identify, answers }));
    } catch {
      /* armazenamento indisponível */
    }
  }, [identify, answers, stage, storageKey]);

  const answeredCount = useMemo(
    () =>
      questions.filter((q) => {
        const a = answers[q.id];
        if (!a) return false;
        return q.tipo === "multiple" ? a.alternativaId !== null : Boolean(a.textoResposta?.trim());
      }).length,
    [questions, answers]
  );

  const unanswered = useMemo(
    () =>
      questions
        .filter((q) => {
          const a = answers[q.id];
          if (q.tipo === "essay") return false;
          return !a || a.alternativaId === null;
        })
        .map((q) => q.numero),
    [questions, answers]
  );

  function startExam(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!identify.escolaId) {
      setError("Selecione a sua escola.");
      return;
    }
    if (!identify.turmaId) {
      setError("Selecione a sua turma.");
      return;
    }
    const aluno = escolaAlunos.find((a) => a.id === identify.alunoId);
    if (!aluno) {
      setError("Selecione o seu nome na lista de alunos da escola.");
      return;
    }
    setIdentify((prev) => ({
      ...prev,
      studentName: aluno.nome,
      studentClass: aluno.turmaNome,
      school: selectedEscola!.nome,
      turmaId: aluno.turmaId,
      alunoId: aluno.id,
    }));
    setStage("exam");
    window.scrollTo({ top: 0 });
  }

  function setAnswer(q: StudentQuestion, value: { alternativaId?: number | null; textoResposta?: string }) {
    setAnswers((prev) => ({
      ...prev,
      [q.id]: {
        alternativaId: value.alternativaId ?? prev[q.id]?.alternativaId ?? null,
        textoResposta: value.textoResposta ?? prev[q.id]?.textoResposta ?? "",
      },
    }));
  }

  function openReview() {
    setError("");
    if (unanswered.length > 0) {
      setError(`Responda as questões de múltipla escolha em branco: ${unanswered.join(", ")}.`);
      return;
    }
    setReviewing(true);
    window.scrollTo({ top: 0 });
  }

  const submitExam = useCallback(async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: code,
          studentName: identify.studentName,
          studentClass: identify.studentClass,
          school: identify.school,
          alunoId: identify.alunoId,
          turmaId: identify.turmaId,
          answers: questions.map((q) => {
            const a = answers[q.id];
            return {
              questaoId: q.id,
              alternativaId: q.tipo === "multiple" ? (a?.alternativaId ?? null) : null,
              textoResposta: q.tipo === "essay" ? a?.textoResposta ?? "" : "",
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível enviar a prova. Tente novamente.");
        setSubmitting(false);
        return;
      }
      localStorage.removeItem(storageKey);
      setResult({
        acertos: data.acertos,
        erros: data.erros,
        nota: data.nota,
        percentual: data.percentual,
      });
      setReviewing(false);
      setStage("done");
      window.scrollTo({ top: 0 });
    } catch {
      setError("Erro de conexão. Suas respostas estão salvas — tente enviar novamente.");
      setSubmitting(false);
    }
  }, [unanswered, questions, answers, identify, code, storageKey]);

  // ------------------------- TELAS -------------------------

  if (stage === "loading") {
    return (
      <Centered>
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        <p className="mt-4 font-medium text-slate-600">Carregando prova...</p>
      </Centered>
    );
  }

  if (stage === "notfound") {
    return (
      <Centered>
        <Card className="text-center">
          <SearchX className="mx-auto h-12 w-12 text-slate-400" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Prova não encontrada</h1>
          <p className="mt-2 text-sm text-slate-600">
            Verifique o código digitado ou confirme o link com o seu professor.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </Link>
        </Card>
      </Centered>
    );
  }

  if (stage === "closed") {
    return (
      <Centered>
        <Card className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Prova encerrada</h1>
          <p className="mt-2 text-sm text-slate-600">
            O prazo para envio de <strong>{exam?.titulo}</strong> já passou.
            {exam?.dataFim && <> Prazo: {formatDateTime(exam.dataFim)}.</>}
          </p>
          <p className="mt-1 text-sm text-slate-500">Fale com o seu professor caso isso seja um erro.</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </Link>
        </Card>
      </Centered>
    );
  }

  if (stage === "identify") {
    return (
      <Centered>
        <Card className="w-full">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <ClipboardList className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{exam?.titulo}</h1>
              {exam?.disciplina && <p className="text-sm text-slate-500">{exam.disciplina}</p>}
            </div>
          </div>
          <p className="mt-5 text-sm font-medium text-slate-700">Identificação do aluno</p>
          <p className="mt-1 text-xs text-slate-500">
            Preencha seus dados para liberar o acesso às questões — sem necessidade de senha.
          </p>
          <form onSubmit={startExam} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Escola"
                value={identify.escolaId}
                onChange={(v) =>
                  setIdentify((p) => ({ ...p, escolaId: v, turmaId: "", alunoId: "", studentName: "", studentClass: "", school: "" }))
                }
                placeholder="Selecione a escola"
                options={schoolData.map((e) => ({ value: e.id, label: e.nome }))}
              />
              <Select
                label="Turma"
                value={identify.turmaId}
                onChange={(v) =>
                  setIdentify((p) => ({ ...p, turmaId: v, alunoId: "", studentName: "", studentClass: "", school: "" }))
                }
                placeholder={selectedEscola ? "Selecione a turma" : "Escolha a escola primeiro"}
                disabled={!selectedEscola}
                options={selectedEscola?.turmas.map((t) => ({ value: t.id, label: t.nome })) ?? []}
              />
            </div>
            <div>
              <Select
                label="Nome do aluno"
                value={identify.alunoId}
                onChange={(v) => {
                  const al = escolaAlunos.find((a) => a.id === v);
                  setIdentify((p) => ({
                    ...p,
                    alunoId: v,
                    studentName: al?.nome ?? "",
                    turmaId: al?.turmaId ?? p.turmaId,
                    studentClass: al?.turmaNome ?? "",
                  }));
                }}
                placeholder={
                  escolaAlunos.length > 0
                    ? "Selecione o seu nome"
                    : "Escolha a escola para ver os alunos"
                }
                disabled={!selectedEscola}
                options={escolaAlunos.map((a) => ({
                  value: a.id,
                  label: `${String(a.numeroChamada ?? 0).padStart(3, "0")} — ${a.nome} · ${a.turmaNome}`,
                }))}
              />
              {selectedEscola && escolaAlunos.length > 0 && (
                <p className="mt-1.5 text-xs text-slate-400">
                  {escolaAlunos.length} alunos · todos os nomes da escola, com a turma indicada
                  {selectedTurma ? ` (filtro: ${selectedTurma.nome})` : ""}
                </p>
              )}
            </div>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500"
            >
              Começar a prova <ArrowRight />
            </button>
            {exam?.dataFim && (
              <p className="text-center text-xs text-slate-400">
                Prazo de entrega: {formatDateTime(exam.dataFim)}
              </p>
            )}
          </form>
        </Card>
      </Centered>
    );
  }

  if (stage === "done") {
    return (
      <Centered>
        <Card className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-slate-900">
            {alreadyDone ? "Resultado da prova" : "Prova enviada com sucesso!"}
          </h1>
          <p className="mt-2 text-slate-600">
            {alreadyDone ? (
              <>
                Você já enviou esta prova, <strong>{identify.studentName}</strong>. Confira o
                resultado da correção automática abaixo.
              </>
            ) : (
              <>
                Obrigado, <strong>{identify.studentName}</strong>! Suas respostas da prova{" "}
                <strong>{exam?.titulo}</strong> foram encaminhadas ao professor/administrador.
              </>
            )}
          </p>
          {result && (
            <div className="mx-auto mt-5 max-w-sm rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800">
                Resultado da parte objetiva (correção automática)
              </p>
              <p className="mt-1 text-3xl font-extrabold text-emerald-700">
                {result.acertos} acertos · {result.erros} erros
              </p>
              <p className="text-xs font-medium text-emerald-700/80">
                Nota: {result.nota.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de 10 ·{" "}
                {result.percentual.toLocaleString("pt-BR")}%
              </p>
              <p className="mt-2 text-[11px] text-emerald-700/70">
                Questões dissertativas serão corrigidas pelo professor.
              </p>
            </div>
          )}
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            {identify.alunoId && (
              <Link
                href="/aluno/painel"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                <ClipboardList className="h-4 w-4" /> Voltar para minhas provas
              </Link>
            )}
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar ao início
            </Link>
          </div>
        </Card>
      </Centered>
    );
  }

  // ------------------------- REVISÃO -------------------------

  if (reviewing) {
    return (
      <div className="min-h-screen bg-slate-100">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-sm font-bold text-slate-900">Revisar respostas</h1>
                <p className="text-xs text-slate-400">{exam?.titulo}</p>
              </div>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
              {answeredCount} de {questions.length}
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6">
          <p className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900/80">
            Confira suas respostas antes de enviar. Após o envio não será possível alterá-las.
          </p>

          <div className="mt-4 space-y-3">
            {questions.map((q) => {
              const a = answers[q.id];
              const selectedAlt = q.tipo === "multiple" ? q.alternativas.find((alt) => alt.id === a?.alternativaId) : null;
              return (
                <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                      {q.numero}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-slate-900">{renderPrompt(q.pergunta)}</p>
                      <div className="mt-2">
                        {q.tipo === "multiple" ? (
                          selectedAlt ? (
                            <span className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
                                {selectedAlt.letra}
                              </span>
                              {selectedAlt.texto}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-rose-500">Sem resposta</span>
                          )
                        ) : a?.textoResposta?.trim() ? (
                          <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                            {a.textoResposta}
                          </p>
                        ) : (
                          <span className="text-xs font-medium text-rose-500">Sem resposta</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </p>
          )}

          <div className="sticky bottom-0 mt-6 border-t border-slate-200 bg-white/95 py-4 backdrop-blur">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setReviewing(false)}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar para a prova
              </button>
              <button
                type="button"
                onClick={submitExam}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? "Enviando..." : "Confirmar e Enviar Prova"}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Questões dissertativas serão corrigidas pelo professor.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ------------------------- PROVA -------------------------

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <GraduationCap className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">{exam?.titulo}</h1>
                <p className="truncate text-xs text-slate-400">
                  {identify.studentName} • {identify.studentClass} • {identify.school}
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
              <UserRound className="h-3.5 w-3.5" />
              {answeredCount} de {questions.length}
            </span>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-32 pt-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="mx-auto w-full max-w-3xl">
            {exam?.instrucoes && (
              <p className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900/80">
                {exam.instrucoes}
              </p>
            )}

            {exam?.arquivoNome && (
              <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{exam.arquivoNome}</p>
                      <p className="text-xs text-slate-400">Prova em PDF — você pode visualizar enquanto responde.</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={`/api/prova/${encodeURIComponent(code)}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowPdf((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                        showPdf
                          ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          : "bg-indigo-600 text-white hover:bg-indigo-500"
                      )}
                    >
                      {showPdf ? "Ocultar PDF" : "Ver PDF"}
                    </button>
                  </div>
                </div>
                {showPdf && (
                  <iframe
                    src={`/api/prova/${encodeURIComponent(code)}/pdf`}
                    title="Prova em PDF"
                    className="mt-3 h-[70vh] w-full rounded-xl border border-slate-200 bg-slate-50"
                  />
                )}
              </div>
            )}

            {questions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                answer={answers[q.id]}
                onAnswer={(value) => setAnswer(q, value)}
                id={`q-${q.id}`}
              />
            ))}

            {error && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
          </div>

          {/* Gabarito fixo à direita */}
          <aside className="hidden lg:block">
            <GabaritoPanel
              questions={questions}
              answers={answers}
              onMark={(q, alternativaId) => setAnswer(q, { alternativaId })}
              onNavigate={(index) => {
                document
                  .getElementById(`q-${questions[index].id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />
          </aside>
        </div>
      </main>

      {/* Barra inferior de envio */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="text-xs text-slate-400">
            <p className="font-semibold text-slate-600">
              {answeredCount} de {questions.length} respondidas
            </p>
            {exam?.dataFim && <p>Prazo: {formatDateTime(exam.dataFim)}</p>}
          </div>
          <button
            onClick={openReview}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            <Send className="h-4 w-4" />
            Revisar e Enviar Prova
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- subcomponentes ------------------------- */

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 px-4 py-10">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-white p-6 shadow-xl shadow-indigo-950/20 sm:p-8", className)}>{children}</div>;
}

function Select({
  label,
  value,
  onChange,
  placeholder,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="" disabled>
          {placeholder ?? "Selecione..."}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function GabaritoPanel({
  questions,
  answers,
  onMark,
  onNavigate,
}: {
  questions: StudentQuestion[];
  answers: AnswerMap;
  onMark: (q: StudentQuestion, alternativaId: number) => void;
  onNavigate: (index: number) => void;
}) {
  const answered = questions.filter((q) => {
    const a = answers[q.id];
    return q.tipo === "essay" ? Boolean(a?.textoResposta?.trim()) : a?.alternativaId !== null && a?.alternativaId !== undefined;
  }).length;

  return (
    <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Gabarito</h2>
          <p className="text-[11px] text-slate-400">
            {answered} de {questions.length} respondidas
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {questions.map((q, qi) => {
          const answer = answers[q.id];
          const selected = answer?.alternativaId ?? null;
          const selectedAlt = selected !== null ? q.alternativas.find((a) => a.id === selected) : null;
          return (
            <div key={q.id} className="rounded-xl border border-slate-200 p-2.5 transition">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate(qi)}
                  className="text-xs font-bold text-slate-700 transition hover:text-indigo-600"
                >
                  Questão {q.numero}
                </button>
                {q.tipo === "essay" ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    Dissertativa
                  </span>
                ) : selectedAlt ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                    {selectedAlt.letra}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                    Em branco
                  </span>
                )}
              </div>
              {q.tipo === "multiple" && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {q.alternativas.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onMark(q, a.id)}
                      title={`Marcar alternativa ${a.letra}`}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition",
                        selected === a.id
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700"
                      )}
                    >
                      {a.letra}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  answer,
  onAnswer,
  id,
}: {
  question: StudentQuestion;
  answer?: { alternativaId: number | null; textoResposta: string };
  onAnswer: (value: { alternativaId?: number | null; textoResposta?: string }) => void;
  id?: string;
}) {
  return (
    <div id={id} className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          {question.numero}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[15px] leading-relaxed text-slate-900">{renderPrompt(question.pergunta)}</div>
          <span className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {question.tipo === "multiple" ? "Múltipla escolha" : "Dissertativa"}
            {question.tipo === "multiple" && ` · valor ${question.valor}`}
          </span>
        </div>
      </div>

      {question.tipo === "multiple" ? (
        <div className="mt-4 space-y-2">
          {question.alternativas.map((a) => {
            const selected = answer?.alternativaId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onAnswer({ alternativaId: a.id })}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                  selected
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                    : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                  )}
                >
                  {a.letra}
                </span>
                <span className="text-sm text-slate-800">{a.texto}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4">
          <textarea
            value={answer?.textoResposta ?? ""}
            onChange={(e) => onAnswer({ textoResposta: e.target.value })}
            rows={5}
            placeholder="Escreva sua resposta aqui..."
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>
      )}
    </div>
  );
}