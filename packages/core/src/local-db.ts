// Offline fallback only: SQLite JSON records, not an imitation Atlas service.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
type Row = Record<string, any>;
function matches(row: Row, filter: Row) {
  return Object.entries(filter).every(([k, v]) => {
    if (k === "$or") return v.some((f: Row) => matches(row, f));
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.entries(v).every(([op, x]) =>
        op === "$in"
          ? (x as unknown[]).includes(row[k])
          : op === "$ne"
            ? row[k] !== x
            : op === "$gte"
              ? row[k] >= (x as number)
              : op === "$lt"
                ? row[k] < (x as number)
                : op === "$exists"
                  ? (row[k] !== undefined) === x
                  : false,
      );
    }
    return row[k] === v;
  });
}
export class LocalDb {
  public connection: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.connection = new DatabaseSync(path);
    this.connection.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  }
  async command(_c: Row) {
    return { ok: 1 };
  }
  collection<T = Row>(name: string): any {
    if (!/^[a-zA-Z_]+$/.test(name)) throw Error("Invalid collection");
    const table = `"${name}"`;
    this.connection.exec(
      `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
    );
    const db = this.connection;
    const rows = () =>
      (db.prepare(`SELECT data FROM ${table}`).all() as { data: string }[]).map(
        (r) => JSON.parse(r.data),
      );
    const col = {
      async createIndex(fields: Row, options: Row = {}) {
        if (!options.unique) return "local-scan";
        const keys = Object.keys(fields);
        if (keys.some((k) => !/^[a-zA-Z]+$/.test(k)))
          throw Error("Invalid index");
        db.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS "${name}_${keys.join("_")}" ON ${table} (${keys.map((k) => `json_extract(data, '$.${k}')`).join(",")})`,
        );
        return keys.join("_");
      },
      find(filter: Row = {}, options: Row = {}) {
        let result = rows().filter((r) => matches(r, filter));
        const cursor = {
          sort(spec: Row) {
            const [key, dir] = Object.entries(spec)[0];
            result.sort((a, b) => (a[key] > b[key] ? 1 : -1) * Number(dir));
            return cursor;
          },
          limit(n: number) {
            result = result.slice(0, n);
            return cursor;
          },
          async toArray() {
            return result.map((r) => {
              if (options.projection) {
                for (const [k, v] of Object.entries(options.projection))
                  if (v === 0) delete r[k];
              }
              return r;
            });
          },
        };
        return cursor;
      },
      async findOne(filter: Row = {}, options: Row = {}) {
        return (await col.find(filter, options).limit(1).toArray())[0] || null;
      },
      async insertOne(doc: Row) {
        const id = doc._id || randomUUID();
        db.prepare(`INSERT INTO ${table} (id,data) VALUES (?,?)`).run(
          id,
          JSON.stringify({ ...doc, _id: id }),
        );
        return { insertedId: id };
      },
      async insertMany(docs: Row[]) {
        for (const doc of docs) await col.insertOne(doc);
        return { insertedCount: docs.length };
      },
      async updateOne(filter: Row, update: Row, options: Row = {}) {
        const row = await col.findOne(filter);
        if (!row) {
          if (!options.upsert) return { matchedCount: 0 };
          const next = { ...filter, ...update.$setOnInsert, ...update.$set };
          for (const [k, v] of Object.entries(update.$inc || {}))
            next[k] = Number(v);
          await col.insertOne(next);
          return { matchedCount: 0, upsertedCount: 1 };
        }
        Object.assign(row, update.$set);
        for (const [k, v] of Object.entries(update.$inc || {}))
          row[k] = (row[k] || 0) + Number(v);
        for (const k of Object.keys(update.$unset || {})) delete row[k];
        db.prepare(`UPDATE ${table} SET data=? WHERE id=?`).run(
          JSON.stringify(row),
          row._id,
        );
        return { matchedCount: 1 };
      },
      async deleteMany(filter: Row) {
        const found = rows().filter((r) => matches(r, filter));
        for (const r of found)
          db.prepare(`DELETE FROM ${table} WHERE id=?`).run(r._id);
        return { deletedCount: found.length };
      },
      async deleteOne(filter: Row) {
        const row = await col.findOne(filter);
        if (!row) return { deletedCount: 0 };
        db.prepare(`DELETE FROM ${table} WHERE id=?`).run(row._id);
        return { deletedCount: 1 };
      },
      async countDocuments(filter: Row = {}) {
        return rows().filter((r) => matches(r, filter)).length;
      },
    };
    return col as T extends never ? never : typeof col;
  }
}
