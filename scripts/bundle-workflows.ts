import { bundleWorkflowCode, DefaultLogger } from "@temporalio/worker";
import { mkdir, writeFile } from "node:fs/promises";
const bundle = await bundleWorkflowCode({
  workflowsPath: new URL("../apps/worker/src/workflows.ts", import.meta.url)
    .pathname,
  logger: new DefaultLogger("ERROR"),
});
await mkdir("apps/worker/dist", { recursive: true });
await writeFile("apps/worker/dist/workflows.cjs", bundle.code);
console.log("Temporal workflows bundled for production.");
