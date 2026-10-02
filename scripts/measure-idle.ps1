param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [int]$Minutes = 5,
  [string]$UserDataDir = (Join-Path ([System.IO.Path]::GetTempPath()) ("trophy-locker-idle-" + [guid]::NewGuid().ToString('N')))
)

$ErrorActionPreference = 'Stop'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$exeFull = (Resolve-Path $ExePath).Path
$cores = [Environment]::ProcessorCount
New-Item -ItemType Directory -Force -Path $UserDataDir | Out-Null

function Get-AppProcesses {
  Get-Process | Where-Object { $_.Path -eq $exeFull }
}

$process = Start-Process -FilePath $exeFull -ArgumentList @('--hidden', "--user-data-dir=$UserDataDir") -PassThru
$startTime = $process.StartTime.ToUniversalTime()
$logPath = Join-Path $UserDataDir 'logs\trophy-locker.log'

$readyTime = $null
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline -and $null -eq $readyTime) {
  Start-Sleep -Milliseconds 250
  if (Test-Path $logPath) {
    $line = Get-Content $logPath -ErrorAction SilentlyContinue | Where-Object { $_ -like '*Ready in the tray*' } | Select-Object -First 1
    if ($line) {
      $readyTime = ([datetime]::Parse(($line | ConvertFrom-Json).time)).ToUniversalTime()
    }
  }
}

if ($null -eq $readyTime) {
  Write-Output 'Cold start: marker not found within 60 s'
} else {
  $coldStart = ($readyTime - $startTime).TotalSeconds
  Write-Output ('Cold start to tray: {0:N2} s' -f $coldStart)
}

Start-Sleep -Seconds 30

$samples = @()
$firstCpu = $null
$firstTime = $null
$lastCpu = 0.0
$lastTime = $null
$end = (Get-Date).AddMinutes($Minutes)
while ((Get-Date) -lt $end) {
  $apps = @(Get-AppProcesses)
  $private = ($apps | Measure-Object -Property PrivateMemorySize64 -Sum).Sum
  $working = ($apps | Measure-Object -Property WorkingSet64 -Sum).Sum
  $cpu = ($apps | ForEach-Object { $_.TotalProcessorTime.TotalSeconds } | Measure-Object -Sum).Sum
  $now = Get-Date
  if ($null -eq $firstCpu) {
    $firstCpu = $cpu
    $firstTime = $now
  }
  $lastCpu = $cpu
  $lastTime = $now
  $samples += [pscustomobject]@{ Private = $private; Working = $working; Count = $apps.Count }
  Start-Sleep -Seconds 5
}

$wall = ($lastTime - $firstTime).TotalSeconds
$cpuPercentOfCore = if ($wall -gt 0) { ($lastCpu - $firstCpu) / $wall * 100 } else { 0 }
$mb = 1MB
$avgPrivate = ($samples | Measure-Object -Property Private -Average).Average / $mb
$peakPrivate = ($samples | Measure-Object -Property Private -Maximum).Maximum / $mb
$peakWorking = ($samples | Measure-Object -Property Working -Maximum).Maximum / $mb
$peakCount = ($samples | Measure-Object -Property Count -Maximum).Maximum

Write-Output ('Samples: {0} over {1:N0} s' -f $samples.Count, $wall)
Write-Output ('Processes: {0}' -f $peakCount)
Write-Output ('Private memory average: {0:N1} MB' -f $avgPrivate)
Write-Output ('Private memory peak: {0:N1} MB' -f $peakPrivate)
Write-Output ('Working set peak: {0:N1} MB' -f $peakWorking)
Write-Output ('CPU average: {0:N2} % of one core, {1:N3} % of the whole machine ({2} logical cores)' -f $cpuPercentOfCore, ($cpuPercentOfCore / $cores), $cores)

Get-AppProcesses | Stop-Process -Force
Write-Output "User data folder: $UserDataDir"
