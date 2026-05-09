import React from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

export default function ChartCard({ title, subtitle, data = [], emptyMessage = "No data available." }) {
  return (
    <div className="lg:col-span-2 soft-card rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{subtitle}</div>
      <div className="font-heading text-xl font-semibold mt-0.5">{title}</div>
      {data.length === 0 ? <div className="mt-4 text-sm text-muted-foreground">{emptyMessage}</div> : <div className="h-48 mt-5"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><XAxis dataKey="d" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} /><Tooltip /><Area type="monotone" dataKey="h" stroke="hsl(var(--primary))" strokeWidth={2} fill="hsl(var(--accent))" fillOpacity={0.45} /></AreaChart></ResponsiveContainer></div>}
    </div>
  );
}
