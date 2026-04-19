# Ajustes agresivos de Windows 11 para juegos (Dota 2 / Steam)

Este directorio contiene `Win11-DotaAggressiveTune.ps1`, un script de **PowerShell** para **Windows 11** que aplica cambios de **energía**, **registro** y **servicios** orientados a reducir trabajo en segundo plano y endurecer el perfil de energía mientras jugás.

## Advertencias importantes

- Ejecutalo solo si entendés que puede **cambiar el comportamiento del sistema** (búsqueda, telemetría, Xbox, informes de error, etc.).
- Los cambios **persisten después de reiniciar**. Un reboot **no** revierte nada automáticamente.
- El script **no desactiva antivirus** ni SmartScreen.
- La opción `-DisableWindowsUpdate` implica **riesgo de seguridad y compatibilidad**; solo se aplica si también pasás `-IUnderstandSecurityRisk`.

## Requisitos

- Windows 11.
- PowerShell **como administrador** (el script incluye `#Requires -RunAsAdministrator`).
- Si la política de ejecución bloquea scripts locales, podés usar una sesión puntual:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Flujo recomendado

1. Copiá el archivo `.ps1` a una carpeta fija (por ejemplo `C:\Tools\Win11GameTune\`).
2. Abrí **Terminal** o **PowerShell** como administrador y `cd` a esa carpeta.
3. Simulá con `-WhatIf` (sin `-Apply`).
4. Aplicá con `-Apply` y el tier que elijas.
5. Si algo no te gusta, restaurá con `-RestoreLatest` o con `-Restore -BackupPath`.

## Comandos recomendados

Simulación (no escribe cambios permanentes en servicios/registro; respeta `SupportsShouldProcess`):

```powershell
.\Win11-DotaAggressiveTune.ps1 -Tier Standard -WhatIf
.\Win11-DotaAggressiveTune.ps1 -Tier Aggressive -WhatIf
.\Win11-DotaAggressiveTune.ps1 -Tier Nuclear -WhatIf
```

Aplicar (crea un backup JSON antes de tocar el sistema):

```powershell
.\Win11-DotaAggressiveTune.ps1 -Apply -Tier Standard
.\Win11-DotaAggressiveTune.ps1 -Apply -Tier Aggressive
.\Win11-DotaAggressiveTune.ps1 -Apply -Tier Nuclear
```

Nuclear con opciones extra (solo si realmente las querés):

```powershell
.\Win11-DotaAggressiveTune.ps1 -Apply -Tier Nuclear -AlsoDisablePrintSpooler

.\Win11-DotaAggressiveTune.ps1 -Apply -Tier Nuclear -DisableWindowsUpdate -IUnderstandSecurityRisk
```

Restaurar el estado guardado en el último backup:

```powershell
.\Win11-DotaAggressiveTune.ps1 -RestoreLatest
```

Restaurar un backup concreto:

```powershell
.\Win11-DotaAggressiveTune.ps1 -Restore -BackupPath 'C:\ProgramData\Win11GameTune\backups\backup-20260118-120000.json'
```

Reactivar la hibernación (manual): si se aplicó `powercfg /h off`, el modo restauración **no** la vuelve a encender.

```powershell
powercfg /h on
```

## Dónde se guardan las copias de seguridad

Al usar `-Apply`, el script escribe JSON en:

`C:\ProgramData\Win11GameTune\backups\`

Conservá al menos el backup del día en que aplicaste cambios, por si necesitás revertir en frío.

## Qué hace cada tier (resumen)

| Tier | Servicios extra (además de energía, registro común y red) |
|------|------------------------------------------------------------|
| **Standard** | SysMain, WSearch, DiagTrack |
| **Aggressive** | Standard + MapsBroker, lfsvc, PimIndexMaintenanceSvc, BcastDVRUserService (si existe) |
| **Nuclear** | Aggressive + servicios Xbox/red WER/Remote Registry, etc.; admite `-AlsoDisablePrintSpooler` y `-DisableWindowsUpdate` |

En todos los tiers se aplican ajustes de **plan de energía** (Alto rendimiento cuando es posible), **timeouts**, **CPU mín/máx**, **USB selective suspend**, **ASPM PCIe**, **GameDVR**, efectos visuales y otras claves de `HKCU`/`HKLM` descritas en el propio script. A partir de **Aggressive** se añaden claves **MMCSS** para el perfil `Games`. En **Nuclear** se añaden valores TCP (`TcpAckFrequency`, `TCPNoDelay`) y claves multimedia extra.

## Notas para Dota 2 y Steam

- El mayor impacto en Dota suele venir de **GPU**, **temperaturas**, **driver** y **red estable**; el script ataca sobre todo **competencia del SO** y **política de energía**.
- Probar **Vulkan vs DirectX 11**, resolución y límites de FPS según tu monitor suele rendir más que acumular tweaks de red dudosos.

## Licencia y responsabilidad

Usá este script bajo tu propia responsabilidad. Revisá el código antes de ejecutarlo en una máquina importante.
