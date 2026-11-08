import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { chart, axis, dots, lines } = vi.hoisted(() => ({ chart: vi.fn(), axis: vi.fn(), dots: vi.fn(), lines: vi.fn() }));
vi.mock("recharts", () => {
  const container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const empty = () => null;
  return { ResponsiveContainer: container, LineChart: (props: { children?: ReactNode }) => { chart(props); return <div>{props.children}</div>; }, CartesianGrid: empty, ReferenceArea: empty, Tooltip: empty, XAxis: empty,
    Line: (props: unknown) => { lines(props); return null; }, ReferenceDot: (props: unknown) => { dots(props); return null; }, ReferenceLine: empty, YAxis: (props: unknown) => { axis(props); return null; } };
});
import { FutureLabChart } from "@/components/future-lab/FutureLabChart";
import { engineComparisonSchema } from "@/types/engine";
import { futureLabComparisons } from "./fixtures/futureLabResponses";
import { comparisonPayload } from "./fixtures/engineResponses";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("plots the three server-returned trajectories and accepts a clicked timeline date", () => {
  const onDate = vi.fn();
  render(<FutureLabChart selected="Buy now" date="2026-11-09" onDate={onDate} result={{ input: { purchaseAmount: "400.00", purchaseDate: "2026-11-08", comparisonDate: "2026-11-15", reserve: "200.00" }, comparison: engineComparisonSchema.parse(futureLabComparisons["400.00"].data) }} />);
  const props = chart.mock.calls[0]![0] as { data: Array<Record<string, string | number>>; onClick: (state: { activeLabel: unknown }) => void };
  expect(props.data.find(row => row["date"] === "2026-11-09")).toEqual({ date: "2026-11-09", "Buy now": 740.25, "Buy later": 1140.25, "Skip purchase": 1140.25 });
  expect(lines.mock.calls.map(call => call[0].name)).toEqual(["Buy now", "Buy later", "Skip purchase"]);
  expect(new Set(lines.mock.calls.map(call => call[0].stroke)).size).toBe(3);
  props.onClick({ activeLabel: "2026-11-15" });
  props.onClick({ activeLabel: "not-a-date" });
  expect(onDate).toHaveBeenCalledExactlyOnceWith("2026-11-15");
});

it("keeps intraday negative event minimums visible when the same day's close is positive", () => {
  render(<FutureLabChart selected="Buy now" date="2026-11-08" onDate={() => {}} result={{ input: { purchaseAmount: "400.00", purchaseDate: "2026-11-07", comparisonDate: "2026-11-09", reserve: "200.00" }, comparison: engineComparisonSchema.parse(comparisonPayload.data) }} />);
  expect((axis.mock.calls[0]![0] as { domain: [number, number] }).domain[0]).toBeLessThan(-500);
  expect(dots.mock.calls.some(call => call[0].y === -500)).toBe(true);
  const rows = chart.mock.calls[0]![0].data as Array<Record<string, string | number>>;
  expect(rows.find(row => row["date"] === "2026-11-08")?.["Buy now"]).toBe(500);
});
