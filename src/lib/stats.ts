import { eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { exams, submissions } from "@/db/schema";

export type DistributionBucket = { faixa: string; alunos: number; cor: string };

export type GroupStat = { name: string; media: number | null; alunos: number };

export type AdminStats = {
  totalExamsApplied: number;
  totalSubmissions: number;
  avgScore: number | null;
  correctRate: number | null;
  distribution: DistributionBucket[];
  byClass: GroupStat[];
  bySchool: GroupStat[];
};

/** Consolida as métricas do dashboard executivo. */
export async function getAdminStats(): Promise<AdminStats> {
  const [examsApplied] = await db
    .select({ total: sql<number>`count(*)` })
    .from(exams)
    .where(ne(exams.status, "draft"));

  const rows = await db
    .select({
      score: submissions.score,
      studentClass: submissions.studentClass,
      school: submissions.school,
      correctCount: submissions.correctCount,
      totalMultiple: submissions.totalMultiple,
    })
    .from(submissions)
    .innerJoin(exams, eq(submissions.examId, exams.id));

  const withScore = rows.filter((r) => r.score !== null);
  const avgScore =
    withScore.length > 0 ? withScore.reduce((acc, r) => acc + Number(r.score), 0) / withScore.length : null;

  const totalMc = rows.reduce((acc, r) => acc + r.totalMultiple, 0);
  const totalCorrect = rows.reduce((acc, r) => acc + r.correctCount, 0);
  const correctRate = totalMc > 0 ? Math.round((totalCorrect / totalMc) * 1000) / 10 : null;

  const buckets: DistributionBucket[] = [
    { faixa: "0 – 4", min: 0, max: 4 },
    { faixa: "5 – 7", min: 5, max: 7 },
    { faixa: "8 – 10", min: 8, max: 10 },
  ].map((b) => ({
    faixa: b.faixa,
    alunos: withScore.filter((r) => Number(r.score) >= b.min && Number(r.score) <= b.max).length,
    cor: "",
  }));

  const groupBy = (key: (r: (typeof rows)[number]) => string) => {
    const map = new Map<string, { total: number; count: number; alunos: number }>();
    for (const r of rows) {
      const k = key(r).trim() || "Sem turma";
      const item = map.get(k) ?? { total: 0, count: 0, alunos: 0 };
      item.alunos += 1;
      if (r.score !== null) {
        item.total += Number(r.score);
        item.count += 1;
      }
      map.set(k, item);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        media: v.count > 0 ? Math.round((v.total / v.count) * 100) / 100 : null,
        alunos: v.alunos,
      }))
      .sort((a, b) => b.alunos - a.alunos);
  };

  return {
    totalExamsApplied: Number(examsApplied?.total ?? 0),
    totalSubmissions: rows.length,
    avgScore: avgScore === null ? null : Math.round(avgScore * 100) / 100,
    correctRate,
    distribution: buckets,
    byClass: groupBy((r) => r.studentClass),
    bySchool: groupBy((r) => r.school),
  };
}
