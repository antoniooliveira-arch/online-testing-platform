import Link from "next/link";
import { ArrowLeft, GraduationCap, UserRound } from "lucide-react";
import AccessForm from "@/components/access-form";

export default function AlunoPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600">
      <header className="mx-auto w-full max-w-5xl px-4 py-6">
        <Link href="/" className="inline-flex items-center gap-2 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">
            Avalia<span className="text-indigo-200">Lab</span>
          </span>
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 pb-20 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white">
          <UserRound className="h-4 w-4" /> Acesso do aluno
        </span>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
          Responda sua prova sem cadastro
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-indigo-100">
          Digite o código da prova informado pelo seu professor e comece a responder agora mesmo.
        </p>

        <div className="mt-8 w-full">
          <AccessForm />
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-indigo-100 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao início
        </Link>
      </main>
    </div>
  );
}
