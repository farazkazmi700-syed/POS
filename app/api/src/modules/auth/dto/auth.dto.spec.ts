import { validate } from 'class-validator';
import { CreateStaffDto, UpdateStaffRightsDto } from './auth.dto';
import { Role } from '../../../common/enums';

// OpenAPI decorators are documentation only; isolate validation from Nest's ESM graph.
jest.mock('@nestjs/swagger', () => ({ ApiProperty: () => () => {}, ApiPropertyOptional: () => () => {} }));

const rights = ['dashboard', 'pos', 'products', 'customers', 'installments', 'orders', 'settings', 'barcode-generator', 'barcode-scanner'];
describe('staff rights input', () => {
  it('accepts all nine module keys for creation and updates', async () => {
    const staff = Object.assign(new CreateStaffDto(), { name: 'Store admin', email: 'admin@example.com', password: 'test-password-123', role: Role.Admin, moduleRights: rights });
    expect(await validate(staff)).toHaveLength(0);
    expect(await validate(Object.assign(new UpdateStaffRightsDto(), { moduleRights: rights }))).toHaveLength(0);
  });
  it('rejects owner creation through staff APIs and unknown rights', async () => {
    const staff = Object.assign(new CreateStaffDto(), { name: 'Store admin', email: 'admin@example.com', password: 'test-password-123', role: Role.Owner, moduleRights: ['super-admin'] });
    const errors = await validate(staff);
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['role', 'moduleRights']));
  });
  it('accepts an explicit empty rights list', async () => {
    expect(await validate(Object.assign(new UpdateStaffRightsDto(), { moduleRights: [] }))).toHaveLength(0);
  });
});
