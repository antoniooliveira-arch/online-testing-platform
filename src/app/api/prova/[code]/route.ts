import { asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alternativas, provas, questoes } from "@/db/schema";
import { isExamClosed, notYetOpen } from "@/lib/utils";

type Ctx = { params: Promise<{ code: string }> };

/**
 * Endpoint público usado pela tela do aluno.
 * Nunca expõe a alternativa correta das questões.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const code = ((await params).code ?? "").trim().toUpperCase();
  const [prova] = await db.select().from(provas).where(eq(provas.codigo, code)).limit(1);

  if (!prova || prova.status === "draft") {
    return NextResponse.json({ ok: false, error: "Prova não encontrada. Verifique o código." }, { status: 404 });
  }

  const closed = isExamClosed(prova);
  const notOpen = notYetOpen(prova);
  const baseExam = {
    id: prova.id,
    titulo: prova.titulo,
    disciplina: prova.disciplina,
    turma: prova.turma,
    instrucoes: prova.instrucoes,
    dataInicio: prova.dataInicio ? prova.dataInicio.toISOString() : null,
    dataFim: prova.dataFim ? prova.dataFim.toISOString() : null,
    arquivoNome: prova.arquivoNome,
  };

  if (closed) {
    return NextResponse.json(
      {
        ok: true,
        closed: true,
        notOpen: false,
        exam: baseExam,
      },
      { status: 200 }
    );
  }

  const qs = await db
    .select()
    .from(questoes)
    .where(eq(questoes.provaId, prova.id))
    .orderBy(asc(questoes.ordem));

  const qIds = qs.map((q) => q.id);
  const allAlts =
    qIds.length > 0
      ? await db
          .select({ id: alternativas.id, questaoId: alternativas.questaoId, letra: alternativas.letra, texto: alternativas.texto })
          .from(alternativas)
          .where(inArray(alternativas.questaoId, qIds))
      : [];
  const altByQuestao = new Map<number, (typeof allAlts)[number][]>();
  for (const a of allAlts) {
    if (!altByQuestao.has(a.questaoId)) altByQuestao.set(a.questaoId, []);
    altByQuestao.get(a.questaoId)!.push(a);
  }

  return NextResponse.json({
    ok: true,
    closed: false,
    notOpen,
    exam: baseExam,
    questions: qs.map((q) => ({
      id: q.id,
      numero: q.numero,
      pergunta: q.pergunta,
      tipo: q.tipo,
      valor: Number(q.valor),
      ordem: q.ordem,
      alternativas: (altByQuestao.get(q.id) ?? []).map((a) => ({ id: a.id, letra: a.letra, texto: a.texto })),
    })),
  });
}