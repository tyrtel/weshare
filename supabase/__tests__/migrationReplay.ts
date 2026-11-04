import fs from 'fs';
import path from 'path';

// Replays the migration SQL files as text, in order, to reconstruct the current
// schema (tables, columns, foreign keys) and the effective RLS policies, with no
// database. Only the DDL shapes this repo actually uses are understood; function
// bodies and DO blocks are skipped.

export const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

export type PolicyCommand = 'select' | 'insert' | 'update' | 'delete' | 'all';

export interface PolicyDef {
  table: string;
  name: string;
  command: PolicyCommand;
  file: string;
  body: string; // the USING/WITH CHECK SQL text
}

export interface ColumnDef {
  type: string;
  notNull: boolean;
  fkConstraint: string | null; // constraint name of a foreign key on this column
  fkTarget: string | null;     // referenced table, e.g. 'users' or 'auth.users'
}

export interface Schema {
  tables: Map<string, Map<string, ColumnDef>>;
  policies: Map<string, PolicyDef>; // keyed `${table}::${name}`
}

// Splits a SQL file into top-level statements on ';', without breaking up
// dollar-quoted function bodies ($$...$$ or $tag$...$tag$), which contain
// their own internal semicolons (plpgsql statement separators).
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let dollarTag: string | null = null;
  let i = 0;

  while (i < sql.length) {
    const dollarMatch = /^\$[a-zA-Z_]*\$/.exec(sql.slice(i));
    if (dollarMatch) {
      const tag = dollarMatch[0];
      current += tag;
      i += tag.length;
      dollarTag = dollarTag === null ? tag : (tag === dollarTag ? null : dollarTag);
      continue;
    }
    const ch = sql[i];
    if (ch === ';' && dollarTag === null) {
      statements.push(current);
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) statements.push(current);
  return statements;
}

export function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

export function normalizeName(raw: string): string {
  return raw.replace(/^public\./i, '').replace(/"/g, '').toLowerCase();
}

// Splits on commas that are not inside parentheses.
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map(p => p.trim()).filter(Boolean);
}

function parseColumn(table: string, def: string): [string, ColumnDef] | null {
  const m = /^"?(\w+)"?\s+([\w.]+(?:\s*\([^)]*\))?(?:\s+with(?:out)?\s+time\s+zone)?(?:\[\])?)([\s\S]*)$/i.exec(def);
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude'].includes(name)) return null;
  const rest = m[3];
  const ref = /\breferences\s+("?[\w.]+"?)/i.exec(rest);
  return [name, {
    type: m[2].toLowerCase().replace(/\s+/g, ' '),
    notNull: /\bnot\s+null\b|\bprimary\s+key\b/i.test(rest),
    fkConstraint: ref ? `${table}_${name}_fkey` : null,
    fkTarget: ref ? ref[1].replace(/"/g, '').replace(/^public\./i, '').toLowerCase() : null,
  }];
}

function applyCreateTable(schema: Schema, stmt: string): boolean {
  const m = /^create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)\s*\(([\s\S]*)\)\s*$/i.exec(stmt);
  if (!m) return false;
  const table = normalizeName(m[1]);
  const columns = new Map<string, ColumnDef>();
  for (const def of splitTopLevel(m[2])) {
    const fk = /^(?:constraint\s+"?(\w+)"?\s+)?foreign\s+key\s*\(\s*"?(\w+)"?\s*\)\s*references\s+("?[\w.]+"?)/i.exec(def);
    if (fk) {
      const col = columns.get(fk[2].toLowerCase());
      if (col) {
        col.fkConstraint = fk[1] ?? `${table}_${fk[2].toLowerCase()}_fkey`;
        col.fkTarget = normalizeName(fk[3]);
      }
      continue;
    }
    const parsed = parseColumn(table, def);
    if (parsed) columns.set(parsed[0], parsed[1]);
  }
  schema.tables.set(table, columns);
  return true;
}

function applyAlterTable(schema: Schema, stmt: string): boolean {
  const m = /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?("?[\w.]+"?)\s+([\s\S]*)$/i.exec(stmt);
  if (!m) return false;
  const table = normalizeName(m[1]);
  const columns = schema.tables.get(table);
  if (!columns) return true;

  for (const action of splitTopLevel(m[2])) {
    let a: RegExpExecArray | null;
    if ((a = /^add\s+column\s+(?:if\s+not\s+exists\s+)?([\s\S]+)$/i.exec(action))) {
      const parsed = parseColumn(table, a[1]);
      if (parsed) columns.set(parsed[0], parsed[1]);
    } else if ((a = /^alter\s+column\s+"?(\w+)"?\s+(?:set\s+data\s+)?type\s+([\w.]+)/i.exec(action))) {
      const col = columns.get(a[1].toLowerCase());
      if (col) col.type = a[2].toLowerCase();
    } else if ((a = /^alter\s+column\s+"?(\w+)"?\s+drop\s+not\s+null/i.exec(action))) {
      const col = columns.get(a[1].toLowerCase());
      if (col) col.notNull = false;
    } else if ((a = /^alter\s+column\s+"?(\w+)"?\s+set\s+not\s+null/i.exec(action))) {
      const col = columns.get(a[1].toLowerCase());
      if (col) col.notNull = true;
    } else if ((a = /^drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/i.exec(action))) {
      columns.delete(a[1].toLowerCase());
    } else if ((a = /^drop\s+constraint\s+(?:if\s+exists\s+)?"?(\w+)"?/i.exec(action))) {
      const name = a[1].toLowerCase();
      for (const col of columns.values()) {
        if (col.fkConstraint === name) { col.fkConstraint = null; col.fkTarget = null; }
      }
    } else if ((a = /^add\s+constraint\s+"?(\w+)"?\s+foreign\s+key\s*\(\s*"?(\w+)"?\s*\)\s*references\s+("?[\w.]+"?)/i.exec(action))) {
      const col = columns.get(a[2].toLowerCase());
      if (col) { col.fkConstraint = a[1].toLowerCase(); col.fkTarget = normalizeName(a[3]); }
    }
  }
  return true;
}

function applyPolicy(schema: Schema, stmt: string, file: string): boolean {
  const drop = /^drop\s+policy\s+(?:if\s+exists\s+)?"?([^"\n]+?)"?\s+on\s+(?:public\.)?"?(\w+)"?/i.exec(stmt);
  if (drop) {
    schema.policies.delete(`${normalizeName(drop[2])}::${drop[1].trim().toLowerCase()}`);
    return true;
  }
  const create = /^create\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:public\.)?"?(\w+)"?(?:\s+as\s+\w+)?(?:\s+for\s+(\w+))?([\s\S]*)$/i.exec(stmt);
  if (create) {
    const name = create[1].trim().toLowerCase();
    const table = normalizeName(create[2]);
    const command = (create[3]?.toLowerCase() ?? 'all') as PolicyCommand;
    schema.policies.set(`${table}::${name}`, { table, name, command, file, body: create[4] });
    return true;
  }
  return false;
}

export function migrationFiles(): string[] {
  return fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
}

// `upTo` replays only files whose name sorts at or before it (e.g. '046'), so a
// rule can be shown to fail on the schema as it stood before a fix.
export function replayMigrations(upTo?: string): Schema {
  const schema: Schema = { tables: new Map(), policies: new Map() };
  for (const file of migrationFiles()) {
    if (upTo && file.slice(0, upTo.length) > upTo) break;
    const sql = stripLineComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    for (const raw of splitStatements(sql)) {
      const stmt = raw.trim();
      if (!stmt) continue;
      if (applyPolicy(schema, stmt, file)) continue;
      if (applyCreateTable(schema, stmt)) continue;
      if (applyAlterTable(schema, stmt)) continue;
      const dropTable = /^drop\s+table\s+(?:if\s+exists\s+)?("?[\w.]+"?)/i.exec(stmt);
      if (dropTable) schema.tables.delete(normalizeName(dropTable[1]));
    }
  }
  return schema;
}
