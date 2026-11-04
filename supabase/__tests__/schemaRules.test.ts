import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  replayMigrations, splitStatements, stripLineComments, normalizeName,
  MIGRATIONS_DIR, Schema, PolicyCommand,
} from './migrationReplay';

// Static checks for schema bug shapes that the in-memory unit tests cannot see,
// because the mocks have no column types and no RLS. Each rule is shown to fail
// on the migrations as they stood before the fix that motivated it.

// A uuid user-id column without a foreign key to users/auth.users is a member id
// that can hold a placeholder (guest_<uuid> for group guests), so it must be text.
function uuidMemberIdColumns(schema: Schema): string[] {
  const found: string[] = [];
  for (const [table, columns] of schema.tables) {
    for (const [name, col] of columns) {
      if (!name.endsWith('user_id') || col.type !== 'uuid') continue;
      if (col.fkTarget === 'users' || col.fkTarget === 'auth.users') continue;
      found.push(`${table}.${name}`);
    }
  }
  return found;
}

const TRIP_SCOPED = /\btrip_id\b|\bis_trip_member\b|\bis_trip_owner\b|\btrips\b/i;
const GROUP_AWARE = /\bgroup_id\b|\bis_group_member\b|\bgroups\b/i;
const COMMANDS: Exclude<PolicyCommand, 'all'>[] = ['select', 'insert', 'update', 'delete'];

// On a table whose rows belong to either a trip or a group (nullable trip_id plus
// group_id), any command a trip-scoped policy allows must also be allowed for
// group rows, or group rows can never be read/written for that command.
function missingGroupPolicies(schema: Schema): string[] {
  const missing: string[] = [];
  for (const [table, columns] of schema.tables) {
    const tripId = columns.get('trip_id');
    if (!tripId || tripId.notNull || !columns.has('group_id')) continue;

    const policies = Array.from(schema.policies.values()).filter(p => p.table === table);
    for (const command of COMMANDS) {
      const forCommand = policies.filter(p => p.command === command || p.command === 'all');
      const tripScoped = forCommand.some(p => TRIP_SCOPED.test(p.body));
      const groupAware = forCommand.some(p => GROUP_AWARE.test(p.body));
      if (tripScoped && !groupAware) missing.push(`${table} ${command}`);
    }
  }
  return missing;
}

// Supabase no longer grants the API roles access to new public tables (049), so
// a table created without a GRANT is unreachable from the app. Migrations up to
// 049 are covered by 049's blanket grant.
const LAST_BLANKET_GRANT = '049';

function tablesWithoutGrant(dir: string): string[] {
  const missing: string[] = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (file.slice(0, LAST_BLANKET_GRANT.length) <= LAST_BLANKET_GRANT) continue;
    const statements = splitStatements(stripLineComments(fs.readFileSync(path.join(dir, file), 'utf8')))
      .map(st => st.trim());
    const granted = new Set<string>();
    for (const st of statements) {
      const g = /^grant\s+[\s\S]+?\s+on\s+(?:table\s+)?([\s\S]+?)\s+to\s+([\s\S]+)$/i.exec(st);
      if (g && /\bauthenticated\b/i.test(g[2])) {
        for (const t of g[1].split(',')) granted.add(normalizeName(t.trim()));
      }
    }
    for (const st of statements) {
      const c = /^create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)/i.exec(st);
      if (c && !granted.has(normalizeName(c[1]))) missing.push(`${file}: ${normalizeName(c[1])}`);
    }
  }
  return missing;
}

describe('schema rules (static analysis of migrations)', () => {
  const current = replayMigrations();

  it('parser sanity: finds the core tables and their user-id columns', () => {
    expect(Array.from(current.tables.keys())).toEqual(
      expect.arrayContaining(['users', 'trips', 'expenses', 'splits', 'groups', 'group_members']),
    );
    expect(current.tables.get('expenses')?.get('paid_by_user_id')).toBeDefined();
  });

  describe('member-id columns must be text', () => {
    it('no uuid user-id column without a users foreign key', () => {
      expect(uuidMemberIdColumns(current)).toEqual([]);
    });

    it('catches the 048 bug on the schema before 048', () => {
      expect(uuidMemberIdColumns(replayMigrations('047')).sort()).toEqual([
        'expenses.paid_by_user_id',
        'splits.user_id',
      ]);
    });
  });

  describe('new tables must be granted to the API roles', () => {
    it('every table created after 049 has a GRANT to authenticated in its migration', () => {
      expect(tablesWithoutGrant(MIGRATIONS_DIR)).toEqual([]);
    });

    it('flags a table created without a grant, and accepts one with', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grant-rule-'));
      try {
        fs.writeFileSync(path.join(dir, '999_new.sql'), 'CREATE TABLE public.widgets (id uuid primary key);');
        expect(tablesWithoutGrant(dir)).toEqual(['999_new.sql: widgets']);

        fs.writeFileSync(path.join(dir, '999_new.sql'),
          'CREATE TABLE public.widgets (id uuid primary key);\nGRANT SELECT, INSERT ON public.widgets TO authenticated;');
        expect(tablesWithoutGrant(dir)).toEqual([]);
      } finally {
        fs.rmSync(dir, { recursive: true });
      }
    });
  });

  describe('trip-or-group tables need group-aware policies', () => {
    it('every trip-scoped command has a group-aware policy', () => {
      expect(missingGroupPolicies(current)).toEqual([]);
    });

    it('catches the 047 bug on the schema before 047', () => {
      expect(missingGroupPolicies(replayMigrations('046')).sort()).toEqual([
        'expenses delete',
        'expenses insert',
        'expenses select',
        'expenses update',
      ]);
    });
  });
});
