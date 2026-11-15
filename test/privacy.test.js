const test = require('node:test');
const assert = require('node:assert');
const { findOtp, parseToast } = require('../app/main/features/notifications.js');
const { bootStale, bootMinutes, isOtpLike, PASSWORD_APPS } = require('../app/main/features/clipboard.js');

test('OTP codes are detected in common Indonesian/English messages', () => {
  assert.strictEqual(findOtp('Kode OTP Anda 482913. Jangan berikan ke siapa pun.'), '482913');
  assert.strictEqual(findOtp('Your verification code is 7710'), '7710');
  assert.strictEqual(findOtp('G-583920 is your Google verification code'), '583920');
  assert.strictEqual(findOtp('JANGAN BERIKAN kode ini: 12345678 untuk masuk'), '12345678');
});

test('non-OTP numbers are ignored', () => {
  assert.strictEqual(findOtp('Rapat jam 14.30 di ruang 204'), null);
  assert.strictEqual(findOtp('Selamat tahun baru 2027!'), null);
  assert.strictEqual(findOtp('Login code expires in 2026'), null);
  assert.strictEqual(findOtp('Total belanja Rp 150000'), null);
});

test('toast XML is parsed', () => {
  const t = parseToast('<toast launch="app://open?id=1&amp;x=2"><visual><binding><text>Budi</text><text>Halo &amp; selamat</text></binding></visual></toast>');
  assert.deepStrictEqual([t.title, t.body, t.launch], ['Budi', 'Halo & selamat', 'app://open?id=1&x=2']);
});

test('clipboard cache is wiped after a restart, kept across an RA restart', () => {
  const now = Date.UTC(2026, 10, 15, 10);
  const boot = bootMinutes(now, 3600); // booted an hour ago
  assert.strictEqual(bootStale(boot, bootMinutes(now + 90 * 60000, 3600 + 90 * 60)), false, 'same boot, later');
  assert.strictEqual(bootStale(boot, bootMinutes(now + 1000, 3600 + 1 - 30)), false, 'small uptime jitter is fine');
  assert.strictEqual(bootStale(boot, bootMinutes(now + 3600000, 120)), true, 'rebooted');
  assert.strictEqual(bootStale(undefined, boot), true, 'missing boot stamp');
});

test('OTP-like clipboard text is never stored', () => {
  for (const s of ['123456', ' 4821 ', 'G-583920', '12345678']) assert.ok(isOtpLike(s), s);
  for (const s of ['123', 'halo 123456', '2026-11-15', '1234567890']) assert.ok(!isOtpLike(s), s);
  assert.ok(PASSWORD_APPS.includes('bitwarden.exe') && PASSWORD_APPS.includes('1password.exe'));
});
