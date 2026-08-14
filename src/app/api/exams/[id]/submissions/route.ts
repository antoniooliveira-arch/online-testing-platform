import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { exams, submissions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Lista as submissões de uma prova (professor dono ou admin). */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const id = Number((await params).id);
  const [exam] = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (user.role !== "admin" && user.id !== exam.teacherId) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.examId, id))
    .orderBy(asc(submissions.submittedAt));

  return NextResponse.json({
    ok: true,
    exam: { id: exam.id, title: exam.title, slug: exam.slug },
    submissions: rows.map((s) => ({
      ...s,
      submittedAt: s.submittedAt.toISOString(),
      score: s.score === null ? null : Number(s.score),
    })),
  });
}
