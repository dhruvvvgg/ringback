# Build log

## Setup and domain
- npm failed creating its default cache under the protected home directory. Added a writable npm cache, reran install successfully with lockfile integrity checks intact.
- MongoMemoryServer failed with HTTP 403 for the vendor binary. Direct vendor fetch and installed-binary discovery confirmed no usable Mongo binary. Added an explicitly labeled SQLite adapter with real unique constraints; concurrency tests verify one winner among competing reservations.
- SWC 1.16.18 refused materialization because the sandbox root is owned by nobody. A dedicated cache did not solve its ancestor ownership validation. Pinned compatible SWC 1.11.24 instead of weakening its verification. Temporal workflow bundling and integration tests pass.
- Optional ONNX CUDA download failed resolving NuGet. Used the documented ONNXRUNTIME_NODE_INSTALL=skip flag for bundled CPU inference; no CUDA is needed. Embedding weights remain blocked, so retrieval labels itself keyword-only.
- Mastra docs command from the brief timed out because the current package exposes a separate stdio entry point. Invoked the installed stdio.js with the MCP client, listed tools, and read current agent/tool documentation successfully.
## Browser and privacy audit
- A caller screen crashed after starting a conversation. The effect returned the browser's scrollIntoView return value; React later treated it as a cleanup function. Changed the effect to a block that returns nothing. The browser booking flow now reaches confirmation.
- Axe found insufficient contrast in badges/sidebar text, a disabled voice button whose accessible name differed from its visible label, a non-focusable transcript scroller, and unnamed duplicate navigation landmarks. Darkened text and corrected labels, focus and landmark names; rerunning the complete screen audit.
- The real Sentry-envelope canary test caught PII in Sentry 11's new default streaming trace lifecycle: beforeSendTransaction was ignored. Explicitly selected static trace lifecycle and retained a strict outbound whitelist. This was found using a captured envelope, not by assuming the scrub helper was sufficient.
- Docker's npm install rejected the sandbox proxy certificate. Added an optional BuildKit CA secret mount for installation; TLS checks remain enabled and the CA is not retained in the image.
