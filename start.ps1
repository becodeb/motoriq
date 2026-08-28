# ─── Motor IQ · arranque de desarrollo (Windows) ────────────────────────────────
# Levanta backend (http://localhost:8000) y frontend (http://localhost:5180)
# en dos ventanas. Requiere haber corrido antes la instalación (ver README).

$root = $PSScriptRoot

if (-not (Test-Path "$root\backend\.venv")) {
    Write-Host "Falta el entorno de Python. Corré primero:" -ForegroundColor Yellow
    Write-Host "  cd backend; py -3.12 -m venv .venv; .\.venv\Scripts\pip install -r requirements-dev.txt"
    exit 1
}
if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "Faltan las dependencias de Node. Corré primero:" -ForegroundColor Yellow
    Write-Host "  cd frontend; npm install"
    exit 1
}
if (-not (Test-Path "$root\backend\pops.db")) {
    Write-Host "Base vacía: aplicando migraciones y seed demo…" -ForegroundColor Cyan
    Push-Location "$root\backend"
    $env:PYTHONUTF8 = "1"
    .\.venv\Scripts\python.exe -m alembic upgrade head
    .\.venv\Scripts\python.exe -m app.seed
    Pop-Location
}

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$env:PYTHONUTF8='1'; Set-Location '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
)
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root\frontend'; npm run dev"
)

Write-Host ""
Write-Host "Motor IQ levantando…" -ForegroundColor Green
Write-Host "  Frontend  → http://localhost:5180"
Write-Host "  API/Docs  → http://localhost:8000/docs"
Write-Host "  Login     → admin@motoriq.demo / demo1234"
