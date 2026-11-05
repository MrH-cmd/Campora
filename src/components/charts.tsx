"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmt = (v: number) => (v >= 1000 ? `₦${Math.round(v / 1000)}k` : `₦${v}`);

export function SalesChart({ data }: { data: { day: string; value: number }[] }) {
  return (
    <div className="h-64" role="img" aria-label="Sales by day">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B8F5A" stopOpacity={.28} /><stop offset="1" stopColor="#0B8F5A" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#e8ecea" vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} minTickGap={24} stroke="#6b7691" />
          <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={12} width={48} stroke="#6b7691" />
          <Tooltip formatter={(v) => [`₦${Number(v).toLocaleString()}`, "Sales"]} contentStyle={{ borderRadius: 12, border: "1px solid #dfe4e3" }} />
          <Area type="monotone" dataKey="value" stroke="#0B8F5A" strokeWidth={2.5} fill="url(#fill)" animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountBars({ data, label }: { data: { name: string; value: number }[]; label: string }) {
  return (
    <div className="h-56" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#e8ecea" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#6b7691" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={32} stroke="#6b7691" />
          <Tooltip cursor={{ fill: "#12203f0a" }} contentStyle={{ borderRadius: 12, border: "1px solid #dfe4e3" }} />
          <Bar dataKey="value" name={label} fill="#12203f" radius={[6, 6, 0, 0]} animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
