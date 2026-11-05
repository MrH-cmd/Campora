"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmt = (v: number) => (v >= 1000 ? `₦${Math.round(v / 1000)}k` : `₦${v}`);

export function SalesChart({ data }: { data: { day: string; value: number }[] }) {
  return (
    <div className="h-64" role="img" aria-label="Sales by day">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7C3AED" stopOpacity={.28} /><stop offset="1" stopColor="#7C3AED" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#2b2340" vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} minTickGap={24} stroke="#9a91b3" />
          <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={12} width={48} stroke="#9a91b3" />
          <Tooltip formatter={(v) => [`₦${Number(v).toLocaleString()}`, "Sales"]} contentStyle={{ borderRadius: 12, border: "1px solid #2b2340", background: "#131019", color: "#f4f0ff" }} />
          <Area type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2.5} fill="url(#fill)" animationDuration={700} />
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
          <CartesianGrid stroke="#2b2340" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#9a91b3" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={32} stroke="#9a91b3" />
          <Tooltip cursor={{ fill: "#ffffff0a" }} contentStyle={{ borderRadius: 12, border: "1px solid #2b2340", background: "#131019", color: "#f4f0ff" }} />
          <Bar dataKey="value" name={label} fill="#a78bfa" radius={[6, 6, 0, 0]} animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
