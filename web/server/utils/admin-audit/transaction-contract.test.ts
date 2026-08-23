import { describe, expect, it } from 'vitest'
import { AdminAuditEventRepository, type Database } from '@modus/db'
import type { AuditTransaction } from './types'

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Assert<T extends true> = T
type SameTransactionExecutor = Assert<
  DatabaseTransaction extends AuditTransaction
    ? AuditTransaction extends DatabaseTransaction
      ? true
      : false
    : false
>

function compileTransactionRepositoryContract(db: Database) {
  return db.transaction(async (tx) => {
    const executor: AuditTransaction = tx
    return new AdminAuditEventRepository(executor)
  })
}

describe('audit transaction production contract', () => {
  it('type-checks the real Drizzle transaction executor with the production audit repository', () => {
    expect(typeof compileTransactionRepositoryContract).toBe('function')
  })
})
