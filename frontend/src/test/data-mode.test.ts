import { expect, it } from "vitest";
import { resolveDataMode } from "@/services/config";

it("selects one explicit application-wide mode and supports existing startup commands", () => {
  expect(resolveDataMode()).toBe("remote");
  expect(resolveDataMode("remote")).toBe("remote");
  expect(resolveDataMode(undefined, "remote")).toBe("remote");
  expect(() => resolveDataMode("synthetic_demo", "synthetic_demo")).toThrow("Use remote mode");
  expect(() => resolveDataMode("remote", "synthetic_demo")).toThrow("Conflicting");
  expect(() => resolveDataMode("unknown")).toThrow("Use remote mode");
  expect(() => resolveDataMode(undefined, "unknown")).toThrow("Use remote mode");
});
