import { asc, eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos, escolas, matriculas, turmas } from "@/db/schema";

export const dynamic = "force-dynamic";

const ANO_LETIVO = 2026;

/**
 * Endpoint público usado na identificação do aluno (tela da prova).
 * Retorna escolas com suas turmas e os alunos matriculados no ano letivo.
 */
export async function GET() {
  const schools = await db.select().from(escolas).orderBy(asc(escolas.nome));

  const turmasRows = await db
    .select()
    .from(turmas)
    .where(eq(turmas.anoLetivo, ANO_LETIVO))
    .orderBy(asc(turmas.nome));

  const matRows = await db
    .select({
      alunoId: matriculas.alunoId,
      turmaId: matriculas.turmaId,
      nome: alunos.nome,
      numeroChamada: alunos.numeroChamada,
    })
    .from(matriculas)
    .innerJoin(alunos, eq(matriculas.alunoId, alunos.id))
    .where(
      and(eq(matriculas.anoLetivo, ANO_LETIVO), eq(matriculas.status, "ativo"))
    )
    .orderBy(asc(alunos.numeroChamada));

  const byTurma = new Map<string, { id: string; nome: string; numeroChamada: number | null }[]>();
  for (const m of matRows) {
    const list = byTurma.get(m.turmaId) ?? [];
    list.push({ id: m.alunoId, nome: m.nome, numeroChamada: m.numeroChamada });
    byTurma.set(m.turmaId, list);
  }

  const result = schools.map((e) => ({
    id: e.id,
    nome: e.nome,
    turmas: turmasRows
      .filter((t) => t.escolaId === e.id)
      .map((t) => ({
        id: t.id,
        nome: t.nome,
        ano: t.ano,
        turno: t.turno,
        professor: t.professor,
        alunos: byTurma.get(t.id) ?? [],
      })),
  }));

  return NextResponse.json({ ok: true, anoLetivo: ANO_LETIVO, escolas: result });
}
