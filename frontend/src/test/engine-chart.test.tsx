import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { axis } = vi.hoisted(() => ({ axis: vi.fn() }));
vi.mock("recharts", () => {
  const container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const empty = () => null;
  return { ResponsiveContainer: container, LineChart: container, CartesianGrid: empty, Line: empty, ReferenceArea: empty, ReferenceDot: empty, ReferenceLine: empty, Tooltip: empty, XAxis: empty, YAxis: (props: unknown) => { axis(props); return null; } };
});
import { CashFlowChart } from "@/components/financial/CashFlowChart";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("keeps a negative event minimum visible even when all daily closes are positive", () => {
  render(<CashFlowChart events={[]} series={[{ shortName: "Backend forecast", color: "red", result: { id: "forecast", lowestBalanceCents: -10000, lowestBalanceDate: "2026-11-08", dailyBalances: [{ date: "2026-11-07", endOfDayBalanceCents: 80000 }, { date: "2026-11-08", endOfDayBalanceCents: 90000 }] } }]} />);
  const { domain } = axis.mock.calls[0]![0] as { domain: [number, number] };
  expect(domain[0]).toBeLessThanOrEqual(-100);
  expect(domain[1]).toBeGreaterThanOrEqual(900);
});
