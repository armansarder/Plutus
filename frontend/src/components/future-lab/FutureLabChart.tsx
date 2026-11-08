import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { balanceAt, eventDates, FUTURES, type FutureLabResult, type FutureName } from "@/services/futureLab";
import { centsValue } from "@/services/engine";
import { formatDateOnly } from "@/lib/dateOnly";
import { formatMoney } from "@/lib/formatMoney";

export const FUTURE_COLORS: Record<FutureName, string> = { "Buy now": "var(--scenario-now)", "Buy later": "var(--scenario-later)", "Skip purchase": "var(--brand)" };

export function FutureLabChart({ result, selected, date, onDate }: { result: FutureLabResult; selected: FutureName; date: string; onDate: (date: string) => void }) {
  const dates = eventDates(result.comparison);
  const data = dates.map(day => Object.fromEntries([["date", day], ...result.comparison.scenarios.map(s => [s.name, centsValue(balanceAt(s, day)) / 100])]) as Record<string, string | number>);
  const reserve = centsValue(result.input.reserve) / 100;
  const values = result.comparison.scenarios.flatMap(s => [centsValue(s.minimum_balance) / 100, centsValue(s.ending_balance) / 100, centsValue(s.starting_balance) / 100, ...s.transaction_timeline.map(e => centsValue(e.balance) / 100)]);
  const min = Math.min(0, reserve, ...values), max = Math.max(reserve, ...values);
  const padding = Math.max(1, (max - min) * 0.12);
  return <div>
    <div className="h-[360px] w-full" role="img" aria-label="Three backend-calculated cash-flow trajectories. Use the date slider and scenario cards for exact accessible values.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 32, right: 20, bottom: 12, left: 12 }} onClick={state => { const label = state?.activeLabel; if (typeof label === "string" && dates.includes(label)) onDate(label); }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 5" />
          {reserve > min && <ReferenceArea y1={min - padding} y2={reserve} fill="var(--color-caution)" fillOpacity={0.09} />}
          <XAxis dataKey="date" tickFormatter={day => formatDateOnly(String(day))} tick={{ fontSize: 11 }} minTickGap={28} />
          <YAxis domain={[min - padding, max + padding]} width={76} tickFormatter={value => formatMoney(Number(value) * 100, { whole: true })} tick={{ fontSize: 11 }} />
          <ReferenceLine y={reserve} stroke="var(--color-caution)" strokeDasharray="6 4" label={{ value: `Reserve ${formatMoney(centsValue(result.input.reserve))}`, position: "insideTopRight", fontSize: 11 }} />
          <ReferenceLine y={0} stroke="var(--color-foreground)" />
          <ReferenceLine x={date} stroke="var(--color-foreground)" strokeDasharray="2 3" />
          <Tooltip content={({ active, label }) => !active ? null : <div className="panel p-3 text-xs"><strong>{formatDateOnly(String(label))}</strong>{result.comparison.scenarios.map(s => <p key={s.name} className="mt-1" style={{ color: FUTURE_COLORS[s.name as FutureName] }}>{s.name}: {formatMoney(centsValue(balanceAt(s, String(label))))}</p>)}</div>} />
          {result.comparison.scenarios.map(s => <Line key={s.name} name={s.name} dataKey={s.name} type="stepAfter" stroke={FUTURE_COLORS[s.name as FutureName]} strokeWidth={selected === s.name ? 4 : 2} strokeOpacity={selected === s.name ? 1 : 0.6} strokeDasharray={s.name === "Skip purchase" ? "5 4" : undefined} dot={false} isAnimationActive={false} />)}
          {result.comparison.scenarios.map(s => <ReferenceDot key={s.name} x={s.minimum_balance_date} y={centsValue(s.minimum_balance) / 100} r={5} fill={FUTURE_COLORS[s.name as FutureName]} stroke="var(--color-card)" ifOverflow="extendDomain" />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <ul className="flex flex-wrap gap-5 text-xs">{FUTURES.map(name => <li key={name} className="flex items-center gap-2"><span className="h-1 w-7 rounded-full" style={{ background: FUTURE_COLORS[name] }} />{name}{selected === name ? " · selected" : ""}</li>)}</ul>
  </div>;
}
