import { expect, it } from "vitest";
import { proposePurchase } from "@/services/purchaseIntent";

it("proposes a purchase and reserve for confirmation without running analysis", () => {
  const result = proposePurchase("Should I buy a $500 laptop tomorrow and keep $200 in reserve?", "2026-11-08", "2026-11-09");
  expect(result.kind).toBe("purchase");
  expect(result.options).toEqual([{label:"laptop", amount:"500.00"}]);
  expect(result.reserve).toBe("200.00");
  expect(result.purchaseDate).toBe("2026-11-09");
});
it("extracts two named alternatives and asks for missing prices", () => {
  const result = proposePurchase("Should I buy a $500 laptop or a $300 tablet?", "2026-11-08", "2026-11-09");
  expect(result.kind).toBe("comparison");
  expect(result.options.map(o => o.amount)).toEqual(["500.00","300.00"]);
  expect(proposePurchase("Should I buy this or that?", "2026-11-08", "2026-11-09").kind).toBe("clarify");
});
it("treats the reported 2500$ as cash context and asks for laptop and downpayment prices", () => {
  const draft = proposePurchase("I have 2500$, should i buy a laptop, or a downpayment for car, or should i save my money for a better time?", "2026-11-08", "2026-11-09");
  expect(draft.kind).toBe("comparison");
  expect(draft.availableCash).toBe("2500.00");
  expect(draft.options).toEqual([{label:"Laptop",amount:""},{label:"Car down payment",amount:""}]);
  expect(draft.question).toContain("Keeping the cash");
  const priced = proposePurchase("I have $2500. Buy a $900 laptop or $1500 tablet?", "2026-11-08", "2026-11-09");
  expect(priced.options.map(o=>o.amount)).toEqual(["900.00","1500.00"]);
  expect(proposePurchase("I have $2500. Should I buy a laptop?", "2026-11-08", "2026-11-09").options).toEqual([]);
});
it("does not execute instructions, guess multiple prices or silently move today", () => {
  expect(proposePurchase("buy $200 and $300", "2026-11-08", "2026-11-09").kind).toBe("clarify");
  expect(proposePurchase("buy $200 today", "2026-11-08", "2026-11-09").purchaseDate).toBe("2026-11-08");
  expect(proposePurchase("buy $200 on 2026-02-30", "2026-11-08", "2026-11-09").kind).toBe("clarify");
  expect(proposePurchase("How does a cash reserve work?", "2026-11-08", "2026-11-09").kind).toBe("education");
});
