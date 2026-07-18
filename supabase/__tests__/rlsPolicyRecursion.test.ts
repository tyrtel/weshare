import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Detects the "infinite recursion detected in policy for relation X" class of
// Postgres RLS bug *statically*, from the migration SQL, with no database
// required. It has already bitten this table pair twice (migrations 017 and
// 039 both re-fixed trips/trip_members; 026 fixed groups/group_members).
//
// The bug shape is always the same: a policy on table A reads table B via a
// raw subquery (FROM/JOIN), and a policy on table B reads table A the same
// way. Postgres must evaluate each policy to answer the other's subquery,
// which never terminates. The fix is always a SECURITY DEFINER helper
// function that reads the other table bypassing RLS — a function *call*
// (`is_trip_member(id)`) leaves no FROM/JOIN in the policy's own SQL text, so
// it does not create an edge in the dependency graph below, whereas a raw
// `EXISTS (SELECT 1 FROM other_table ...)` always does.
//
// This test replays every migration in order (respecting DROP POLICY/CREATE
// POLICY), reconstructs the *current* effective USING/WITH CHECK text for
// every policy, extracts each policy's raw table dependencies, and fails if
// the resulting table-dependency graph has a cycle (including a table
// policy that references itself, which Postgres treats identically).
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

interface PolicyDef {
  table: string;
  name: string;
  file: string;
  body: string; // the USING/WITH CHECK SQL text, used to find table dependencies
}

// Splits a SQL file into top-level statements on ';', without breaking up
// dollar-quoted function bodies ($$...$$ or $tag$...$tag$), which contain
// their own internal semicolons (plpgsql statement separators).
function splitStatements(sql: string): string[] {
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

function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

function normalizeTableName(raw: string): string {
  return raw.replace(/^public\./i, '').replace(/"/g, '').toLowerCase();
}

function loadEffectivePolicies(): Map<string, PolicyDef> {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Keyed by `${table}::${policyName}` so DROP/CREATE of the same name replaces,
  // and DROP with no later CREATE removes it — this is the *current* state.
  const policies = new Map<string, PolicyDef>();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const cleaned = stripLineComments(raw);

    for (const stmt of splitStatements(cleaned)) {
      const trimmed = stmt.trim();

      const dropMatch = /^drop\s+policy\s+(?:if\s+exists\s+)?"?([^"\n]+?)"?\s+on\s+(?:public\.)?"?(\w+)"?/i
        .exec(trimmed);
      if (dropMatch) {
        const table = normalizeTableName(dropMatch[2]);
        const name = dropMatch[1].trim().toLowerCase();
        policies.delete(`${table}::${name}`);
        continue;
      }

      const createMatch = /^create\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:public\.)?"?(\w+)"?\s+for\s+\w+([\s\S]*)$/i
        .exec(trimmed);
      if (createMatch) {
        const name = createMatch[1].trim().toLowerCase();
        const table = normalizeTableName(createMatch[2]);
        const body = createMatch[3];
        policies.set(`${table}::${name}`, { table, name, file, body });
      }
    }
  }

  return policies;
}

// A raw FROM/JOIN inside a policy body always triggers the referenced
// table's RLS policy. A SECURITY DEFINER helper call (e.g. is_trip_member(id))
// does not appear as FROM/JOIN text here, so calls to such helpers are
// correctly invisible to this extraction — that's the whole point of the
// pattern this test is protecting.
function directTableDependencies(body: string): Set<string> {
  const deps = new Set<string>();
  const pattern = /\b(?:from|join)\s+(?:public\.)?"?(\w+)"?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    deps.add(normalizeTableName(match[1]));
  }
  return deps;
}

function findCycle(graph: Map<string, Set<string>>): string[] | null {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const node of graph.keys()) color.set(node, WHITE);

  const stack: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const c = color.get(next);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(next);
        return [...stack.slice(cycleStart), next];
      }
      if (c === WHITE || c === undefined) {
        color.set(next, WHITE);
        const found = dfs(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const node of graph.keys()) {
    if (color.get(node) === WHITE) {
      const found = dfs(node);
      if (found) return found;
    }
  }
  return null;
}

describe('RLS policy recursion (static analysis)', () => {
  it('has no cycles in the table-dependency graph formed by RLS policies', () => {
    const policies = loadEffectivePolicies();
    expect(policies.size).toBeGreaterThan(0); // sanity: parser actually found policies

    const graph = new Map<string, Set<string>>();
    const edgeSource = new Map<string, PolicyDef>(); // for a readable failure message

    for (const policy of policies.values()) {
      const deps = directTableDependencies(policy.body);
      if (!graph.has(policy.table)) graph.set(policy.table, new Set());
      for (const dep of deps) {
        graph.get(policy.table)!.add(dep);
        if (!graph.has(dep)) graph.set(dep, new Set());
        edgeSource.set(`${policy.table}->${dep}`, policy);
      }
    }

    const cycle = findCycle(graph);
    if (cycle) {
      const explanation = cycle.slice(0, -1).map((table, i) => {
        const next = cycle[i + 1];
        const via = edgeSource.get(`${table}->${next}`);
        return `  ${table} -> ${next}  (via policy "${via?.name}" in ${via?.file})`;
      }).join('\n');
      throw new Error(
        `RLS recursion cycle detected: ${cycle.join(' -> ')}\n${explanation}\n\n` +
        `Fix: route the cross-table check through a SECURITY DEFINER helper function ` +
        `(see is_trip_member()/is_trip_owner() in supabase/migrations/017_fix_rls_recursion.sql ` +
        `and 039_fix_trip_members_rls_recursion_again.sql) instead of a raw FROM/JOIN subquery.`,
      );
    }
  });

  it('every policy references at least one known table (parser sanity check)', () => {
    // Guards against the regexes above silently matching zero policies due to
    // a future SQL formatting change — this test is only useful if the parser
    // is actually finding the real policies.
    const policies = loadEffectivePolicies();
    const tables = Array.from(new Set(Array.from(policies.values()).map(p => p.table)));
    expect(tables).toEqual(expect.arrayContaining(['trips', 'trip_members', 'groups', 'group_members']));
  });
});
