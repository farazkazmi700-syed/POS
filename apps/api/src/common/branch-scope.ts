import { AsyncLocalStorage } from 'async_hooks';
import { Schema, Types } from 'mongoose';
export const branchContext = new AsyncLocalStorage<{ tenantId: string; branchId: string; defaultBranchId?: string }>();

/** New records are assigned to the request branch; legacy records belong only to the default branch. */
export function branchScoped(schema: Schema) {
  schema.add({ branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: () => { const id = branchContext.getStore()?.branchId; return id ? new Types.ObjectId(id) : undefined; }, index: true } });
  function filter() {
    const scope = branchContext.getStore();
    if (!scope) return null;
    const branchId = new Types.ObjectId(scope.branchId);
    return scope.branchId === scope.defaultBranchId ? { $or: [{ branchId }, { branchId: { $exists: false } }, { branchId: null }] } : { branchId };
  }
  for (const operation of ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'countDocuments'] as const) schema.pre(operation, function () {
    const scope = filter(); if (scope) this.setQuery({ $and: [this.getFilter(), scope] });
  });
  schema.pre('aggregate', function () { const scope = filter(); if (scope) this.pipeline().unshift({ $match: scope }); });
}
