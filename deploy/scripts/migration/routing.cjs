const GLOBAL_COLLECTIONS = new Set(['subscriptionplans', 'platformmodules', 'adminaudits']);
const BUSINESS_COLLECTIONS = new Set([
  'tenants', 'users', 'products', 'customers', 'orders', 'invoicecounters',
  'installmentplans', 'installmentproducts', 'installmentsales', 'branches',
  'auditevents', 'stockadjustments', 'checkoutrequests', 'recoverychallenges',
  'password_reset_tokens', 'recovery_codes',
]);
function objectId(value) {
  if (!value || value._bsontype !== 'ObjectId') throw new Error('Expected an ObjectId; source needs review');
  return value.toHexString();
}
function destination(collection, document, tenantIds, users) {
  if (GLOBAL_COLLECTIONS.has(collection)) return 'pos_stage_control';
  if (!BUSINESS_COLLECTIONS.has(collection)) throw new Error('Unmapped collection; source needs review');
  let tenant;
  if (collection === 'tenants') tenant = objectId(document._id);
  else if (document.tenantId) tenant = objectId(document.tenantId);
  else if (['password_reset_tokens', 'recovery_codes'].includes(collection)) tenant = users.get(objectId(document.userId));
  if (!tenant || !tenantIds.has(tenant)) throw new Error('Unresolved business ownership; source needs review');
  return `pos_stage_${tenant}`;
}
function stagingDatabaseName(value, capture = '') {
  if (capture && !/^[0-9]{14}$/.test(capture)) throw new Error('Invalid staging capture ID');
  if (!/^pos_stage_(?:control|[a-f0-9]{24})$/.test(value)) throw new Error('Refusing non-staging database');
  return value + (capture ? '_' + capture : '');
}
function databaseIdentifier(value) {
  return '"' + stagingDatabaseName(value) + '"';
}
module.exports = { destination, stagingDatabaseName, databaseIdentifier, objectId, GLOBAL_COLLECTIONS, BUSINESS_COLLECTIONS };
