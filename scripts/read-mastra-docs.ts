import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFile } from "node:fs/promises";
const c = new Client({ name: "ringback-doc-reader", version: "1.0.0" });
await c.connect(
  new StdioClientTransport({
    command: "node",
    args: ["node_modules/@mastra/mcp-docs-server/dist/stdio.js"],
  }),
);
const tools = await c.listTools();
console.log(JSON.stringify(tools));
for (const t of tools.tools
  .filter((t) => /docs|search/i.test(t.name))
  .slice(0, 1)) {
  const result = await c.callTool({
    name: t.name,
    arguments: {
      paths: ["reference/agents/agent", "reference/tools/create-tool"],
      query: "Agent constructor createTool execute inputSchema",
    },
  });
  await writeFile("/tmp/ringback-docs/mastra.json", JSON.stringify(result));
  console.log(JSON.stringify(result).slice(0, 14000));
}
await c.close();
