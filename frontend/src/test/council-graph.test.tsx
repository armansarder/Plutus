import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CouncilGraph, chartDomain } from "@/components/chat/CouncilGraph";
import { councilRunSchema } from "@/types/council";
import fixture from "./fixtures/council.json";
const chart = councilRunSchema.parse(fixture).chart!;
beforeEach(() => {vi.stubGlobal("ResizeObserver", class {observe() {} unobserve() {} disconnect() {}});});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
it("separates all scenarios and labels their authoritative minimum and ending values", () => {
  const before = JSON.stringify(chart);
  render(<CouncilGraph chart={chart} />);
  expect(screen.getAllByRole("region", {name: / chart$/})).toHaveLength(5);
  const purchase = screen.getByRole("region", {name: "Buy on your selected date chart"});
  expect(within(purchase).getByText("−$100")).toBeVisible();
  expect(within(purchase).getByText("$900")).toBeVisible();
  expect(within(purchase).getByText("Goes below $0")).toBeVisible();
  expect(screen.getByText("$200 cash buffer")).toBeVisible();
  expect(JSON.stringify(chart)).toBe(before);
});
it("offers a large single-scenario view and makes baseline comparison explicitly opt-in", () => {
  render(<CouncilGraph chart={chart} />);
  fireEvent.click(screen.getByRole("button", {name: "Focus on one"}));
  expect(screen.getAllByRole("region", {name: / chart$/})).toHaveLength(1);
  const compare = screen.getByLabelText("Compare with no purchase");
  expect(compare).not.toBeChecked();
  fireEvent.click(compare);
  expect(screen.getByText(/Solid: Buy on your selected date/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Scenario to inspect"), {target: {value: "baseline"}});
  expect(screen.queryByLabelText("Compare with no purchase")).not.toBeInTheDocument();
  expect(screen.getByRole("region", {name: "Without the purchase chart"})).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Separate charts"}));
  expect(screen.getAllByRole("region", {name: / chart$/})).toHaveLength(5);
});
it("uses one scale containing every scenario, event minimum, cash buffer and zero", () => {
  const [low, high] = chartDomain(chart);
  expect(low).toBeLessThan(-30000);
  expect(high).toBeGreaterThan(130000);
  const largeBuffer = {...chart, reserve: "2000.00"};
  expect(chartDomain(largeBuffer)[1]).toBeGreaterThan(200000);
});
it("lets a scenario card open its own focused chart", () => {
  render(<CouncilGraph chart={chart} />);
  fireEvent.click(screen.getByRole("button", {name: "Inspect income arrives 3 days late"}));
  expect(screen.getByLabelText("Scenario to inspect")).toHaveValue("delayed_income");
  expect(screen.getAllByRole("region", {name: / chart$/})).toHaveLength(1);
});
