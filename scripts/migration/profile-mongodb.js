// Run with mongosh, not Node. Read-only: never imports application models.
// Emits metadata and aggregate counts only, never document values or credentials.
const source = db.getSiblingDB('pos');
const collections = source.getCollectionNames().sort();
const report = {
  observedAt: new Date().toISOString(),
  consistency: 'Live read; not a point-in-time snapshot or cutover reconciliation',
  database: 'pos',
  databases: db.adminCommand({ listDatabases: 1, nameOnly: true }).databases.map(x => x.name),
  collections: [],
  relationships: [],
};
for (const name of collections) {
  const collection = source.getCollection(name);
  const count = collection.countDocuments({});
  const fields = collection.aggregate([
    { $project: { fields: { $objectToArray: '$$ROOT' } } },
    { $unwind: '$fields' },
    { $group: { _id: { field: '$fields.k', type: { $type: '$fields.v' } }, count: { $sum: 1 } } },
    { $sort: { '_id.field': 1, '_id.type': 1 } },
  ], { maxTimeMS: 60000 }).toArray();
  const indexes = collection.getIndexes().map(x => ({
    name: x.name, key: x.key, unique: !!x.unique, sparse: !!x.sparse,
    expiresAfterSeconds: x.expireAfterSeconds ?? null,
    partial: !!x.partialFilterExpression,
  }));
  report.collections.push({ name, count, fields, indexes });
}
const relations = [
  ['orders', 'cashierId', 'users'], ['orders', 'items.productId', 'products'],
  ['installmentplans', 'orderId', 'orders'], ['installmentplans', 'customerId', 'customers'],
  ['installmentsales', 'customerId', 'customers'], ['installmentsales', 'installmentProductId', 'installmentproducts'],
  ['stockadjustments', 'productId', 'products'], ['tenants', 'subscriptionPlanId', 'subscriptionplans'],
  ['tenants', 'defaultBranchId', 'branches'], ['users', 'branchIds', 'branches'],
  ['adminaudits', 'actorId', 'users'], ['recoverychallenges', 'userId', 'users'],
];
for (const collection of report.collections) {
  if (collection.fields.some(x => x._id.field === 'tenantId')) relations.push([collection.name, 'tenantId', 'tenants']);
  if (collection.fields.some(x => x._id.field === 'branchId')) relations.push([collection.name, 'branchId', 'branches']);
}
for (const [from, field, to] of relations) {
  if (!collections.includes(from)) continue;
  const rows = source.getCollection(from).aggregate([
    { $match: { [field]: { $exists: true, $ne: null } } },
    { $project: { tenantId: 1, reference: '$' + field } },
    { $unwind: '$reference' },
    { $lookup: { from: to, localField: 'reference', foreignField: '_id', as: 'target' } },
    { $project: {
      missing: { $eq: [{ $size: '$target' }, 0] },
      crossTenant: { $and: [
        { $gt: [{ $size: '$target' }, 0] },
        { $ne: [{ $ifNull: ['$tenantId', null] }, null] },
        { $ne: [{ $ifNull: [{ $arrayElemAt: ['$target.tenantId', 0] }, null] }, null] },
        { $ne: ['$tenantId', { $arrayElemAt: ['$target.tenantId', 0] }] },
      ] },
    } },
    { $group: { _id: null, checked: { $sum: 1 }, missing: { $sum: { $cond: ['$missing', 1, 0] } }, crossTenant: { $sum: { $cond: ['$crossTenant', 1, 0] } } } },
  ], { maxTimeMS: 60000 }).toArray();
  report.relationships.push({ from, field, to, ...(rows[0] || { checked: 0, missing: 0, crossTenant: 0 }), _id: undefined });
}
print(JSON.stringify(report, null, 2));
