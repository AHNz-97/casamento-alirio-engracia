$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "dist"))
$expectedPrefix = $projectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

if (-not $distRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "O diretório de saída não pertence ao projeto."
}

if (Test-Path -LiteralPath $distRoot) {
  Remove-Item -LiteralPath $distRoot -Recurse -Force
}

$clientRoot = Join-Path $distRoot "client"
$serverRoot = Join-Path $distRoot "server"
$migrationRoot = Join-Path $distRoot ".openai\drizzle"
New-Item -ItemType Directory -Path $clientRoot -Force | Out-Null
New-Item -ItemType Directory -Path $serverRoot -Force | Out-Null
New-Item -ItemType Directory -Path $migrationRoot -Force | Out-Null

$clientFiles = @(
  "admin.css",
  "inharrime.css",
  "login.js",
  "protocol.css",
  "styles.css",
  "guest.css",
  "guest.js",
  "mensagens.js",
  "mensagens.css",
  "pdf-generator.js"
)

foreach ($relativePath in $clientFiles) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $relativePath) -Destination (Join-Path $clientRoot $relativePath)
}

Copy-Item -LiteralPath (Join-Path $projectRoot "assets") -Destination (Join-Path $clientRoot "assets") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "app.js") -Destination (Join-Path $clientRoot "xai-xai.js")
Copy-Item -LiteralPath (Join-Path $projectRoot "admin.js") -Destination (Join-Path $clientRoot "xai-xai-admin.js")
Copy-Item -LiteralPath (Join-Path $projectRoot "worker\index.js") -Destination (Join-Path $serverRoot "index.js")
Copy-Item -LiteralPath (Join-Path $projectRoot "functions") -Destination (Join-Path $serverRoot "functions") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "shared") -Destination (Join-Path $serverRoot "shared") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "lib") -Destination (Join-Path $serverRoot "lib") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "inharrime-admin.html") -Destination (Join-Path $serverRoot "lib\admin.html")
Copy-Item -LiteralPath (Join-Path $projectRoot "mensagens.html") -Destination (Join-Path $serverRoot "lib\mensagens.html")
Copy-Item -LiteralPath (Join-Path $projectRoot "badges-admin.html") -Destination (Join-Path $serverRoot "lib\badges-admin.html")
Copy-Item -LiteralPath (Join-Path $projectRoot "protocol.html") -Destination (Join-Path $serverRoot "lib\protocol.html")
Copy-Item -LiteralPath (Join-Path $projectRoot "index.html") -Destination (Join-Path $serverRoot "lib\xai-public.html")
Copy-Item -LiteralPath (Join-Path $projectRoot "admin.html") -Destination (Join-Path $serverRoot "lib\xai-admin.html")
Copy-Item -LiteralPath (Join-Path $projectRoot "db\schema.sql") -Destination (Join-Path $migrationRoot "0000_initial.sql")
Copy-Item -LiteralPath (Join-Path $projectRoot "db\migrations\0004_inharrime.sql") -Destination (Join-Path $migrationRoot "0004_inharrime.sql")
Copy-Item -LiteralPath (Join-Path $projectRoot "db\migrations\0005_guest_management.sql") -Destination (Join-Path $migrationRoot "0005_guest_management.sql")
Copy-Item -LiteralPath (Join-Path $projectRoot "db\migrations\0006_badges.sql") -Destination (Join-Path $migrationRoot "0006_badges.sql")
Copy-Item -LiteralPath (Join-Path $projectRoot "db\migrations\0007_seating_protocol.sql") -Destination (Join-Path $migrationRoot "0007_seating_protocol.sql")
Copy-Item -LiteralPath (Join-Path $projectRoot "db\migrations\0008_badge_photos.sql") -Destination (Join-Path $migrationRoot "0008_badge_photos.sql")
Copy-Item -LiteralPath (Join-Path $projectRoot ".openai\hosting.json") -Destination (Join-Path $distRoot ".openai\hosting.json")
& node (Join-Path $PSScriptRoot "bundle.mjs")
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o convite." }

Write-Output "Build concluído em $distRoot"
