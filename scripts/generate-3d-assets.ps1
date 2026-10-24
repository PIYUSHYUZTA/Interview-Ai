param([string]$BlenderPath = $env:BLENDER_EXECUTABLE, [switch]$Render, [switch]$HumanStudio)
$ErrorActionPreference = 'Stop'
$projectPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $BlenderPath) {
    $blenderCommand = Get-Command blender -ErrorAction SilentlyContinue
    if ($blenderCommand) { $BlenderPath = $blenderCommand.Source }
}
if (-not $BlenderPath) {
    $roots = @('C:\Program Files\Blender Foundation')
    $roots += @(Get-ChildItem -LiteralPath 'D:\' -Directory -Filter 'blender*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
    foreach ($location in $roots) {
        if (-not (Test-Path -LiteralPath $location)) { continue }
        $candidates = @((Join-Path $location 'blender.exe'))
        $candidates += @(Get-ChildItem -LiteralPath $location -Directory | ForEach-Object { Join-Path $_.FullName 'blender.exe' })
        $BlenderPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
        if ($BlenderPath) { break }
    }
}
if (-not $BlenderPath -or -not (Test-Path -LiteralPath $BlenderPath -PathType Leaf)) {
    throw 'Blender was not found. Pass -BlenderPath or set BLENDER_EXECUTABLE to your installed blender.exe.'
}
$assetScript = if ($HumanStudio) { 'blender\prepare_interviewer.py' } else { 'blender\generate_assets.py' }
$taskArgs = @('--background', '--factory-startup', '--python-exit-code', '1', '--python', (Join-Path $PSScriptRoot $assetScript), '--', '--project-root', $projectPath)
if ($Render) { $taskArgs += '--render' }
Write-Host "Generating project assets with $BlenderPath"
& $BlenderPath @taskArgs
if ($LASTEXITCODE -ne 0) { throw "Blender asset generation failed ($LASTEXITCODE)." }
