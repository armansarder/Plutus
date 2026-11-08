import { useMemo } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatDateOnly } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";
import type { AppliedEvent, ScenarioResult } from "@/types/financial";

export type ChartSeries = { result: Pick<ScenarioResult, "id" | "dailyBalances" | "lowestBalanceDate" | "lowestBalanceCents">; color: string; dash?: string; shortName: string };

export type ChartMarker = { date: string; tone: "income" | "payment" | "concern"; label: string; detail: string };

const MARKER_COLORS: Record<ChartMarker["tone"], string> = {
  income: "var(--color-accent-foreground)",
  payment: "var(--color-primary)",
  concern: "var(--color-caution)",
};

export function CashFlowChart({ series, events, bufferCents, selectedId, height = 340, markers = [], onMarkerClick }: {
  series: ChartSeries[]; events: AppliedEvent[]; bufferCents?: number | undefined; selectedId?: string | undefined; height?: number;
  markers?: ChartMarker[]; onMarkerClick?: ((marker: ChartMarker) => void) | undefined;
}) {
  const data = useMemo(() => {
    const dates = series[0]?.result.dailyBalances.map((d) => d.date) ?? [];
    return dates.map((date, i) => {
      const row: Record<string, number | string> = { date };
      for (const s of series) row[s.result.id] = (s.result.dailyBalances[i]?.endOfDayBalanceCents ?? 0) / 100;
      return row;
    });
  }, [series]);

  // Event minimums can be below every daily close; keep those markers in view.
  const all = series.flatMap((s) => [s.result.lowestBalanceCents / 100, ...s.result.dailyBalances.map((d) => d.endOfDayBalanceCents / 100)]);
  const min = Math.min(0, ...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.12;
  const yMin = Math.floor((min - pad) / 100) * 100;
  const yMax = Math.ceil((max + pad) / 100) * 100;
  const eventsByDate = new Map<string, AppliedEvent[]>();
  for (const e of events) eventsByDate.set(e.date, [...(eventsByDate.get(e.date) ?? []), e]);
  const markerDates = [...new Set(events.filter((e) => e.type !== "purchase").map((e) => e.date))];

  return (
    <div style={{ height }} className="w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          {yMin < 0 && <ReferenceArea y1={yMin} y2={0} fill="var(--color-destructive)" fillOpacity={0.06} ifOverflow="extendDomain" />}
          {markerDates.map((d) => {
            const income = (eventsByDate.get(d) ?? []).some((e) => e.amountCents > 0);
            return (
              <ReferenceLine key={d} x={d} stroke={income ? "var(--color-primary)" : "var(--color-muted-foreground)"} strokeOpacity={0.35} strokeDasharray="2 4"
                label={{ value: income ? "▲" : "▼", position: "top", fontSize: 10, fill: income ? "var(--color-primary)" : "var(--color-muted-foreground)" }} />
            );
          })}
          <XAxis dataKey="date" tickFormatter={(d) => formatDateOnly(d)} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis domain={[yMin, yMax]} tickFormatter={(v) => formatMoney(v * 100, { whole: true })} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={64} />
          {bufferCents !== undefined && bufferCents > 0 && (
            <ReferenceLine y={bufferCents / 100} stroke="var(--color-caution)" strokeDasharray="6 4"
              label={{ value: `Buffer ${formatMoney(bufferCents, { whole: true })}`, position: "insideTopRight", fontSize: 10, fill: "var(--color-caution-foreground)" }} />
          )}
          <ReferenceLine y={0} stroke="var(--color-foreground)" strokeWidth={1.5}
            label={{ value: "$0", position: "insideBottomLeft", fontSize: 10, fill: "var(--color-foreground)" }} />
          <Tooltip
            content={({ active, label, payload }) => {
              if (!active || !payload?.length) return null;
              const evs = eventsByDate.get(label as string) ?? [];
              return (
                <div className="panel min-w-48 px-3 py-2 text-xs">
                  <div className="mb-1 font-semibold text-foreground">{formatDateOnly(label as string, "EEE, MMM d")}</div>
                  {payload.map((p) => {
                    const s = series.find((x) => x.result.id === p.dataKey);
                    return (
                      <div key={String(p.dataKey)} className="flex justify-between gap-4">
                        <span style={{ color: s?.color }}>{s?.shortName}</span>
                        <span className="font-mono tabular text-foreground">{formatMoney(Number(p.value) * 100)}</span>
                      </div>
                    );
                  })}
                  {evs.length > 0 && (
                    <div className="mt-1.5 border-t border-border pt-1.5 text-muted-foreground">
                      {evs.map((e) => (
                        <div key={e.id}>{e.label} {formatMoney(e.amountCents)} · {e.provenance}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
          />
          {series.map((s) => {
            const dim = selectedId && selectedId !== s.result.id;
            return (
              <Line key={s.result.id} type="stepAfter" dataKey={s.result.id} stroke={s.color} strokeDasharray={s.dash}
                strokeWidth={selectedId === s.result.id ? 3 : 2} strokeOpacity={dim ? 0.3 : 1} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            );
          })}
          {series.map((s) => (
            <ReferenceDot key={`min-${s.result.id}`} x={s.result.lowestBalanceDate} y={s.result.lowestBalanceCents / 100} r={5}
              fill={s.color} stroke="var(--color-card)" strokeWidth={2}
              fillOpacity={selectedId && selectedId !== s.result.id ? 0.35 : 1}
              label={selectedId && selectedId !== s.result.id ? "" : { value: `Low ${formatMoney(s.result.lowestBalanceCents, { whole: true })}`, position: "bottom", fontSize: 11, fontWeight: 600, fill: s.color }} />
          ))}
          {markers.map((m) => {
            const anchor = series.find((s) => s.result.id === selectedId) ?? series[0];
            const y = anchor?.result.dailyBalances.find((d) => d.date === m.date)?.endOfDayBalanceCents;
            if (y === undefined) return null;
            return (
              <ReferenceDot key={`ev-${m.date}-${m.label}`} x={m.date} y={y / 100} r={6}
                fill={MARKER_COLORS[m.tone]} stroke="var(--color-card)" strokeWidth={2}
                style={onMarkerClick ? { cursor: "pointer" } : undefined}
                onClick={() => onMarkerClick?.(m)} />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.result.id} className="flex items-center gap-2">
          <svg width="24" height="8" aria-hidden><line x1="0" y1="4" x2="24" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} /></svg>
          {s.shortName}
        </li>
      ))}
      <li className="flex items-center gap-1.5"><span className="text-primary">▲</span> Income</li>
      <li className="flex items-center gap-1.5"><span>▼</span> Bill / expense</li>
      <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-accent-foreground)" }} /> Money coming in</li>
      <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-primary)" }} /> Planned payment</li>
      <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-caution)" }} /> Budget concern</li>
    </ul>
  );
}
