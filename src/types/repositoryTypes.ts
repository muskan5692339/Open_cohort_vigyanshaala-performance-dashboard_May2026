export interface SyncContext {
  organizationId: string;
  userId?: string;
  accessToken?: string;
}

export interface Repository<T> {
  list(ctx?: SyncContext): T[] | Promise<T[]>;
  create(input: unknown, ctx?: SyncContext): T | Promise<T>;
  update?(id: string, input: unknown, ctx?: SyncContext): T | null | Promise<T | null>;
  delete?(id: string, ctx?: SyncContext): void | Promise<void>;
  sync(ctx?: SyncContext): Promise<boolean>;
  hydrate(ctx?: SyncContext): Promise<T[]>;
}
