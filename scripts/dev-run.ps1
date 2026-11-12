# Dev helper: restart RA Assistant with logs in %TEMP%\ra_out.txt / ra_err.txt
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $env:TEMP 'ra_pid.txt'
if (Test-Path $pidFile) {
  $old = Get-Content $pidFile
  if ($old) { Stop-Process -Id ([int]$old) -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 800 }
}
$env:RA_DEBUG = '1'
$p = Start-Process -FilePath (Join-Path $root 'node_modules\electron\dist\electron.exe') -ArgumentList ('"' + $root + '"') `
  -RedirectStandardError (Join-Path $env:TEMP 'ra_err.txt') -RedirectStandardOutput (Join-Path $env:TEMP 'ra_out.txt') -PassThru
$p.Id | Set-Content $pidFile
"started $($p.Id)"
