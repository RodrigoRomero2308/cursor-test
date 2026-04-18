#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Ajustes agresivos de Windows 11 orientados a rendimiento (Dota 2 / Steam).
.DESCRIPTION
  Modifica servicios, registro y perfiles de energía. Los cambios PERSISTEN tras reiniciar.
  Siempre que uses -Apply se crea una copia de seguridad en ProgramData para poder revertir con -Restore.

  Uso típico:
    .\Win11-DotaAggressiveTune.ps1 -Tier Nuclear -WhatIf
    .\Win11-DotaAggressiveTune.ps1 -Apply -Tier Nuclear
    .\Win11-DotaAggressiveTune.ps1 -Restore -BackupPath 'C:\ProgramData\Win11GameTune\backups\...json'

  O restaurar el último backup:
    .\Win11-DotaAggressiveTune.ps1 -RestoreLatest

.NOTES
  No desactiva antivirus. Opciones como -DisableWindowsUpdate implican riesgo de seguridad explícito.
#>
[CmdletBinding(SupportsShouldProcess = $true, DefaultParameterSetName = 'Apply')]
param(
  [ValidateSet('Standard', 'Aggressive', 'Nuclear')]
  [string]$Tier = 'Aggressive',

  [Parameter(ParameterSetName = 'Apply')]
  [switch]$Apply,

  [Parameter(ParameterSetName = 'Restore')]
  [switch]$Restore,

  [Parameter(ParameterSetName = 'Restore')]
  [string]$BackupPath,

  [Parameter(ParameterSetName = 'RestoreLatest')]
  [switch]$RestoreLatest,

  [Parameter(ParameterSetName = 'Apply')]
  [switch]$DisableWindowsUpdate,

  [Parameter(ParameterSetName = 'Apply')]
  [switch]$AlsoDisablePrintSpooler,

  [Parameter(ParameterSetName = 'Apply')]
  [switch]$IUnderstandSecurityRisk
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:DataRoot = Join-Path $env:ProgramData 'Win11GameTune'
$script:BackupRoot = Join-Path $script:DataRoot 'backups'

function Write-Banner {
  param([string]$Text)
  Write-Host "`n=== $Text ===" -ForegroundColor Cyan
}

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-Directories {
  if (-not (Test-Path $script:DataRoot)) { New-Item -ItemType Directory -Path $script:DataRoot -Force | Out-Null }
  if (-not (Test-Path $script:BackupRoot)) { New-Item -ItemType Directory -Path $script:BackupRoot -Force | Out-Null }
}

function Get-ServiceConfig {
  param([string]$Name)
  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $svc) { return $null }
  $w32 = Get-CimInstance -ClassName Win32_Service -Filter "Name='$Name'" -ErrorAction SilentlyContinue
  return [ordered]@{
    Name         = $Name
    StartType    = [string]$w32.StartMode
    State        = [string]$svc.Status
  }
}

function Set-ServiceConfig {
  param(
    [string]$Name,
    [ValidateSet('Running', 'Stopped')]
    [string]$DesiredState,
    [ValidateSet('Automatic', 'Manual', 'Disabled')]
    [string]$StartupType
  )
  if ($PSCmdlet.ShouldProcess($Name, "Servicio -> $StartupType / $DesiredState")) {
    sc.exe config $Name start= $(switch ($StartupType) {
        'Automatic' { 'auto' }
        'Manual' { 'demand' }
        'Disabled' { 'disabled' }
      }) | Out-Null
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($DesiredState -eq 'Stopped' -and $svc -and $svc.Status -ne 'Stopped') {
      Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
    }
    elseif ($DesiredState -eq 'Running' -and $svc -and $svc.Status -ne 'Running') {
      Start-Service -Name $Name -ErrorAction SilentlyContinue
    }
  }
}

function Read-RegistryValueBackup {
  param([string]$Path, [string]$Name)
  if (-not (Test-Path $Path)) { return $null }
  $item = Get-Item -LiteralPath $Path
  $propNames = $item.Property
  if ($propNames -notcontains $Name) { return $null }
  $kind = $item.GetValueKind($Name)
  $val = $item.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  return [ordered]@{ Kind = [string]$kind; Value = $val }
}

function Set-RegistryDWord {
  param([string]$Path, [string]$Name, [object]$Value)
  if ($PSCmdlet.ShouldProcess("$Path\$Name", "DWord = $Value")) {
    if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }
    Set-ItemProperty -Path $Path -Name $Name -Value $Value -Type DWord -Force
  }
}

function Set-RegistryString {
  param([string]$Path, [string]$Name, [string]$Value)
  if ($PSCmdlet.ShouldProcess("$Path\$Name", "String = $Value")) {
    if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }
    Set-ItemProperty -Path $Path -Name $Name -Value $Value -Type String -Force
  }
}

function Remove-RegistryValueIfPresent {
  param([string]$Path, [string]$Name)
  if (-not (Test-Path $Path)) { return }
  if ($PSCmdlet.ShouldProcess("$Path\$Name", 'Eliminar valor')) {
    Remove-ItemProperty -Path $Path -Name $Name -ErrorAction SilentlyContinue
  }
}

function Invoke-PowerCfgLine {
  param([string[]]$Args)
  if ($PSCmdlet.ShouldProcess(('powercfg ' + ($Args -join ' ')), 'Ejecutar')) {
    & powercfg @Args | Out-Null
  }
}

function Set-HighPerformancePowerPlan {
  if (-not ($PSCmdlet.ShouldProcess('powercfg', 'Activar plan Alto rendimiento'))) { return }
  $list = & powercfg /list 2>$null
  if ($LASTEXITCODE -ne 0) { return }
  $highGuid = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
  if ($list -match $highGuid) {
    & powercfg /setactive $highGuid | Out-Null
    return
  }
  & powercfg /duplicatescheme $highGuid | Out-Null
  $list2 = & powercfg /list
  if ($list2 -match '\(([a-f0-9\-]{36})\)\s*\*?\s*Alto rendimiento') {
    & powercfg /setactive $Matches[1] | Out-Null
  }
}

function New-TweakBackup {
  param(
    [hashtable]$ServiceSnapshot,
    [object[]]$RegistrySnapshot
  )
  Ensure-Directories
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $obj = [ordered]@{
    Version   = 1
    CreatedUtc = (Get-Date).ToUniversalTime().ToString('o')
    Tier       = $Tier
    Services   = $ServiceSnapshot
    Registry   = $RegistrySnapshot
  }
  $path = Join-Path $script:BackupRoot "backup-$stamp.json"
  $obj | ConvertTo-Json -Depth 8 | Set-Content -Path $path -Encoding UTF8
  return $path
}

function Get-LatestBackupPath {
  Ensure-Directories
  $files = Get-ChildItem -Path $script:BackupRoot -Filter 'backup-*.json' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  if (-not $files) { throw "No hay archivos de copia en $($script:BackupRoot)." }
  return $files[0].FullName
}

function Restore-FromBackupObject {
  param([psobject]$data)

  Write-Banner 'Restaurando servicios'
  if (-not $data.Services) {
    Write-Host '(Sin servicios en la copia.)' -ForegroundColor DarkGray
  }
  foreach ($entry in $data.Services.PSObject.Properties) {
    $name = $entry.Name
    $cfg = $entry.Value
    if (-not $cfg) { continue }
    $start = $cfg.StartType
    $state = $cfg.State
    if ($PSCmdlet.ShouldProcess($name, "Restaurar servicio ($start, $state)")) {
      sc.exe config $name start= $(switch ($start) {
          'Auto' { 'auto' }
          'Manual' { 'demand' }
          'Disabled' { 'disabled' }
          default {
            if ($start -match 'auto') { 'auto' }
            elseif ($start -match 'demand|manual') { 'demand' }
            else { 'auto' }
          }
        }) | Out-Null
      if ($state -eq 'Running') {
        Start-Service -Name $name -ErrorAction SilentlyContinue
      }
      else {
        Stop-Service -Name $name -Force -ErrorAction SilentlyContinue
      }
    }
  }

  Write-Banner 'Restaurando registro'
  foreach ($r in $data.Registry) {
    $path = $r.Path
    $n = $r.Name
    if ($PSCmdlet.ShouldProcess("$path\$n", 'Restaurar valor')) {
      $existedBefore = $false
      if ($r.PSObject.Properties.Match('ExistsBefore').Count -gt 0) {
        $existedBefore = [bool]$r.ExistsBefore
      }
      elseif ($r.PSObject.Properties.Match('Exists').Count -gt 0) {
        $existedBefore = [bool]$r.Exists
      }

      if (-not $existedBefore) {
        Remove-ItemProperty -LiteralPath $path -Name $n -ErrorAction SilentlyContinue
        continue
      }

      if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }

      $pk = $null
      if ($r.PSObject.Properties.Match('PrevKind').Count -gt 0) { $pk = [string]$r.PrevKind }
      if (-not $pk -and $r.PSObject.Properties.Match('Kind').Count -gt 0) { $pk = [string]$r.Kind }

      $pv = $null
      if ($r.PSObject.Properties.Match('PrevValue').Count -gt 0) { $pv = $r.PrevValue }
      elseif ($r.PSObject.Properties.Match('Value').Count -gt 0) { $pv = $r.Value }

      if ($null -eq $pv) {
        Remove-ItemProperty -LiteralPath $path -Name $n -ErrorAction SilentlyContinue
        continue
      }

      switch ($pk) {
        'DWord' { Set-ItemProperty -LiteralPath $path -Name $n -Value ([int]$pv) -Type DWord -Force }
        'QWord' { Set-ItemProperty -LiteralPath $path -Name $n -Value ([long]$pv) -Type QWord -Force }
        'String' { Set-ItemProperty -LiteralPath $path -Name $n -Value ([string]$pv) -Type String -Force }
        'ExpandString' { Set-ItemProperty -LiteralPath $path -Name $n -Value ([string]$pv) -Type ExpandString -Force }
        default { Set-ItemProperty -LiteralPath $path -Name $n -Value $pv -Force }
      }
    }
  }

  Write-Host "`nRestauracion terminada. Reinicia Windows si algo del escritorio sigue raro." -ForegroundColor Green
}

# --- Restore mode ---
if ($RestoreLatest -or $Restore) {
  if (-not (Test-IsAdmin)) { throw 'Ejecuta PowerShell como administrador para restaurar.' }
  if ($RestoreLatest -and -not $BackupPath) { $BackupPath = Get-LatestBackupPath }
  if (-not $BackupPath) { throw 'Indica -BackupPath o usa -RestoreLatest.' }
  if (-not (Test-Path $BackupPath)) { throw "No existe el archivo: $BackupPath" }
  $raw = Get-Content -Path $BackupPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Restore-FromBackupObject -data $raw
  exit 0
}

if (-not (Test-IsAdmin)) {
  throw 'Ejecuta PowerShell como administrador. Click derecho > Ejecutar como administrador.'
}

if (-not $Apply -and -not $WhatIfPreference) {
  Write-Host @'

Modo simulacion: ejecuta con -WhatIf (sin -Apply) para ver acciones sin aplicar.
Ejemplos:
  .\Win11-DotaAggressiveTune.ps1 -Tier Nuclear -WhatIf
  .\Win11-DotaAggressiveTune.ps1 -Apply -Tier Nuclear
  .\Win11-DotaAggressiveTune.ps1 -RestoreLatest

IMPORTANTE: un reinicio NO deshace estos cambios. Usa -RestoreLatest o -Restore -BackupPath ...
'@
  exit 1
}

if ($DisableWindowsUpdate -and -not $IUnderstandSecurityRisk) {
  throw 'Para -DisableWindowsUpdate debes pasar tambien -IUnderstandSecurityRisk (riesgo de seguridad y compatibilidad).'
}

$commonServices = @(
  @{ Name = 'SysMain'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'WSearch'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'DiagTrack'; Startup = 'Disabled'; State = 'Stopped' }
)

$aggressiveServices = @(
  @{ Name = 'MapsBroker'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'lfsvc'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'PimIndexMaintenanceSvc'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'BcastDVRUserService'; Startup = 'Disabled'; State = 'Stopped' } # depende de SKU; puede fallar silenciosamente
)

$nuclearServices = @(
  @{ Name = 'XblAuthManager'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'XblGameSave'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'XboxNetApiSvc'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'XboxGipSvc'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'RemoteRegistry'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'RetailDemo'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'WerSvc'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'wisvc'; Startup = 'Disabled'; State = 'Stopped' }
)

$printSpooler = @(
  @{ Name = 'Spooler'; Startup = 'Disabled'; State = 'Stopped' }
)

$wuauserv = @(
  @{ Name = 'wuauserv'; Startup = 'Disabled'; State = 'Stopped' }
  @{ Name = 'UsoSvc'; Startup = 'Disabled'; State = 'Stopped' }
)

$targets = @()
switch ($Tier) {
  'Standard' { $targets += $commonServices }
  'Aggressive' { $targets += $commonServices + $aggressiveServices }
  'Nuclear' {
    $targets += $commonServices + $aggressiveServices + $nuclearServices
    if ($AlsoDisablePrintSpooler) { $targets += $printSpooler }
    if ($DisableWindowsUpdate) { $targets += $wuauserv }
  }
}

# Standard tier still applies energy + registry; only service list grows with tier
$serviceSnapshot = [ordered]@{}
foreach ($t in $targets) {
  $n = $t.Name
  $existing = Get-ServiceConfig -Name $n
  if ($existing) {
    $serviceSnapshot[$n] = $existing
  }
}

$registryOps = @(
  @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR'; Name = 'AppCaptureEnabled'; Kind = 'DWord'; Value = 0 }
  @{ Path = 'HKCU:\System\GameConfigStore'; Name = 'GameDVR_Enabled'; Kind = 'DWord'; Value = 0 }
  @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\GameDVR'; Name = 'AllowGameDVR'; Kind = 'DWord'; Value = 0 }
  @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects'; Name = 'VisualFXSetting'; Kind = 'DWord'; Value = 2 }
  @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'; Name = 'EnableTransparency'; Kind = 'DWord'; Value = 0 }
  @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; Name = 'SubscribedContent-338387Enabled'; Kind = 'DWord'; Value = 0 }
  @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; Name = 'SubscribedContent-338388Enabled'; Kind = 'DWord'; Value = 0 }
  @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'; Name = 'RotatingLockScreenEnabled'; Kind = 'DWord'; Value = 0 }
  @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications'; Name = 'ToastEnabled'; Kind = 'DWord'; Value = 0 }
)

if ($Tier -in @('Aggressive', 'Nuclear')) {
  $registryOps += @(
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games'; Name = 'GPU Priority'; Kind = 'DWord'; Value = 8 }
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games'; Name = 'Priority'; Kind = 'DWord'; Value = 6 }
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games'; Name = 'Scheduling Category'; Kind = 'String'; Value = 'High' }
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'; Name = 'NetworkThrottlingIndex'; Kind = 'DWord'; Value = 0xFFFFFFFF }
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'; Name = 'SystemResponsiveness'; Kind = 'DWord'; Value = 0 }
  )
}

if ($Tier -eq 'Nuclear') {
  $registryOps += @(
    @{ Path = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters'; Name = 'TcpAckFrequency'; Kind = 'DWord'; Value = 1 }
    @{ Path = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters'; Name = 'TCPNoDelay'; Kind = 'DWord'; Value = 1 }
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'; Name = 'NoLazyMode'; Kind = 'DWord'; Value = 1 }
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'; Name = 'AlwaysOn'; Kind = 'DWord'; Value = 1 }
  )
}

$registrySnapshot = @()
foreach ($op in $registryOps) {
  $path = $op.Path
  $name = $op.Name
  $rb = Read-RegistryValueBackup -Path $path -Name $name
  $existsBefore = $null -ne $rb
  $registrySnapshot += [ordered]@{
    Path         = $path
    Name         = $name
    ExistsBefore = $existsBefore
    PrevKind     = $(if ($existsBefore) { $rb.Kind } else { $null })
    PrevValue    = $(if ($existsBefore) { $rb.Value } else { $null })
  }
}

if ($Apply -or $WhatIfPreference) {
  if ($Apply) {
    $backupPath = New-TweakBackup -ServiceSnapshot $serviceSnapshot -RegistrySnapshot $registrySnapshot
    Write-Host "Copia de seguridad creada: $backupPath" -ForegroundColor Green
  }

  Write-Banner 'Energia (menos ahorro, mas latencia estable en CPU/USB/PCIe)'
  Set-HighPerformancePowerPlan
  Invoke-PowerCfgLine @('/change', 'monitor-timeout-ac', '0')
  Invoke-PowerCfgLine @('/change', 'disk-timeout-ac', '0')
  Invoke-PowerCfgLine @('/change', 'standby-timeout-ac', '0')
  Invoke-PowerCfgLine @('/change', 'hibernate-timeout-ac', '0')
  Invoke-PowerCfgLine @('/change', 'processor-minimum', '100')
  Invoke-PowerCfgLine @('/change', 'processor-maximum', '100')
  Invoke-PowerCfgLine @('/setacvalueindex', 'SCHEME_CURRENT', 'SUB_USB', 'USBSELECTIVESUSPEND', '0')
  Invoke-PowerCfgLine @('/setdcvalueindex', 'SCHEME_CURRENT', 'SUB_USB', 'USBSELECTIVESUSPEND', '0')
  Invoke-PowerCfgLine @('/setacvalueindex', 'SCHEME_CURRENT', 'SUB_PCIEXPRESS', 'ASPM', '0')
  Invoke-PowerCfgLine @('/setdcvalueindex', 'SCHEME_CURRENT', 'SUB_PCIEXPRESS', 'ASPM', '0')
  Invoke-PowerCfgLine @('/setactive', 'SCHEME_CURRENT')

  if ($PSCmdlet.ShouldProcess('powercfg', 'Desactivar hibernacion (libera espacio en SSD; no revierte al energia)')) {
    if ($Apply) { powercfg /h off | Out-Null }
  }

  Write-Banner 'Servicios (menos trabajo en segundo plano / disco / red de telemetria)'
  foreach ($t in $targets) {
    $cfg = Get-ServiceConfig -Name $t.Name
    if (-not $cfg) {
      Write-Host "Servicio no encontrado (omitido): $($t.Name)" -ForegroundColor DarkYellow
      continue
    }
    Set-ServiceConfig -Name $t.Name -StartupType $t.Startup -DesiredState $t.State
  }

  Write-Banner 'Registro (GameDVR, efectos visuales, MMCSS, sugerencias, tweaks de red a nivel driver stack)'
  foreach ($op in $registryOps) {
    if ($op.Kind -eq 'String') {
      Set-RegistryString -Path $op.Path -Name $op.Name -Value ([string]$op.Value)
    }
    else {
      Set-RegistryDWord -Path $op.Path -Name $op.Name -Value $op.Value
    }
  }

  Write-Banner 'Red (global): autotuning y chimney (puede no existir en todas las builds)'
  if ($PSCmdlet.ShouldProcess('netsh', 'Ajustes TCP globales')) {
    if ($Apply) {
      netsh int tcp set global autotuninglevel=normal | Out-Null
      netsh int tcp set global chimney=enabled | Out-Null 2>$null
      netsh int tcp set global rss=enabled | Out-Null
    }
  }

  Write-Banner 'Resumen donde suele haber mas FPS / menos stutter'
  Write-Host @'
- Plan de energia + min CPU 100% + sin suspension USB + sin ASPM PCIe: reduce micro-ralladas por estados de ahorro.
- SysMain/WSearch: menos lecturas/indexacion en segundo plano (disco mas libre para shaders/assets de Steam).
- DiagTrack: menos telemetria en segundo plano.
- GameDVR desactivado: menos overhead del sistema de captura.
- MMCSS Games (GPU Priority / Priority / Scheduling): prioriza el perfil multimedia "Games" (impacto variable segun carga del sistema).
- TcpAckFrequency / TCPNoDelay: puede bajar latencia de red en algunos escenarios; en otros no cambia nada. Dota depende mucho de routing y Wi-Fi.
- Desactivar servicios Xbox: ahorra RAM/CPU si no usas app Xbox; no afecta a Dota por Steam en la mayoria de los casos.

Si algo empeora, usa -RestoreLatest con el backup generado al aplicar.
'@ -ForegroundColor Gray
}
