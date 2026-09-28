// Minimal D1-compatible adapter backed by an in-memory node:sqlite database.
// It implements the subset of the D1 API the Worker actually uses:
// prepare().bind().all()/first()/run(), raw() and atomic batch(). Migrations
// from drizzle/*.sql are applied in order, including the append-only triggers,
// so money and audit invariants are enforced exactly like production.

import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";

function toDriverValue(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

class D1PreparedStatement {
  #database;
  #sql;
  #params = [];

  constructor(database, sql) {
    this.#database = database;
    this.#sql = sql;
  }

  bind(...params) {
    this.#params = params;
    return this;
  }

  #rows() {
    const statement = this.#database.prepare(this.#sql);
    return statement.all(...this.#params.map(toDriverValue));
  }

  #execute() {
    const statement = this.#database.prepare(this.#sql);
    return statement.run(...this.#params.map(toDriverValue));
  }

  async all() {
    const results = this.#rows();
    return { results, success: true, meta: { changes: results.length, last_row_id: 0 } };
  }

  async first() {
    return this.#rows()[0] ?? null;
  }

  async raw() {
    const rows = this.#rows();
    return rows.map((row) => Object.keys(row).map((key) => row[key]));
  }

  async run() {
    if (/^\s*(select|pragma|explain)\b/i.test(this.#sql)) {
      const results = this.#rows();
      return { results, success: true, meta: { changes: results.length, last_row_id: 0 } };
    }
    const result = this.#execute();
    const rows = /returning\b/i.test(this.#sql) ? this.#rows() : [];
    return {
      results: rows,
      success: true,
      meta: { changes: Number(result.changes ?? 0), last_row_id: Number(result.lastInsertRowid ?? 0) },
    };
  }

  /** Shared internals for batch(): read rows if any, otherwise execute. */
  runInBatch() {
    if (/^\s*(select|pragma|explain)\b/i.test(this.#sql) || /returning\b/i.test(this.#sql)) {
      const results = this.#rows();
      return { results, success: true, meta: { changes: results.length, last_row_id: 0 } };
    }
    const result = this.#execute();
    return { results: [], success: true, meta: { changes: Number(result.changes ?? 0), last_row_id: Number(result.lastInsertRowid ?? 0) } };
  }
}

export class TestD1 {
  #database;
  #statements = new Map();

  constructor(database) {
    this.#database = database;
  }

  /** Direct handle for test setup/inspection; bypasses D1 semantics. */
  get sqlite() {
    return this.#database;
  }

  prepare(sql) {
    if (!this.#statements.has(sql)) this.#statements.set(sql, new D1PreparedStatement(this.#database, sql));
    return this.#statements.get(sql);
  }

  async batch(statements) {
    this.#database.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.runInBatch());
      this.#database.exec("COMMIT");
      return results;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

export async function createTestD1() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migrationsUrl = new URL("../../drizzle/", import.meta.url);
  const files = (await readdir(migrationsUrl)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(new URL(file, migrationsUrl), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  return new TestD1(database);
}
