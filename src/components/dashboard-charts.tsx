"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DistributionBucket, GroupStat } from "@/lib/stats";

const BAR_COLORS = ["#f43f5e", "#f59e0b", "#10b981"];

function fmt(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function DistributionChart({ data }: { data: DistributionBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="faixa" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value) => [`${value} alunos`, "Alunos"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
        />
        <Bar dataKey="alunos" radius={[8, 8, 0, 0]} maxBarSize={72}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupComparisonChart({
  data,
  color,
}: {
  data: GroupStat[];
  color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={data.length > 4 ? -18 : 0}
          textAnchor={data.length > 4 ? "end" : "middle"}
          height={data.length > 4 ? 52 : 30}
        />
        <YAxis domain={[0, 10]} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value, name, props) => [
            `${fmt(Number(value))}`,
            props?.payload ? `Média (${props.payload.alunos} alunos)` : "Média",
          ]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
        />
        <Bar dataKey="media" fill={color} radius={[8, 8, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LegendHint() {
  return (
    <p className="text-[11px] text-slate-400">
      Notas de 0 a 10 calculadas automaticamente sobre as questões de múltipla escolha.
    </p>
  );
}

export { Legend };
