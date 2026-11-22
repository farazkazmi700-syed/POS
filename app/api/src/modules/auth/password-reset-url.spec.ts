import { passwordResetPage } from './password-reset-url';

describe('password reset email destination', () => {
  it.each([
    ['', '/reset-password'],
    ['/', '/reset-password'],
    ['/reset-password', '/reset-password'],
    ['/shop/', '/shop/reset-password'],
    ['/shop/reset-password/', '/shop/reset-password'],
  ])('resolves configured path "%s" to "%s"', (path, expected) => {
    expect(passwordResetPage('https://pos.example.test' + path).href)
      .toBe('https://pos.example.test' + expected);
  });

  it('rejects non-web destinations', () => {
    expect(() => passwordResetPage('file:///reset-password')).toThrow('HTTP or HTTPS');
  });
});
