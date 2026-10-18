import { expect, test, vi } from "vitest";
import { costModel } from "../scripts/cost-model.js";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

test("mock scenarios never become measured live calls or cost estimates", async () => {
  const result = await costModel({
    mode: "mock",
    completed: 96,
    tokensIn: 2000,
    tokensOut: 400,
    path: "mock-fixture",
  });
  expect(result.evaluatedScenarios).toBe(96);
  expect(result.measuredCalls).toBe(0);
  expect(result.liveTokenSampleAvailable).toBe(false);
  expect(result.averageTokensIn).toBeNull();
  expect(result.llmPerThousandCalls.hypotheticalClosed).toBeNull();
  expect(result.voicePerThousandCalls).toBeNull();
});

test("a live run without reported tokens stays unmeasured", async () => {
  const result = await costModel({
    mode: "live",
    completed: 2,
    tokensIn: 0,
    tokensOut: 0,
    path: "no-usage-fixture",
  });
  expect(result.measuredCalls).toBe(0);
  expect(result.liveTokenSampleAvailable).toBe(false);
  expect(result.llmPerThousandCalls.open).toBeNull();
});

test("reported live tokens support an extrapolation but never measured billing", async () => {
  const result = await costModel({
    mode: "live",
    completed: 2,
    tokensIn: 2000,
    tokensOut: 400,
    path: "synthetic-live-usage-fixture",
  });
  expect(result.measuredCalls).toBe(2);
  expect(result.averageTokensIn).toBe(1000);
  expect(result.averageTokensOut).toBe(200);
  expect(result.llmPerThousandCalls.hypotheticalClosed).toBeCloseTo(3.6);
  expect(result.billingMeasured).toBe(false);
  expect(result.source).toBe("synthetic-live-usage-fixture");
});
