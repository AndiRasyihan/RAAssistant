const test = require('node:test');
const assert = require('node:assert');
const D = require('../app/main/features/devices.js');

test('Bluetooth kind from class-of-device, category and name', () => {
  // 0x240404: audio/video, wearable headset (real "IT Tunespace" value on the dev laptop)
  assert.strictEqual(D.btKind({ name: 'IT Tunespace', cod: 2360324, cat: 'Communication.Headset.Bluetooth' }), 'headphones');
  assert.strictEqual(D.btKind({ name: 'ROBOT Airbuds T60', cod: 2360324 }), 'tws');
  assert.strictEqual(D.btKind({ name: 'TF-T10', cod: 2360324 }), 'tws');
  assert.strictEqual(D.btKind({ name: 'Galaxy Buds2', cod: 0x240418 }), 'tws');
  assert.strictEqual(D.btKind({ name: 'JBL Go', cod: 0x240414 }), 'speaker');      // minor 5 loudspeaker
  assert.strictEqual(D.btKind({ name: 'MX', cod: 0x002580 }), 'mouse');            // peripheral, pointing
  assert.strictEqual(D.btKind({ name: 'K380', cod: 0x002540 }), 'keyboard');       // peripheral, keyboard
  assert.strictEqual(D.btKind({ name: 'Pad', cod: 0x002508 }), 'gamepad');         // peripheral, gamepad
  assert.strictEqual(D.btKind({ name: 'Infinix NOTE 50 Pro', cod: 0x5a020c }), 'phone');
  assert.strictEqual(D.btKind({ name: 'LE mouse', cat: 'Input.Mouse' }), 'mouse');  // BLE: no CoD, category only
  assert.strictEqual(D.btKind({ name: 'Thing' }), 'generic');
});

test('PnP kind: relevant classes only, Bluetooth HID and internal disks ignored', () => {
  assert.strictEqual(D.pnpKind({ k: 'pnp', cls: 'Mouse', id: 'HID\\VID_046D&PID_C077\\7&1' }), 'mouse');
  assert.strictEqual(D.pnpKind({ k: 'pnp', cls: 'Mouse', id: 'HID\\{00001124-0000-1000-8000-00805F9B34FB}_VID&0002' }), null);
  assert.strictEqual(D.pnpKind({ k: 'pnp', cls: 'WPD', id: 'USB\\VID_1D5B&PID_600C\\X', name: 'Infinix NOTE 50 Pro' }), 'phone');
  assert.strictEqual(D.pnpKind({ k: 'pnp', cls: 'WPD', id: 'SWD\\WPDBUSENUM\\_??_USBSTOR', name: 'E:\\' }), null);
  assert.strictEqual(D.pnpKind({ k: 'pnp', cls: 'Net', id: 'USB\\VID_0E8D', name: 'Remote NDIS based Internet Sharing Device' }), 'tether');
  assert.strictEqual(D.pnpKind({ k: 'pnp', cls: 'USB', id: 'USB\\ROOT_HUB30\\5', name: 'USB Root Hub (USB 3.0)' }), 'usb-generic');
  assert.strictEqual(D.pnpKind({ k: 'pnp', cls: 'HIDClass', id: 'HID\\X' }), null);
});

test('diff + summarize: one notice per plug, drive letter attached, generic USB nodes hidden', () => {
  const base = [{ k: 'pnp', id: 'USB\\ROOT_HUB30\\5', cls: 'USB', name: 'USB Root Hub (USB 3.0)' }];
  const cur = base.concat([
    { k: 'pnp', id: 'USB\\VID_0781&PID_5567\\1', cls: 'USB', name: 'USB Mass Storage Device' },
    { k: 'pnp', id: 'USBSTOR\\DISK&VEN_SANDISK\\1', cls: 'DiskDrive', name: 'SanDisk Cruzer Blade USB Device' },
    { k: 'vol', id: 'E:', name: 'KAMPUS' }
  ]);
  const { added, removed } = D.diffDevices(base, cur);
  assert.strictEqual(added.length, 3); assert.strictEqual(removed.length, 0);
  assert.deepStrictEqual(D.summarize(added), { kind: 'drive', name: 'SanDisk Cruzer Blade', extra: 'E:', more: 0 });
  assert.deepStrictEqual(D.summarize(D.diffDevices(cur, base).removed).kind, 'drive');
  // A charge-only cable shows only a composite node: still announced, without a misleading name.
  assert.deepStrictEqual(D.summarize([{ k: 'pnp', id: 'USB\\VID_1\\2', cls: 'USB', name: 'USB Composite Device' }]), { kind: 'usb', name: '', extra: '', more: 0 });
  assert.strictEqual(D.summarize([{ k: 'pnp', id: 'HID\\X', cls: 'HIDClass' }]), null);
});

test('monitor connection type labels (USB-C alt mode = DisplayPort)', () => {
  assert.strictEqual(D.monTech(5), 'HDMI');
  assert.strictEqual(D.monTech(10), 'DisplayPort / USB-C');
  assert.strictEqual(D.monTech(2147483648), 'internal');
  const s = D.summarize([{ k: 'mon', id: 'DISPLAY\\SAM0F9E\\1', name: 'S24R35x', tech: 5 }]);
  assert.deepStrictEqual(s, { kind: 'display', name: 'S24R35x', extra: 'HDMI', more: 0 });
});

test('netsh wlan parsing (connected, disconnected, profile fallback)', () => {
  const raw = '\n    Name                   : Wi-Fi\n    State                  : connected\n    SSID                   : Rasyihan\n    AP BSSID               : 02:2b:13:3b:b6:a7\n    Signal                 : 76%\n';
  assert.deepStrictEqual(D.parseWlan(raw), { connected: true, ssid: 'Rasyihan', signal: 76 });
  assert.deepStrictEqual(D.parseWlan('    State : disconnected\n'), { connected: false, ssid: '', signal: null });
  // Newer Windows hides SSID from netsh without location permission → fall back to the profile name.
  assert.deepStrictEqual(D.parseWlan('    Sinyal : 60%\n', 'Kos Lt 2'), { connected: true, ssid: 'Kos Lt 2', signal: 60 });
});
