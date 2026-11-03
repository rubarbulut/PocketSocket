param([Parameter(Mandatory=$true)][string]$Manifest)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$m = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Manifest)) | ConvertFrom-Json
if ($m.coreHash -notmatch '^[a-f0-9]{64}$' -or [int]$m.parentPid -lt 1) { exit 70 }
$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 71 }
$base = Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'PocketSocket'
if ((Test-Path -LiteralPath $base) -and ((Get-Item -LiteralPath $base).Attributes -band [IO.FileAttributes]::ReparsePoint)) { exit 72 }
[void][IO.Directory]::CreateDirectory($base)
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$administrators = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
$system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$acl.SetOwner($administrators)
foreach ($sid in @($administrators,$system)) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $base -AclObject $acl
$root = Join-Path $base ([Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$core = $null
try {
  $binary = Join-Path $root 'mihomo.exe'
  Copy-Item -LiteralPath $m.core -Destination $binary
  Copy-Item -LiteralPath $m.config -Destination (Join-Path $root 'config.json')
  if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $m.coreHash) { exit 73 }
  function Test-Lease {
    try {
      $parent = Get-Process -Id ([int]$m.parentPid) -ErrorAction Stop
      if ($parent.StartTime.ToUniversalTime().Ticks.ToString() -ne $m.parentStart) { return $false }
      $lease = Get-Item -LiteralPath $m.lease -ErrorAction Stop
      return (([DateTime]::UtcNow - $lease.LastWriteTimeUtc).TotalSeconds -le 15)
    } catch { return $false }
  }
  if (-not (Test-Lease)) { exit 0 }
  # Root is generated internally, so the quoted arguments contain no imported profile text.
  $arguments = '-d "' + $root + '" -f "' + (Join-Path $root 'config.json') + '"'
  $core = Start-Process -FilePath $binary -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'stdout.log') -RedirectStandardError (Join-Path $root 'stderr.log')
  while (-not $core.HasExited -and (Test-Lease)) { Start-Sleep -Seconds 2; $core.Refresh() }
} finally {
  # A GUI crash cannot send the normal disconnect request. Release TUN/DNS here too.
  if ($core -and -not $core.HasExited) {
    try {
      $configuration = Get-Content -Raw -LiteralPath (Join-Path $root 'config.json') | ConvertFrom-Json
      $controller = $configuration.'external-controller'
      if ($controller -match '^127\.0\.0\.1:[0-9]{1,5}$' -and $configuration.secret -match '^[a-f0-9]{64}$') {
        Invoke-WebRequest -UseBasicParsing -Method Patch -Uri ('http://' + $controller + '/configs') -Headers @{ Authorization = ('Bearer ' + $configuration.secret) } -ContentType 'application/json' -Body '{"tun":{"enable":false}}' -TimeoutSec 3 | Out-Null
      }
    } catch { }
  }
  # Stop only the process object created by this session; never terminate other VPNs.
  if ($core -and -not $core.HasExited) { $core.Kill(); $core.WaitForExit(10000) | Out-Null }
  $absolute = [IO.Path]::GetFullPath($root)
  $expected = [IO.Path]::GetFullPath($base) + [IO.Path]::DirectorySeparatorChar
  if ($absolute.StartsWith($expected,[StringComparison]::OrdinalIgnoreCase) -and ([IO.Path]::GetFileName($absolute) -match '^[a-f0-9]{32}$')) {
    Remove-Item -LiteralPath $absolute -Recurse -Force -ErrorAction SilentlyContinue
  }
}
