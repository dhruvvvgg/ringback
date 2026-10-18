# Self-hosted Gemma

The client is **designed to** work with a self-hosted OpenAI-compatible Gemma endpoint. This run could not demonstrate a local model: the official weight request returned HTTP 401 without authenticated license access. `artifacts/eval/local-model-smoke.json` records the unmet check. No substitute proprietary model was used.

On a machine where you have accepted the model license and have sufficient RAM, install Ollama using its official instructions. Discover available Gemma tags at the official model library rather than copying an obsolete model name. Then:

```sh
ollama pull "$GEMMA_TAG"
ollama serve
```

Set the following in your private local environment (substitute the real installed Gemma tag):

```sh
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=your-installed-gemma-tag
```

The tag must identify Gemma. Set `LLM_API_KEY` only if your compatible server requires authentication. `GET /v1/models` must advertise the configured model. Run `npm run eval:smoke` with the client pointed at that provider, and then `npm run live:verify`; save the actual artifacts before changing the README claim from “designed to” to “demonstrated”. The default CLI eval chooses mock without a provider binding, so supply `LLM_BASE_URL` or a key deliberately.

A fully local deployment also needs a local embedding model/keyword retrieval and local voice, or text mode: using hosted ElevenLabs still sends voice data to a provider. The hosted Google/DO demo sends caller text off the server. Open weights enable provider choice; they do not make hosted inference private or GPU hardware free.

No GPU Droplet, paid VM or monthly resource was created. For a future owner-operated server, configure the same URL/model variables and keep its endpoint private behind authentication/TLS. Infrastructure hardening and model license compliance remain the owner's responsibility.
