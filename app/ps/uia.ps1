# One-shot UI Automation driver (Copilot app has no API). Spawned on demand so the long-running
# helper never loads the UIA assemblies. Reads one JSON request from stdin, prints one JSON line.
$json = [Console]::In.ReadToEnd()
$r = & {
$req = $json | ConvertFrom-Json
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
}
[Console]::Out.WriteLine(($r | ConvertTo-Json -Compress))
