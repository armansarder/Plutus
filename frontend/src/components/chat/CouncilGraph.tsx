import { useId, useState } from "react";
import { LineChart, Line, ReferenceLine, ReferenceDot, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { centsValue } from "@/services/engine";
import { formatMoney } from "@/lib/formatMoney";
import { formatDateOnly } from "@/lib/dateOnly";
import type { CouncilRun } from "@/types/council";

type Chart = NonNullable<CouncilRun["chart"]>;
type Series = Chart["series"][number];
const NAMES = {baseline: "Without the purchase", purchase: "Buy on your selected date", buy_later: "Buy later", delayed_income: "Income arrives 3 days late", unexpected_expense: "An extra $200 expense"};
const DESCRIPTIONS = {baseline: "Your scheduled income and expenses, with no purchase.", purchase: "The purchase on the date you chose.", buy_later: "The alternative purchase date tested by the simulator.", delayed_income: "Your purchase, with the next income delayed.", unexpected_expense: "Your purchase, plus a hypothetical extra expense."};
const COLORS = {baseline: "#475569", purchase: "#0369a1", buy_later: "#047857", delayed_income: "#a16207", unexpected_expense: "#b91c1c"};
const compactMoney = (cents: number) => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1}).format(cents / 100);

function niceStep(raw: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const unit = raw / magnitude;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * magnitude;
}
export function chartDomain(chart: Chart): [number, number] {
  const values = [0, centsValue(chart.reserve), ...chart.series.flatMap(s => s.points.map(p => centsValue(p.balance))), ...chart.markers.map(m => centsValue(m.balance))];
  const low = Math.min(...values), high = Math.max(...values);
  const span = Math.max(10000, high - low), step = niceStep(span / 4);
  const pad = span * .05;
  return [Math.floor((low - pad) / step) * step, Math.ceil((high + pad) / step) * step];
}
export function CouncilGraph({chart}: {chart: Chart}) {
  const [view, setView] = useState<"separate" | "focus">("separate");
  const [selected, setSelected] = useState<Series["scenario"]>(chart.series.some(s => s.scenario === "purchase") ? "purchase" : chart.series[0]!.scenario);
  const [compare, setCompare] = useState(false);
  const selectionId = useId();
  const domain = chartDomain(chart);
  const baseline = chart.series.find(s => s.scenario === "baseline");
  const focused = chart.series.find(s => s.scenario === selected) ?? chart.series[0]!;
  return <section className="min-w-0" aria-label="Verified scenario projections">
    <h3 className="font-semibold">Projected balances and reserve</h3>
    <p className="mt-2 text-sm text-muted-foreground">See each outcome separately. Every chart uses the same dates and dollar scale, so you can compare them fairly.</p>
    <div className="my-4 flex flex-wrap gap-2" role="group" aria-label="Chart layout">
      <Button size="sm" variant={view === "separate" ? "default" : "outline"} aria-pressed={view === "separate"} onClick={() => setView("separate")}>Separate charts</Button>
      <Button size="sm" variant={view === "focus" ? "default" : "outline"} aria-pressed={view === "focus"} onClick={() => setView("focus")}>Focus on one</Button>
    </div>
    <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="inline-block w-7 border-t-2 border-dashed border-amber-700" />{formatMoney(centsValue(chart.reserve))} cash buffer</span><span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-700" />Lowest balance, including between transactions</span></div>
    {view === "separate" ? <div className="grid min-w-0 gap-4 md:grid-cols-2">{chart.series.map(s => <ScenarioPanel key={s.scenario} chart={chart} series={s} domain={domain} onFocus={() => {setSelected(s.scenario); setCompare(false); setView("focus");}} />)}</div> : <div>
      <div className="mb-4 flex flex-wrap items-center gap-3"><label htmlFor={selectionId} className="text-sm font-medium">Scenario to inspect</label><select id={selectionId} className="max-w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={selected} onChange={e => setSelected(e.target.value as Series["scenario"])}>{chart.series.map(s => <option key={s.scenario} value={s.scenario}>{NAMES[s.scenario]}</option>)}</select>
      {baseline && selected !== "baseline" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} />Compare with no purchase</label>}</div>
      <ScenarioPanel chart={chart} series={focused} domain={domain} large baseline={compare && selected !== "baseline" ? baseline : undefined} />
    </div>}
    <p className="mt-4 text-xs text-muted-foreground">Lines show daily closing balances. A lowest-balance dot can sit below the line if a bill is paid before income arrives that day. These are projections based on supplied events. Only applicable scenarios are shown; a late-income chart requires eligible future income.</p>
    <details className="mt-4 rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm">View exact values and shortfall dates</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Lowest balances and first cash-buffer breaches</caption><thead><tr><th className="p-2">Scenario</th><th className="p-2">What happened</th><th className="p-2">Date</th><th className="p-2">Balance</th></tr></thead><tbody>{chart.markers.map((m, i) => <tr key={i}><th scope="row" className="p-2 font-normal">{NAMES[m.scenario]}</th><td className="p-2">{m.kind === "minimum" ? "Lowest balance" : "First below your buffer"}</td><td className="p-2">{formatDateOnly(m.date)}</td><td className="p-2">{formatMoney(centsValue(m.balance))}</td></tr>)}</tbody></table><table className="mt-4 w-full text-left text-xs"><caption className="sr-only">Exact daily closing balances for all scenarios</caption><thead><tr><th className="p-2">Scenario</th><th className="p-2">Date</th><th className="p-2">Daily close</th><th className="p-2">Change vs no purchase</th></tr></thead><tbody>{chart.series.flatMap(s => s.points.map(p => <tr key={s.scenario + p.date}><th scope="row" className="p-2 font-normal">{NAMES[s.scenario]}</th><td className="p-2">{formatDateOnly(p.date)}</td><td className="p-2">{formatMoney(centsValue(p.balance))}</td><td className="p-2">{formatMoney(centsValue(p.difference_from_baseline))}</td></tr>))}</tbody></table></div></details>
  </section>;
}
function ScenarioPanel({chart, series, domain, large = false, baseline, onFocus}: {chart: Chart; series: Series; domain: [number, number]; large?: boolean; baseline?: Series | undefined; onFocus?: (() => void) | undefined}) {
  const minimum = chart.markers.find(m => m.scenario === series.scenario && m.kind === "minimum");
  const lowest = minimum ? centsValue(minimum.balance) : null;
  const ending = series.points.at(-1)!;
  const buffer = centsValue(chart.reserve);
  const axisStep = niceStep((domain[1] - domain[0]) / 6);
  const axisTicks = Array.from({length: Math.floor((domain[1] - domain[0]) / axisStep) + 1}, (_, i) => domain[0] + i * axisStep);
  const data = series.points.map((p, i) => ({date: p.date, balance: centsValue(p.balance), ...(baseline ? {baseline: centsValue(baseline.points[i]!.balance)} : {})}));
  const ticks = [...new Set([series.points[0]!.date, series.points[Math.floor((series.points.length - 1) / 2)]!.date, ending.date])];
  const identical = baseline && series.points.every((p, i) => p.date === baseline.points[i]?.date && p.balance === baseline.points[i]?.balance);
  return <section className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4" aria-label={NAMES[series.scenario] + " chart"}>
    <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="text-sm font-semibold" style={{color: COLORS[series.scenario]}}>{NAMES[series.scenario]}</h4>{lowest !== null && <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${lowest < 0 ? "bg-red-50 text-red-800" : lowest < buffer ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>{lowest < 0 ? "Goes below $0" : lowest < buffer ? "Below your buffer" : "Keeps your buffer"}</span>}</div>
    <p className="mt-1 text-xs text-muted-foreground">{DESCRIPTIONS[series.scenario]}</p>
    <div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-[11px] text-muted-foreground">Lowest balance</p><p className={`text-lg font-semibold tabular-nums ${lowest !== null && lowest < 0 ? "text-red-700" : ""}`}>{lowest === null ? "Unavailable" : formatMoney(lowest)}</p><p className="text-[11px] text-muted-foreground">{minimum ? formatDateOnly(minimum.date) : "No marker supplied"}</p></div><div className="text-right"><p className="text-[11px] text-muted-foreground">End of forecast</p><p className="text-lg font-semibold tabular-nums">{formatMoney(centsValue(ending.balance))}</p><p className="text-[11px] text-muted-foreground">{formatDateOnly(ending.date)}</p></div></div>
    {baseline && <p className="mt-3 text-xs text-muted-foreground">Solid: {NAMES[series.scenario]} · Dashed grey: without purchase</p>}
    {identical && <p className="mt-2 text-xs">The daily closing balances match the no-purchase line. The lowest balance between transactions may still differ.</p>}
    <div className={`mt-2 min-w-0 ${large ? "h-80" : "h-52"}`}><ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={data} margin={{top: 12, right: 12, left: 0, bottom: 6}} accessibilityLayer>
      <CartesianGrid vertical={false} strokeDasharray="3 4" opacity={.22} />
      <XAxis dataKey="date" ticks={ticks} tickFormatter={d => formatDateOnly(String(d))} tick={{fontSize: 11}} tickLine={false} axisLine={false} minTickGap={15} />
      <YAxis domain={domain} ticks={axisTicks} tick={{fontSize: 11}} tickFormatter={compactMoney} width={55} tickLine={false} axisLine={false} />
      <Tooltip labelFormatter={v => formatDateOnly(String(v), "MMM d, yyyy")} formatter={(v, name) => [formatMoney(Number(v)), name]} contentStyle={{fontSize: 12, borderRadius: 10}} />
      <ReferenceLine y={0} stroke="#64748b" strokeWidth={1} />
      <ReferenceLine y={buffer} stroke="#b45309" strokeDasharray="3 4" strokeWidth={1.5} />
      {baseline && <Line type="stepAfter" dataKey="baseline" name="Without purchase" stroke="#64748b" strokeDasharray="7 5" strokeWidth={2} dot={false} isAnimationActive={false} />}
      <Line type="stepAfter" dataKey="balance" name={NAMES[series.scenario]} stroke={COLORS[series.scenario]} strokeWidth={2.5} dot={false} activeDot={{r: 5}} isAnimationActive={false} />
      {minimum && <ReferenceDot x={minimum.date} y={centsValue(minimum.balance)} r={4.5} fill={COLORS[series.scenario]} stroke="white" strokeWidth={1.5} ifOverflow="extendDomain" />}
    </LineChart></ResponsiveContainer></div>
    {onFocus && <Button variant="outline" size="sm" className="mt-2 w-full" onClick={onFocus}>Inspect {NAMES[series.scenario].toLowerCase()}</Button>}
  </section>;
}
