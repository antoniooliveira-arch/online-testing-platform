"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, LogOut } from "lucide-react";
import Logo from "@/components/logo";

export default function Shell({
  user,
  children,
}: {
  user: { name: string; role: string };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const home = "/admin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href={home} className="flex items-center">
            <Logo className="h-14 w-auto" />
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                <p className="text-[11px] text-slate-400">Professor & Administrador</p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sair"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 sm:flex-row">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <BarChart3 className="h-4 w-4 text-indigo-600" />
            SabeTudo — plataforma de provas online
          </p>
          <p className="text-sm font-medium text-slate-600">
            Desenvolvido pelo Departamento de Tecnologia/SME.
          </p>
        </div>
      </footer>
    </div>
  );
}
