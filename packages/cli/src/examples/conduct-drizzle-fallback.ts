import { sql } from 'drizzle-orm';
import { check, getTableConfig, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const PHASE_STATUS_VALUES = ['pending', 'in_progress', 'complete', 'failed', 'blocked'] as const;
export type PhaseStatus = (typeof PHASE_STATUS_VALUES)[number];

export const CONDUCT_PHASE_UNIQUE_INDEX = 'conduct_specs_spec_phase_unique';
export const CONDUCT_PHASE_STATUS_CHECK = 'conduct_specs_status_check';

/**
 * Direct Drizzle fallback for Conduct schema requirements when generated output
 * does not yet include composite unique + CHECK constraints.
 */
export const conductSpecsTable = pgTable(
  'conduct_specs',
  {
    id: text('id').primaryKey(),
    specId: text('spec_id').notNull(),
    phaseNumber: integer('phase_number').notNull(),
    status: text('status').$type<PhaseStatus>().notNull(),
  },
  (table) => ({
    specPhaseUnique: uniqueIndex(CONDUCT_PHASE_UNIQUE_INDEX).on(table.specId, table.phaseNumber),
    statusCheck: check(
      CONDUCT_PHASE_STATUS_CHECK,
      sql`${table.status} in ('pending','in_progress','complete','failed','blocked')`
    ),
  })
);

export function isValidPhaseStatus(status: string): status is PhaseStatus {
  return (PHASE_STATUS_VALUES as readonly string[]).includes(status);
}

export function getConductSchemaConstraintNames(): { indexes: string[]; checks: string[] } {
  const config = getTableConfig(conductSpecsTable);
  return {
    indexes: config.indexes.map((index) => index.config.name).filter((name): name is string => Boolean(name)),
    checks: config.checks.map((checkConstraint) => checkConstraint.name),
  };
}
