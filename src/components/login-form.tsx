"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2, LogIn } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível entrar.");
        setLoading(false);
        return;
      }
      router.push(data.redirectTo);
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900">Entrar na plataforma</h2>
      <p className="mt-1 text-sm text-slate-500">Use suas credenciais de professor ou administrador.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@escola.com"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
            Senha
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-indigo-800">
          <Info className="h-4 w-4" /> Contas de demonstração
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-indigo-900/80">
          <li>
            <span className="font-mono">admin@avalialab.com.br</span> · senha{" "}
            <span className="font-mono">admin123</span> — administrador
          </li>
          <li>
            <span className="font-mono">ana.souza@avalialab.com.br</span> · senha{" "}
            <span className="font-mono">prof123</span> — professora
          </li>
          <li>
            <span className="font-mono">carlos.lima@avalialab.com.br</span> · senha{" "}
            <span className="font-mono">prof123</span> — professor
          </li>
        </ul>
      </div>
    </div>
  );
}
