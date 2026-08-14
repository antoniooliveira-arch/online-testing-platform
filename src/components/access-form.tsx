"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound } from "lucide-react";

/** Formulário de acesso rápido do aluno pelo código da prova. */
export default function AccessForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!value) {
      setError("Digite o código da prova.");
      return;
    }
    router.push(`/prova/${encodeURIComponent(value.toUpperCase())}`);
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-xl">
      <div className="flex flex-col gap-3 rounded-2xl bg-white/95 p-3 shadow-xl shadow-indigo-900/20 backdrop-blur sm:flex-row">
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            placeholder="Digite o código da prova (ex.: K7M2QX9P)"
            className="w-full rounded-xl border-0 bg-slate-100 py-3.5 pl-11 pr-4 text-base font-medium tracking-wider text-slate-900 outline-none ring-indigo-500 placeholder:text-slate-400 placeholder:tracking-normal focus:ring-2"
            maxLength={20}
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-500 active:scale-[0.98]"
        >
          Acessar prova
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
      {error && <p className="mt-2 text-center text-sm font-medium text-rose-100">{error}</p>}
      <p className="mt-3 text-center text-sm text-indigo-100/80">
        Sem cadastro e sem senha: informe apenas nome, turma e escola.
      </p>
    </form>
  );
}
