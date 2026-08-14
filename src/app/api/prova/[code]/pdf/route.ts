import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { exams } from "@/db/schema";
import { isExamClosed } from "@/lib/utils";

type Ctx = { params: Promise<{ code: string }> };

/**
 * Endpoint público que entrega o arquivo PDF da prova para visualização.
 * Só está disponível enquanto a prova estiver ativa (mesma regra do acesso às questões).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const code = ((await params).code ?? "").trim().toUpperCase();
  const [exam] = await db.select().from(exams).where(eq(exams.slug, code)).limit(1);

  if (!exam || exam.status === "draft" || isExamClosed(exam) || !exam.pdfData) {
    return NextResponse.json({ ok: false, error: "Prova não encontrada." }, { status: 404 });
  }

  const buffer = Buffer.from(exam.pdfData, "base64");
  const safeName = (exam.pdfName ?? "prova.pdf").replace(/[^\w.\- ]/g, "");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}