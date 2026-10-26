# Creates or repairs .venv-proctoring, the dedicated environment for the Python vision service.
# Uses uv when available (it can download a managed CPython 3.13), otherwise the Windows py launcher.
# Installs the exact versions in requirements-proctoring.lock.txt (plus pytest with -Dev), verifies the
# official MediaPipe models by SHA-256 (downloading any that are missing), then runs the vision self-check.
param([string]$PythonVersion = '3.13', [switch]$Recreate, [switch]$Dev)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$venv = Join-Path $root '.venv-proctoring'
$venvPython = Join-Path $venv 'Scripts\python.exe'
$lock = Join-Path $root $(if ($Dev) { 'requirements-proctoring-dev.txt' } else { 'requirements-proctoring.lock.txt' })

$uv = Get-Command uv -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $uv) {
    $uv = Get-ChildItem -Path (Join-Path $env:APPDATA 'Python') -Filter uv.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName -First 1
}

if ($Recreate -and (Test-Path $venv)) { Remove-Item -Recurse -Force $venv }

if (-not (Test-Path $venvPython)) {
    if ($uv) {
        Write-Host "Creating .venv-proctoring with uv (Python $PythonVersion)"
        & $uv venv --python $PythonVersion $venv
    } else {
        Write-Host "Creating .venv-proctoring with the py launcher (Python $PythonVersion)"
        & py "-$PythonVersion" -m venv $venv
    }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $venvPython)) { throw "Could not create .venv-proctoring with Python $PythonVersion. Install Python $PythonVersion or uv (python -m pip install --user uv), then retry." }
}

$version = & $venvPython -c "import sys; print('%d.%d' % sys.version_info[:2])"
if ([version]$version -ge [version]'3.14' -or [version]$version -lt [version]'3.10') { throw ".venv-proctoring uses Python $version; the vision service needs 3.10-3.13. Rerun with -Recreate." }

Write-Host "Installing pinned vision dependencies into Python $version"
if ($uv) { & $uv pip install --python $venvPython -r $lock } else { & $venvPython -m pip install --disable-pip-version-check -r $lock }
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

Write-Host 'Verifying MediaPipe model assets'
& (Join-Path $PSScriptRoot 'install-proctoring-models.ps1')

Push-Location $root
try { & npx tsx scripts/check-vision.ts; if ($LASTEXITCODE -ne 0) { throw 'Vision self-check failed.' } } finally { Pop-Location }
