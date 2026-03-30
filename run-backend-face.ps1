$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "backend"
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
$condaExe = "C:\Users\Yohan\miniconda3\Scripts\conda.exe"
$envPath = "C:\Users\Yohan\miniconda3\envs\egate-face"

Set-Location $backendDir

if (Test-Path $venvPython) {
    & $venvPython manage.py runserver 127.0.0.1:8000
    exit $LASTEXITCODE
}

if (!(Test-Path $condaExe)) {
    throw "No supported Python runtime found. Expected project venv at $venvPython or conda executable at $condaExe."
}

if (!(Test-Path $envPath)) {
    throw "No supported face-recognition environment found. Expected project venv at $venvPython or conda env at $envPath."
}

& $condaExe run -p $envPath python manage.py runserver 127.0.0.1:8000
