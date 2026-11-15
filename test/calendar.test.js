const test = require('node:test');
const assert = require('node:assert');
const H = require('../app/shared/holidays.js');
const { parseIcs } = require('../app/main/features/calendar.js');

test('Indonesian national holidays 2026 match the SKB 3 Menteri list', () => {
  const y = H.year(2026, 'id');
  const want = ['2026-01-01', '2026-01-16', '2026-02-17', '2026-03-19', '2026-03-20', '2026-03-21', '2026-04-03', '2026-04-05',
    '2026-05-01', '2026-05-14', '2026-05-27', '2026-05-31', '2026-06-01', '2026-06-16', '2026-08-17', '2026-08-25', '2026-12-25'];
  assert.deepStrictEqual(Object.keys(y).sort(), want);
});

test('holidays exist for other years without throwing', () => {
  for (const yr of [2025, 2027, 2030]) assert.ok(Object.keys(H.year(yr, 'en')).length >= 14, String(yr));
});

const ICS = [
  'BEGIN:VCALENDAR', 'X-WR-TIMEZONE:Asia/Makassar',
  'BEGIN:VEVENT', 'DTSTART:20261116T013000Z', 'DTEND:20261116T023000Z', 'SUMMARY:Rapat tim', 'LOCATION:https://meet.google.com/abc-defg-hij', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261117', 'SUMMARY:Libur', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261116T060000Z', 'DTEND:20261116T070000Z', 'SUMMARY:Batal', 'STATUS:CANCELLED', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261102T010000Z', 'DTEND:20261102T020000Z', 'RRULE:FREQ=WEEKLY;COUNT=4', 'SUMMARY:Kuliah', 'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

test('iCal: events, all-day, cancelled, meeting link, weekly RRULE', () => {
  const from = Date.UTC(2026, 10, 1), to = Date.UTC(2026, 11, 1);
  const ev = parseIcs(ICS, from, to);
  const titles = ev.map((e) => e.title);
  assert.ok(titles.includes('Rapat tim'));
  assert.ok(!titles.includes('Batal'), 'cancelled events are skipped');
  assert.strictEqual(ev.find((e) => e.title === 'Rapat tim').link, 'https://meet.google.com/abc-defg-hij');
  assert.ok(ev.find((e) => e.title === 'Libur').allDay);
  assert.strictEqual(ev.filter((e) => e.title === 'Kuliah').length, 4, 'COUNT=4 weekly occurrences');
});
