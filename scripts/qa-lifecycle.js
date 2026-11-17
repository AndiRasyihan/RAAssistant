// Lifecycle torture test for the island window. Usage: node scripts/qa-lifecycle.js
// Runs against the RA Assistant instance that is already running and checks the island survives:
// WM_CLOSE (Alt+F4 / "End task"), a killed renderer process, and a second launch.
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EV = path.join(process.env.APPDATA, 'RAAssistant', 'events.log');
// Works for the installed build (RA Assistant.exe) and the dev copy (electron.exe <repo>).
const PROCS = "Get-CimInstance Win32_Process | ? { $_.Name -eq 'RA Assistant.exe' -or ($_.Name -eq 'electron.exe' -and $_.CommandLine -match 'RAAssistant') }";
const MAIN = `${PROCS} | ? { $_.CommandLine -notmatch '--type=' }`;
const ps = (cmd) => execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WIN = `Add-Type @"
using System;using System.Text;using System.Runtime.InteropServices;
public class QW{public delegate bool P(IntPtr h,IntPtr l);[DllImport("user32.dll")]public static extern bool EnumWindows(P p,IntPtr l);
[DllImport("user32.dll")]public static extern int GetWindowThreadProcessId(IntPtr h,out int p);[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]public static extern IntPtr PostMessage(IntPtr h,int m,IntPtr w,IntPtr l);
[DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]public static extern IntPtr GWL(IntPtr h,int i);
public static IntPtr Find(int pid){IntPtr f=IntPtr.Zero;EnumWindows((h,l)=>{int p;GetWindowThreadProcessId(h,out p);var s=new StringBuilder(64);GetWindowText(h,s,64);if(p==pid&&IsWindowVisible(h)&&s.ToString()=="RA Assistant"){f=h;return false;}return true;},IntPtr.Zero);return f;}
public static bool NoTaskbar(IntPtr h){long ex=(long)GWL(h,-20);return (ex&0x80)!=0&&(ex&0x40000)==0;}}
"@`;
// WS_EX_TOOLWINDOW without WS_EX_APPWINDOW = Windows never shows a taskbar button for the window.
function noTaskbar(pid) { const h = islandHwnd(pid); return !!h && ps(`${WIN}; [QW]::NoTaskbar([IntPtr]${h})`) === 'True'; }

function mainPid() {
  const out = ps(`${MAIN} | % ProcessId`);
  return out ? +out.split(/\s+/)[0] : 0;
}
function islandHwnd(pid) { return +ps(`${WIN}; [int64][QW]::Find(${pid})`); }
function rendererPid() {
  const out = ps(`${PROCS} | ? { $_.CommandLine -match '--type=renderer' } | sort CreationDate | % ProcessId`);
  return out ? out.split(/\s+/).map(Number) : [];
}
async function waitIsland(pid, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (islandHwnd(pid)) return true; await sleep(500); }
  return false;
}

(async () => {
  const results = [];
  const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); };
  const pid = mainPid();
  if (!pid) { console.log('RA Assistant is not running'); process.exit(2); }
  check('island present at start', await waitIsland(pid));
  check('no taskbar button at start', noTaskbar(pid));
  const installedExe = path.join(process.env.LOCALAPPDATA, 'Programs', 'RA Assistant', 'RA Assistant.exe');
  if (fs.existsSync(installedExe)) {
    check('installed app owns the island (not a stale dev copy)', ps(`${MAIN} | % Name`) === 'RA Assistant.exe');
    check('no legacy logon task', ps(`(Get-ScheduledTask -TaskName 'RA Assistant AutoStart' -ErrorAction SilentlyContinue | Measure-Object).Count`) === '0');
  }

  // 0. Typing in the island makes it focusable (the path that used to add a taskbar button).
  const runningExe = ps(`${MAIN} | % ExecutablePath`);
  const appArgs = /electron\.exe$/i.test(runningExe) ? [path.join(__dirname, '..')] : [];
  spawn(runningExe, [...appArgs, '--qa-focus'], { detached: true, stdio: 'ignore' }).unref();
  await sleep(1200);
  check('no taskbar button while island is focused', noTaskbar(pid));
  await sleep(2500);
  check('no taskbar button after focus ends', noTaskbar(pid));

  // 1. WM_CLOSE, like Alt+F4 or Task Manager "End task".
  ps(`${WIN}; [QW]::PostMessage([IntPtr]${islandHwnd(pid)}, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null`);
  await sleep(1500);
  check('WM_CLOSE does not remove the island', !!islandHwnd(pid) && mainPid() === pid);

  // 2. Kill every renderer (island crash).
  for (const r of rendererPid()) ps(`Stop-Process -Id ${r} -Force -ErrorAction SilentlyContinue`);
  await sleep(1000);
  check('island recreated after renderer killed', await waitIsland(pid, 20000) && mainPid() === pid);
  check('no taskbar button after recreate', noTaskbar(pid));

  // 3. Second launch restores it and keeps a single instance (uses the same build that is running).
  const installed = path.join(process.env.LOCALAPPDATA, 'Programs', 'RA Assistant', 'RA Assistant.exe');
  const dev = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
  const runningInstalled = ps(`${MAIN} | % Name`) === 'RA Assistant.exe';
  const exe = runningInstalled ? installed : dev;
  if (fs.existsSync(exe)) {
    spawn(exe, runningInstalled ? [] : [path.join(__dirname, '..')], { detached: true, stdio: 'ignore' }).unref();
    await sleep(5000);
    const mains = ps(`(${MAIN} | Measure-Object).Count`);
    check('second launch keeps one instance', +mains === 1, mains + ' main process(es)');
    check('island present after second launch', await waitIsland(pid));
    check('no taskbar button after second launch', noTaskbar(pid));
    // 4. Closing the Settings window (opened by the second launch) leaves the island alone.
    const closed = ps(`${WIN.replace('s.ToString()=="RA Assistant"', 's.ToString()!="RA Assistant"&&s.Length>0')}; $h=[QW]::Find(${pid}); if($h -ne [IntPtr]::Zero){[QW]::PostMessage($h,0x10,[IntPtr]::Zero,[IntPtr]::Zero)|Out-Null; 'y'}`);
    await sleep(2000);
    check('closing Settings keeps the island', closed === 'y' && !!islandHwnd(pid) && mainPid() === pid, closed ? '' : 'settings window not found');
  }

  const log = fs.existsSync(EV) ? fs.readFileSync(EV, 'utf8').trim().split('\n').slice(-8).join('\n') : '';
  console.log('\nevents.log (tail):\n' + log);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
