import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { LocalDb } from "./local-db.js";
import { demos, type Business } from "./config.js";
let memory: MongoMemoryServer | undefined;
export class Store {
  constructor(
    public client: MongoClient,
    public db: Db,
    public mode: "atlas" | "degraded" | "sqlite-degraded",
  ) {}
  async init() {
    await Promise.all([
      this.db.collection("businesses").createIndex({ id: 1 }, { unique: true }),
      this.db
        .collection("appointments")
        .createIndex({ businessId: 1, key: 1 }, { unique: true }),
      this.db
        .collection("locks")
        .createIndex(
          { businessId: 1, resourceId: 1, minute: 1 },
          { unique: true },
        ),
      this.db.collection("outbox").createIndex({ key: 1 }, { unique: true }),
      this.db
        .collection("callers")
        .createIndex({ businessId: 1, callerId: 1 }, { unique: true }),
      this.db
        .collection("knowledge")
        .createIndex({ businessId: 1, sourceId: 1 }, { unique: true }),
      this.db.collection("knowledge").createIndex({ text: "text" }),
    ]);
    for (const b of demos)
      await this.db
        .collection<Business>("businesses")
        .updateOne({ id: b.id }, { $setOnInsert: b }, { upsert: true });
  }
  async business(id: string) {
    return this.db
      .collection<Business>("businesses")
      .findOne({ id }, { projection: { _id: 0 } });
  }
  async close() {
    await this.client.close();
    if (memory) await memory.stop();
  }
}
export async function connectStore(
  dbName = process.env.MONGODB_DB || "ringback",
) {
  let uri = process.env.MONGODB_URI;
  if (!uri && process.env.LOCAL_DB !== "mongo-memory") {
    const db = new LocalDb(
      process.env.LOCAL_DB_PATH || ".data/ringback.sqlite",
    );
    const store = new Store(
      { close: async () => db.connection.close() } as MongoClient,
      db as unknown as Db,
      "sqlite-degraded",
    );
    await store.init();
    return store;
  }
  if (!uri) {
    memory = await MongoMemoryServer.create({
      binary: {
        version: "7.0.24",
        downloadDir:
          process.env.MONGOMS_DOWNLOAD_DIR || "/workspace/.cache/mongodb",
      },
      instance: { ip: "127.0.0.1" },
    });
    uri = memory.getUri();
  }
  const client = await new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
  }).connect();
  const store = new Store(
    client,
    client.db(dbName),
    process.env.MONGODB_URI ? "atlas" : "degraded",
  );
  await store.init();
  return store;
}
