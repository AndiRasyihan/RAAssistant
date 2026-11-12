# RA Assistant system helper. One long-running process; talks JSON lines over stdin/stdout.
# Only emits a message when something changes, to keep CPU usage minimal.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

namespace RAH {
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr p);
    int UnregisterControlChangeNotify(IntPtr p);
    int GetChannelCount(out uint c);
    int SetMasterVolumeLevel(float level, ref Guid ctx);
    int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    int GetMasterVolumeLevel(out float level);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint ch, float level, ref Guid ctx);
    int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
    int GetChannelVolumeLevel(uint ch, out float level);
    int GetChannelVolumeLevelScalar(uint ch, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    int OpenPropertyStore(int access, out IntPtr store);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out int state);
  }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceCollection { int GetCount(out uint c); int Item(uint i, out IMMDevice d); }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int flow, int mask, out IMMDeviceCollection c);
    int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d);
  }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumeratorCo {}

  public static class Audio {
    static IMMDeviceEnumerator en;
    static IMMDeviceEnumerator En() { if (en == null) en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCo()); return en; }
    static IAudioEndpointVolume Vol(IMMDevice d) {
      object o; Guid g = typeof(IAudioEndpointVolume).GUID;
      if (d.Activate(ref g, 23, IntPtr.Zero, out o) != 0) return null;
      return (IAudioEndpointVolume)o;
    }
    static IAudioEndpointVolume DefOut() {
      IMMDevice d;
      if (En().GetDefaultAudioEndpoint(0, 1, out d) != 0 || d == null) return null;
      return Vol(d);
    }
    // "volume|muted" e.g. "0.45|0"
    public static string State() {
      var v = DefOut(); if (v == null) return "-1|0";
      float f; bool m; v.GetMasterVolumeLevelScalar(out f); v.GetMute(out m);
      return Math.Round(f, 3).ToString(System.Globalization.CultureInfo.InvariantCulture) + "|" + (m ? 1 : 0);
    }
    public static void SetVolume(float f) {
      var v = DefOut(); if (v == null) return; Guid g = Guid.Empty;
      v.SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, f)), ref g);
      if (f > 0) v.SetMute(false, ref g);
    }
    public static void SetMute(bool m) { var v = DefOut(); if (v == null) return; Guid g = Guid.Empty; v.SetMute(m, ref g); }
    // Mute/unmute every active capture endpoint (all microphones).
    public static int SetAllMics(bool mute) {
      IMMDeviceCollection c; if (En().EnumAudioEndpoints(1, 1, out c) != 0) return 0;
      uint n; c.GetCount(out n); int k = 0;
      for (uint i = 0; i < n; i++) {
        IMMDevice d; c.Item(i, out d); var v = Vol(d); if (v == null) continue;
        Guid g = Guid.Empty; v.SetMute(mute, ref g); k++;
      }
      return k;
    }
    // 1 = every mic muted, 0 = at least one live, -1 = no mics
    public static int MicsMuted() {
      IMMDeviceCollection c; if (En().EnumAudioEndpoints(1, 1, out c) != 0) return -1;
      uint n; c.GetCount(out n); if (n == 0) return -1;
      for (uint i = 0; i < n; i++) {
        IMMDevice d; c.Item(i, out d); var v = Vol(d); if (v == null) continue;
        bool m; v.GetMute(out m); if (!m) return 0;
      }
      return 1;
    }
  }

  public static class Win {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
    [DllImport("user32.dll")] static extern short GetKeyState(int k);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
    [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int s);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool i, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int f, StringBuilder sb, ref int n);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }

    public static bool Caps() { return (GetKeyState(0x14) & 1) != 0; }
    [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
    public static uint ClipSeq() { return GetClipboardSequenceNumber(); }

    static uint lastPid; static string lastExe = "";
    // exe|fullscreen|coversTop|notificationState|monitorLeft,monitorTop
    public static string Foreground() {
      IntPtr h = GetForegroundWindow();
      if (h == IntPtr.Zero) return "|0|0|1|0,0";
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != lastPid) {
        lastPid = pid; lastExe = "";
        IntPtr ph = OpenProcess(0x1000, false, pid);
        if (ph != IntPtr.Zero) {
          var sb = new StringBuilder(1024); int n = 1024;
          if (QueryFullProcessImageName(ph, 0, sb, ref n)) lastExe = System.IO.Path.GetFileName(sb.ToString()).ToLowerInvariant();
          CloseHandle(ph);
        }
      }
      var cls = new StringBuilder(256); GetClassName(h, cls, 256);
      string c = cls.ToString();
      RECT r; GetWindowRect(h, out r);
      var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(mi);
      GetMonitorInfo(MonitorFromWindow(h, 2), ref mi);
      bool shell = c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Windows.UI.Core.CoreWindow";
      bool full = !shell && !IsZoomed(h) && r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
      bool top = !shell && r.T <= mi.rcWork.T + 4 && (r.R - r.L) >= (mi.rcWork.R - mi.rcWork.L) / 2;
      int q; SHQueryUserNotificationState(out q);
      return lastExe + "|" + (full ? 1 : 0) + "|" + (top ? 1 : 0) + "|" + q + "|" + mi.rcMonitor.L + "," + mi.rcMonitor.T;
    }

    static bool Active(RegistryKey k, out long start) {
      start = 0; if (k == null) return false;
      object st = k.GetValue("LastUsedTimeStart"), sp = k.GetValue("LastUsedTimeStop");
      if (st == null || sp == null) return false;
      start = Convert.ToInt64(st);
      return Convert.ToInt64(sp) == 0 && start > 0;
    }
    // Apps currently using the webcam/microphone: "name:startUnixMs|..."
    public static string InUse(string cap) {
      var list = new List<string>();
      using (var b = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\" + cap)) {
        if (b == null) return "";
        foreach (var n in b.GetSubKeyNames()) {
          using (var k = b.OpenSubKey(n)) {
            if (k == null) continue;
            long st;
            if (n == "NonPackaged") {
              foreach (var m in k.GetSubKeyNames()) using (var s = k.OpenSubKey(m)) {
                if (Active(s, out st)) { var p = m.Split('#'); list.Add(p[p.Length - 1].ToLowerInvariant() + ":" + ((st - 116444736000000000L) / 10000)); }
              }
            } else if (Active(k, out st)) list.Add(n.ToLowerInvariant() + ":" + ((st - 116444736000000000L) / 10000));
          }
        }
      }
      return string.Join("|", list);
    }

    // ---- window focusing (for "Open" buttons)
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern void keybd_event(byte v, byte s, uint f, UIntPtr e);
    static string ExeOf(uint pid) {
      IntPtr ph = OpenProcess(0x1000, false, pid); if (ph == IntPtr.Zero) return "";
      var sb = new StringBuilder(1024); int n = 1024; string r = "";
      if (QueryFullProcessImageName(ph, 0, sb, ref n)) r = System.IO.Path.GetFileName(sb.ToString()).ToLowerInvariant();
      CloseHandle(ph); return r;
    }
    public static IntPtr FindWin(string exe, string title) {
      IntPtr best = IntPtr.Zero; IntPtr any = IntPtr.Zero;
      var cache = new Dictionary<uint, string>();
      EnumWindows((h, l) => {
        if (!IsWindowVisible(h)) return true;
        var t = new StringBuilder(512); GetWindowText(h, t, 512); if (t.Length == 0) return true;
        uint pid; GetWindowThreadProcessId(h, out pid);
        string e; if (!cache.TryGetValue(pid, out e)) { e = ExeOf(pid); cache[pid] = e; }
        if (e != exe) return true;
        if (any == IntPtr.Zero) any = h;
        if (!string.IsNullOrEmpty(title) && t.ToString().IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0) { best = h; return false; }
        return true;
      }, IntPtr.Zero);
      return best != IntPtr.Zero ? best : any;
    }
    public static bool Focus(string exe, string title) {
      IntPtr h = FindWin(exe, title); if (h == IntPtr.Zero) return false;
      if (IsIconic(h)) ShowWindow(h, 9);
      keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); // ALT tap lifts the foreground lock
      return SetForegroundWindow(h);
    }
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    // Give keyboard focus to one of our own windows (the island input fields).
    public static bool FocusHwnd(long hwnd) {
      IntPtr h = new IntPtr(hwnd);
      IntPtr fg = GetForegroundWindow();
      if (fg == h) return true;
      uint pid; uint ft = GetWindowThreadProcessId(fg, out pid); uint ct = GetCurrentThreadId();
      bool att = ft != ct && AttachThreadInput(ct, ft, true);
      keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
      BringWindowToTop(h);
      bool r = SetForegroundWindow(h);
      if (att) AttachThreadInput(ct, ft, false);
      return r;
    }
  }
}
'@

function Send($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 5)); [Console]::Out.Flush() }

# ---- WinRT media session (SMTC) ----
$mgr = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
  $script:asStream = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
  function Await($op, [Type]$t) { $task = $script:asTask.MakeGenericMethod($t).Invoke($null, @($op)); if ($task.Wait(2500)) { $task.Result } else { $null } }
  $MT = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $mgr = Await ($MT::RequestAsync()) $MT
} catch { Send @{ t = 'log'; m = "media init failed: $_" } }

$script:mKey = ''; $script:mStatus = -1; $script:mPos = -1; $script:mAt = [DateTime]::UtcNow; $script:session = $null

function Pick-Session {
  if (-not $mgr) { return $null }
  $best = $null
  foreach ($s in $mgr.GetSessions()) { if ($s.GetPlaybackInfo().PlaybackStatus -eq 4) { return $s }; if (-not $best) { $best = $s } }
  $cur = $mgr.GetCurrentSession(); if ($cur) { return $cur }
  return $best
}

function Get-Art($props) {
  try {
    $ref = $props.Thumbnail; if (-not $ref) { return $null }
    $st = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $st) { return $null }
    # PowerShell can't call the projected stream methods directly, so convert through reflection.
    $ns = $script:asStream.Invoke($null, @($st))
    $ms = New-Object IO.MemoryStream; $ns.CopyTo($ms); $ns.Dispose()
    if ($ms.Length -le 0 -or $ms.Length -gt 4000000) { return $null }
    $bytes = $ms.ToArray()
    $ct = if ($bytes[0] -eq 0x89) { 'image/png' } else { 'image/jpeg' }
    return "data:$ct;base64," + [Convert]::ToBase64String($bytes)
  } catch { return $null }
}

function Poll-Media([bool]$force) {
  $s = Pick-Session; $script:session = $s
  if (-not $s) {
    if ($script:mKey -ne '') { $script:mKey = ''; Send @{ t = 'media'; none = $true } }
    return
  }
  $info = $s.GetPlaybackInfo(); $status = [int]$info.PlaybackStatus
  $tl = $s.GetTimelineProperties()
  $pos = $tl.Position.TotalSeconds; $dur = $tl.EndTime.TotalSeconds
  if ($status -eq 4 -and $tl.LastUpdatedTime.Year -gt 2000) { $pos += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalSeconds }
  $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  if (-not $props) { return }
  $key = "$($s.SourceAppUserModelId)|$($props.Title)|$($props.Artist)"
  $now = [DateTime]::UtcNow
  $expected = $script:mPos + $(if ($script:mStatus -eq 4) { ($now - $script:mAt).TotalSeconds } else { 0 })
  $changed = $force -or $key -ne $script:mKey -or $status -ne $script:mStatus -or [Math]::Abs($pos - $expected) -gt 2.5
  if (-not $changed) { return }
  $msg = @{ t = 'media'; app = $s.SourceAppUserModelId; title = $props.Title; artist = $props.Artist; album = $props.AlbumTitle; status = $status; pos = [Math]::Round($pos, 2); dur = [Math]::Round($dur, 2) }
  if ($key -ne $script:mKey -or $force) { $msg.art = Get-Art $props; $msg.newTrack = $true }
  $script:mKey = $key; $script:mStatus = $status; $script:mPos = $pos; $script:mAt = $now
  Send $msg
}

function Media-Cmd($a, $v) {
  $s = $script:session; if (-not $s) { $s = Pick-Session }; if (-not $s) { return }
  switch ($a) {
    'toggle' { Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
    'play' { Await ($s.TryPlayAsync()) ([bool]) | Out-Null }
    'pause' { Await ($s.TryPauseAsync()) ([bool]) | Out-Null }
    'next' { Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null }
    'prev' { Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null }
    'seek' { Await ($s.TryChangePlaybackPositionAsync([long]([double]$v * 10000000))) ([bool]) | Out-Null }
  }
  Start-Sleep -Milliseconds 150
  Poll-Media $false
}

# PnP queries are slow (seconds), so they run on a background runspace and are collected later.
$script:bgJobs = @()
function Start-Bg($kind, [string]$script, $arg) {
  $ps = [PowerShell]::Create().AddScript($script)
  if ($arg -ne $null) { $ps = $ps.AddArgument($arg) }
  $script:bgJobs += @{ kind = $kind; ps = $ps; h = $ps.BeginInvoke() }
}
function Collect-Bg {
  if ($script:bgJobs.Count -eq 0) { return }
  $keep = @()
  foreach ($j in $script:bgJobs) {
    if ($j.h.IsCompleted) {
      $r = $null; try { $r = $j.ps.EndInvoke($j.h) } catch {}
      $j.ps.Dispose()
      Send @{ t = $j.kind; data = @($r | ForEach-Object { $_ }) }
    } else { $keep += $j }
  }
  $script:bgJobs = $keep
}
$btScript = @'
$ErrorActionPreference = 'SilentlyContinue'
Get-PnpDevice -Class Bluetooth -PresentOnly | Where-Object { $_.Status -eq 'OK' } | ForEach-Object {
  $bat = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2').Data
  if ($bat -ne $null) {
    $conn = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName '{83DA6326-97A6-4088-9453-A1923F573B29} 15').Data
    @{ name = $_.FriendlyName; battery = [int]$bat; connected = [bool]$conn }
  }
}
'@
function Get-Bluetooth { Start-Bg 'bt' $btScript }

# UI Automation driver for apps without an API (Copilot app). Runs off the main loop.
$uiaScript = @'
param($req)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  $AE = [System.Windows.Automation.AutomationElement]
  $exe = [IO.Path]::GetFileNameWithoutExtension($req.exe)
  $wins = @(Get-Process -Name $exe -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
  if (-not $wins.Count) { return @{ ok = $false; error = 'app window not found' } }
  $root = $AE::FromHandle($wins[0].MainWindowHandle)
  $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $CT = [System.Windows.Automation.ControlType]
  function Click($el) {
    $p = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) { $p.Invoke(); return $true }
    if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) { $p.Select(); return $true }
    if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) { $p.Toggle(); return $true }
    return $false
  }
  $clickable = @($all | Where-Object { $t = $_.Current.ControlType; ($t -eq $CT::Button -or $t -eq $CT::ListItem -or $t -eq $CT::RadioButton -or $t -eq $CT::MenuItem -or $t -eq $CT::Hyperlink) -and $_.Current.IsEnabled -and -not $_.Current.IsOffscreen })
  # Safety: only act if the question we are answering is the one visible in the app.
  if ($req.question) {
    $q = ([string]$req.question).Substring(0, [Math]::Min(40, ([string]$req.question).Length)).TrimEnd('…')
    $shown = $all | Where-Object { $_.Current.Name -and $_.Current.Name.Contains($q) } | Select-Object -First 1
    if (-not $shown) { return @{ ok = $false; error = 'question not visible' } }
  }
  # Choice buttons are labelled "A. <choice>", "B. <choice>"...
  $strip = { param($n) ($n -replace '^[A-Z]\.\s+', '').Trim() }
  $names = switch ($req.action) {
    'allow' { @('Allow', 'Allow once', 'Approve', 'Yes', 'Run', 'Accept', 'Continue', 'Izinkan', 'Setujui') }
    'deny' { @('Deny', 'Reject', 'No', 'Skip', 'Decline', 'Tolak', 'Lewati') }
    'choice' { @([string]$req.value) }
    default { @() }
  }
  foreach ($n in $names) {
    $m = $clickable | Where-Object { (& $strip $_.Current.Name) -ieq $n } | Select-Object -Last 1
    if (-not $m) { $m = $clickable | Where-Object { $_.Current.Name -and (& $strip $_.Current.Name).StartsWith($n, [StringComparison]::OrdinalIgnoreCase) } | Select-Object -Last 1 }
    if ($m -and (Click $m)) { return @{ ok = $true; clicked = $m.Current.Name } }
  }
  if ($req.action -eq 'reply' -or $req.action -eq 'choice') {
    $edits = @($all | Where-Object { ($_.Current.ControlType -eq $CT::Edit -or $_.Current.ControlType -eq $CT::Document) -and $_.Current.IsEnabled -and $_.Current.IsKeyboardFocusable -and -not $_.Current.IsOffscreen })
    # Prefer the free-form answer box of a pending question, else the message box.
    $ed = $edits | Where-Object { $_.Current.Name -match 'answer|jawab' } | Select-Object -Last 1
    if (-not $ed) { $ed = $edits | Where-Object { $_.Current.Name -match '^(Message|Pesan)' } | Select-Object -Last 1 }
    if (-not $ed) { $ed = $edits | Select-Object -Last 1 }
    if ($ed) {
      $vp = $null
      if ($ed.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
        $vp.SetValue([string]$req.value)
        $send = $clickable | Where-Object { $_.Current.Name -match '^(Send|Submit|Kirim)' } | Select-Object -Last 1
        if ($send -and (Click $send)) { return @{ ok = $true; typed = $true } }
        $ed.SetFocus(); Start-Sleep -Milliseconds 120
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        return @{ ok = $true; typed = $true }
      }
    }
  }
  return @{ ok = $false; error = 'not found' }
} catch { return @{ ok = $false; error = "$_" } }
'@

function Handle($line) {
  try { $m = $line | ConvertFrom-Json } catch { return }
  switch ($m.c) {
    'media' { Media-Cmd $m.a $m.v }
    'mediaRefresh' { Poll-Media $true }
    'vol' { [RAH.Audio]::SetVolume([float]$m.v) }
    'mute' { [RAH.Audio]::SetMute([bool]$m.v) }
    'mics' { $n = [RAH.Audio]::SetAllMics([bool]$m.v); Send @{ t = 'mics'; muted = [RAH.Audio]::MicsMuted(); count = $n } }
    'micsState' { Send @{ t = 'mics'; muted = [RAH.Audio]::MicsMuted() } }
    'netcat' {
      $p = Get-NetConnectionProfile | Select-Object -First 1
      Send @{ t = 'netcat'; name = "$($p.Name)"; category = "$($p.NetworkCategory)" }
    }
    'bt' { Get-Bluetooth }
    'uia' { Start-Bg 'uia' $uiaScript @{ exe = $m.exe; action = $m.a; value = $m.v; question = $m.q } }
    'focus' { Send @{ t = 'focus'; rid = $m.rid; ok = [RAH.Win]::Focus([string]$m.exe, [string]$m.title) } }
    'focusHwnd' { $ok = [RAH.Win]::FocusHwnd([long]$m.h); Send @{ t = 'focusAck'; ok = $ok; h = $m.h } }
    'exit' { exit 0 }
  }
}

# Brightness changes are event-driven (no polling).
try { Register-CimIndicationEvent -Namespace root/wmi -ClassName WmiMonitorBrightnessEvent -SourceIdentifier bri | Out-Null } catch {}

$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), (New-Object System.Text.UTF8Encoding($false)))
$read = $stdin.ReadLineAsync()
$tick = 0
$last = @{ caps = $null; vol = ''; fg = ''; cam = $null; mic = $null; clip = $null; fgExe = '' }
Send @{ t = 'ready' }
Poll-Media $true

while ($true) {
  while ($read.IsCompleted) {
    $line = $read.Result
    if ($line -eq $null) { exit 0 }
    Handle $line
    $read = $stdin.ReadLineAsync()
  }
  $caps = [RAH.Win]::Caps()
  if ($caps -ne $last.caps) { if ($last.caps -ne $null) { Send @{ t = 'caps'; on = $caps } }; $last.caps = $caps }
  if ($tick % 2 -eq 0) {
    $v = [RAH.Audio]::State()
    if ($v -ne $last.vol) { $p = $v.Split('|'); Send @{ t = 'vol'; v = [double]$p[0]; muted = ($p[1] -eq '1') }; $last.vol = $v }
  }
  if ($tick % 3 -eq 1) {
    $cs = [RAH.Win]::ClipSeq()
    if ($cs -ne $last.clip) { if ($last.clip -ne $null) { Send @{ t = 'clip'; seq = $cs; fg = $last.fgExe } }; $last.clip = $cs }
  }
  if ($tick % 3 -eq 0) {
    $f = [RAH.Win]::Foreground()
    if ($f -ne $last.fg) { $p = $f.Split('|'); $last.fgExe = $p[0]; Send @{ t = 'fg'; exe = $p[0]; full = ($p[1] -eq '1'); top = ($p[2] -eq '1'); qns = [int]$p[3]; mon = $p[4] }; $last.fg = $f }
  }
  if ($tick % 5 -eq 0) { Poll-Media $false }
  if ($tick % 8 -eq 0) {
    $cam = [RAH.Win]::InUse('webcam'); $mic = [RAH.Win]::InUse('microphone')
    if ($cam -ne $last.cam -or $mic -ne $last.mic) { Send @{ t = 'privacy'; cam = $cam; mic = $mic }; $last.cam = $cam; $last.mic = $mic }
  }
  if ($tick % 5 -eq 2) { Collect-Bg }
  foreach ($e in @(Get-Event -SourceIdentifier bri -ErrorAction SilentlyContinue)) {
    Send @{ t = 'bri'; v = [int]$e.SourceEventArgs.NewEvent.Brightness }
    Remove-Event -EventIdentifier $e.EventIdentifier
  }
  $tick++
  Start-Sleep -Milliseconds 200
}
