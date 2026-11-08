import { expect, it } from "vitest";
import { resolveDataMode } from "@/services/config";

it("selects one explicit application-wide mode and supports existing startup commands", () => {
  expect(resolveDataMode()).toBe("synthetic_demo");
  expect(resolveDataMode("remote")).toBe("remote");
  expect(resolveDataMode(undefined, "remote")).toBe("remote");
  expect(resolveDataMode("synthetic_demo", "synthetic_demo")).toBe("synthetic_demo");
  expect(() => resolveDataMode("remote", "synthetic_demo")).toThrow("Conflicting");
  expect(() => resolveDataMode("unknown")).toThrow("Invalid");
  expect(() => resolveDataMode(undefined, "unknown")).toThrow("Invalid");
});
