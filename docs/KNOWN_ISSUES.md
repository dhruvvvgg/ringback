# Known issues

- Partner provisioning: `codex mcp list` reports no servers; tool discovery exposes no Render, DigitalOcean, MongoDB or ElevenLabs tools. No raw provisioning credentials requested. Use deploy-ready Render blueprint and in-memory Mongo fallback.
- Mastra MCP registration: `codex mcp add mastra-docs -- npx -y @mastra/mcp-docs-server@latest` fails because platform configuration is read-only. Use direct stdio MCP client for documentation instead.
