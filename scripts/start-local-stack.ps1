$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
npm --prefix backend run dev:local -- --frontend
