import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { connectStore } from "../packages/core/src/store.js";
import { demos } from "../packages/core/src/config.js";
import { indexKnowledge } from "../apps/server/src/retrieval.js";
const store = await connectStore();
try {
  for (const b of demos) await indexKnowledge(store, b);
  console.log(
    "Three fictional businesses seeded. Embedding failures use labeled keyword retrieval.",
  );
} finally {
  await store.close();
}
