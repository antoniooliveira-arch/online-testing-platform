import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildSubmissionCsv, type ExportFilters } from "@/lib/exports";

function parseFilters(url: URL): ExportFilters {
  const examId = url.searchParams.get("examId");
  return {
    examId: examId ? Number(examId) : undefined,
    school: url.searchParams.get("school") || undefined,
    studentClass: url.searchParams.get("class") || undefined,
    search: url.searchParams.get("search") || undefined,
  };
}

/** Exporta as respostas em CSV (abre direto no Excel). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { csv, filename } = await buildSubmissionCsv(user, parseFilters(new URL(req.url)));

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
