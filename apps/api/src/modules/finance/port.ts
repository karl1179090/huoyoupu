import type {PoolClient} from 'pg';
import type {components} from '@huoyoupu/contracts';
export type AccountChange = components['schemas']['AccountChange'];
export interface CommercialChange {
  customerId: string;
  kind: 'sale' | 'return' | 'reversal' | 'reclassification';
  sourceId: string;
  sourceVersion: number;
  amountSigned: bigint;
  effectiveAt: Date;
  reversesId?: string;
  reclassifiesId?: string;
}
export interface CommercialSource extends CommercialChange {id: string; orderId: string}
export interface CommercialOperation {operationId: string; actorId: string; orderId: string; changes: readonly CommercialChange[]}
export interface FinancePort {
  lockAccounts(client: PoolClient, customerIds: readonly string[]): Promise<void>;
  applyCommercial(client: PoolClient, operation: CommercialOperation): Promise<AccountChange[]>;
  previewCommercial(client: PoolClient, changes: readonly CommercialChange[]): Promise<AccountChange[]>;
  listCommercial(client: PoolClient, orderId: string, customerId?: string): Promise<CommercialSource[]>;
}
