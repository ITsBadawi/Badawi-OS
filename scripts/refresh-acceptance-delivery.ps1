$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$output = (Resolve-Path -LiteralPath (Join-Path $project '..')).Path
$version = '0.4.1'
$releaseName = "Badawi-OS-$version-Windows"
$release = Join-Path $project "release/$releaseName"
$changed = @(
  'README.md',
  'START-HERE-AR.txt',
  'docs/FEATURE-PARITY-WORKING-STATUS.md',
  'docs/IMPLEMENTATION-STATUS.md',
  'docs/VERIFICATION-AND-DEPLOYMENTS.md',
  'docs/CHANGELOG-0.4.1.md',
  'docs/validation/vercel-live-owner-2026-10-24.json',
  'docs/validation/owner-profile-dry-run-2026-10-24.json',
  'docs/validation/owner-upgrade-0.4.1.json',
  'docs/validation/operational-acceptance-2026-10-24.json',
  'docs/validation/backup-features-desktop.json',
  'docs/validation/backup-checkpoint-desktop.json',
  'docs/validation/integration-jobs-desktop.json',
  'docs/validation/integration-jobs-desktop.png',
  'docs/validation/workflow-recovery-desktop.json'
)
foreach ($relative in $changed) {
  $source = Join-Path $project $relative
  $destination = Join-Path $release $(if ($relative -eq 'START-HERE-AR.txt') { 'ابدأ-هنا.txt' } else { $relative })
  $parent = Split-Path -Parent $destination
  if (!(Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
  Copy-Item -LiteralPath $source -Destination $destination -Force
}
Copy-Item -LiteralPath (Join-Path $project 'docs/IMPLEMENTATION-STATUS.md') -Destination (Join-Path $release 'IMPLEMENTATION-STATUS.md') -Force

function Update-Zip([string]$archivePath, [string]$entryPrefix, [object[]]$files) {
  $temp = "$archivePath.refresh"
  Copy-Item -LiteralPath $archivePath -Destination $temp -Force
  $zip = [System.IO.Compression.ZipFile]::Open($temp, [System.IO.Compression.ZipArchiveMode]::Update)
  try {
    foreach ($item in $files) {
      $entryName = ($entryPrefix + $item.Entry).Replace('\', '/')
      $existing = $zip.GetEntry($entryName)
      if ($existing) { $existing.Delete() }
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $item.Path, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $zip.Dispose() }
  $check = [System.IO.Compression.ZipFile]::OpenRead($temp)
  try {
    foreach ($item in $files) {
      $entryName = ($entryPrefix + $item.Entry).Replace('\', '/')
      if (!$check.GetEntry($entryName)) { throw "Missing archive entry: $entryName" }
    }
  } finally { $check.Dispose() }
  Move-Item -LiteralPath $temp -Destination $archivePath -Force
}

$sourceEntries = @($changed) + @('src/desktop/main.ts', 'tests/desktop-exit.mjs', 'tests/vercel-live-owner.mjs', 'tests/owner-profile-dry-run.mjs', 'tests/owner-upgrade-0.4.1.mjs', 'tests/backup-features-desktop.mjs', 'tests/backup-checkpoint-desktop.mjs', 'tests/integration-jobs-desktop.mjs', 'tests/workflow-recovery-desktop.mjs', 'scripts/refresh-acceptance-delivery.ps1')
$sourceFiles = @($sourceEntries | ForEach-Object { @{ Entry = $_; Path = (Join-Path $project $_) } })
Update-Zip (Join-Path $output "Badawi-OS-$version-Source.zip") '' $sourceFiles
$windowsEntries = @(
  @{ Entry = 'resources/app/dist-desktop/main.cjs'; Path = (Join-Path $release 'resources/app/dist-desktop/main.cjs') },
  @{ Entry = 'README.md'; Path = (Join-Path $release 'README.md') },
  @{ Entry = 'ابدأ-هنا.txt'; Path = (Join-Path $release 'ابدأ-هنا.txt') },
  @{ Entry = 'IMPLEMENTATION-STATUS.md'; Path = (Join-Path $release 'IMPLEMENTATION-STATUS.md') }
)
$windowsEntries += @($changed | Where-Object { $_ -like 'docs/*' } | ForEach-Object { @{ Entry = $_; Path = (Join-Path $release $_) } })
Update-Zip (Join-Path $output "$releaseName.zip") "$releaseName/" $windowsEntries

$windowsHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $output "$releaseName.zip")).Hash
$sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $output "Badawi-OS-$version-Source.zip")).Hash
Set-Content -LiteralPath (Join-Path $output "Badawi-OS-$version-SHA256SUMS.txt") -Encoding UTF8 -Value @(
  "$windowsHash  $releaseName.zip",
  "$sourceHash  Badawi-OS-$version-Source.zip"
)
$manifestPath = Join-Path $output "Badawi-OS-$version-DELIVERY.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifest.dateUtc = (Get-Date).ToUniversalTime().ToString('o')
$manifest.windowsSha256 = $windowsHash
$manifest.sourceSha256 = $sourceHash
$manifest.ownerInstallChanged = $true
$manifest | Add-Member -NotePropertyName operationalChecks -NotePropertyValue 21 -Force
$manifest | Add-Member -NotePropertyName ownerUpgradeAccepted -NotePropertyValue $true -Force
$manifest.pending = @(
  'Railway account test deferred by owner',
  'Live OpenAI API-key check unavailable because no key is configured',
  'Live Vercel exact-commit/non-ready and Drive trash coverage not exercised; controlled coverage passed'
)
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Output "Windows $windowsHash"
Write-Output "Source $sourceHash"
