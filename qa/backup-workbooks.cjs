const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const requireApi = createRequire(require('node:path').resolve(__dirname, '../app/api/package.json'));
const { unzipSync } = requireApi('fflate');
const { Workbook } = requireApi('exceljs');

async function verifyBackup(bytes, tenantId) {
  const files = unzipSync(bytes);
  const required = ['products', 'customers', 'orders', 'invoicecounters', 'installmentplans', 'manifest'];
  for (const name of required) assert.ok(files[name + '.xlsx'], 'Missing ' + name + '.xlsx');
  assert.ok(Object.keys(files).every((name) => name.endsWith('.xlsx')));
  const sheets = {};
  for (const [name, data] of Object.entries(files)) {
    const workbook = new Workbook();
    await workbook.xlsx.load(data);
    const records = workbook.getWorksheet('Records');
    assert.equal(records.views[0].state, 'frozen');
    assert.equal(records.getRow(1).font.bold, true);
    assert.ok(records.autoFilter);
    sheets[name] = records;
  }
  const manifest = sheets['manifest.xlsx'];
  const entryFields = manifest.getRow(1).values;
  for (const [name, sheet] of Object.entries(sheets)) {
    if (name === 'manifest.xlsx') continue;
    let manifestRow;
    manifest.eachRow((row, number) => {
      if (number > 1 && row.getCell(entryFields.indexOf('File Name')).value === name) manifestRow = row;
    });
    assert.ok(manifestRow, 'Manifest is missing ' + name);
    assert.equal(manifestRow.getCell(entryFields.indexOf('Record Count')).value, sheet.rowCount - 1);
    assert.equal(manifestRow.getCell(entryFields.indexOf('Byte Count')).value, files[name].length);
    assert.equal(manifestRow.getCell(entryFields.indexOf('Sha256')).value, createHash('sha256').update(files[name]).digest('hex'));
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      const fields = sheet.getRow(1).values;
      const scopeColumn = fields.indexOf(name === 'tenants.xlsx' ? 'Record ID' : 'Tenant Id');
      assert.ok(scopeColumn > 0);
      assert.equal(row.getCell(scopeColumn).value, tenantId);
    });
  }
  assert.ok(!sheets['users.xlsx'].getRow(1).values.some((name) => /password|pin hash|refresh token|secret/i.test(name)));
  return sheets;
}

module.exports = { verifyBackup };
