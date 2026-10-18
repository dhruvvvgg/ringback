import { mkdir, readFile, writeFile } from "node:fs/promises";
import prices from "../eval/prices.json";
export async function costModel(report: any) {
  const live =
    report.mode === "live" &&
    report.completed > 0 &&
    report.tokensIn + report.tokensOut > 0;
  const calls = report.completed;
  const input = live ? report.tokensIn / calls : null,
    output = live ? report.tokensOut / calls : null;
  const cost = (p: { inputPerMillion: number; outputPerMillion: number }) =>
    input === null || output === null
      ? null
      : (input * p.inputPerMillion + output * p.outputPerMillion) / 1000;
  const result = {
    mode: report.mode,
    evaluatedScenarios: calls,
    measuredCalls: live ? calls : 0,
    liveTokenSampleAvailable: live,
    callBasis: "One completed evaluation scenario, not a production phone call",
    billingMeasured: false,
    source: report.path,
    averageTokensIn: input,
    averageTokensOut: output,
    llmPerThousandCalls: {
      open: cost(prices.open),
      hypotheticalClosed: cost(prices.closedHypothetical),
    },
    voicePerThousandCalls: null,
    prices,
    caveat:
      "Voice cost is identical for either LLM and may dominate. Mock scenarios are not measured live calls. No live estimate without measured tokens. Prices are assumptions, not measured provider billing.",
  };
  await mkdir("artifacts/cost", { recursive: true });
  await writeFile(
    "artifacts/cost/cost-model.json",
    JSON.stringify(result, null, 2),
  );
  return result;
}
if (process.argv[1]?.endsWith("cost-model.ts")) {
  const p = process.argv[2];
  if (!p) throw Error("Pass an actual eval artifact");
  await costModel({ ...JSON.parse(await readFile(p, "utf8")), path: p });
}
