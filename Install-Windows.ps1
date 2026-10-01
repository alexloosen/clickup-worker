[CmdletBinding()]
param([switch]$ConnectionOnly, [switch]$UseCheckout)
$ErrorActionPreference = 'Stop'

if (-not $env:LOCALAPPDATA) { throw 'This installer requires Windows.' }
$nodeCommand = (Get-Command node -ErrorAction Stop).Source
$codexCommand = (Get-Command codex -ErrorAction Stop).Source
$nodeMajor = [int]((& $nodeCommand --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { throw 'Node.js 20 or later is required.' }
Get-Command git -ErrorAction Stop | Out-Null
$sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$installRoot = if ($UseCheckout) { $sourceRoot } else { [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ClickUpTasksPlugin')) }
$sourcePlugin = Join-Path $sourceRoot 'plugins/puppeteer-bugs'
if (-not (Test-Path -LiteralPath (Join-Path $sourcePlugin 'server/index.mjs'))) { throw 'Extract the entire ZIP before running this installer.' }
$expectedVersion = (Get-Content -LiteralPath (Join-Path $sourcePlugin '.codex-plugin/plugin.json') -Raw | ConvertFrom-Json).version

# The install directory contains package files only; user data is stored separately.
if ($sourceRoot -ne $installRoot) {
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    foreach ($relativePath in @('plugins', '.agents')) {
        Copy-Item -LiteralPath (Join-Path $sourceRoot $relativePath) -Destination $installRoot -Recurse -Force
    }
}
$codexHomePath = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$configPath = Join-Path $codexHomePath 'config.toml'
if (Test-Path -LiteralPath $configPath) {
    $backupPath = $configPath + '.before-clickup-tasks-' + [guid]::NewGuid().ToString() + '.bak'
    Copy-Item -LiteralPath $configPath -Destination $backupPath
    Write-Host "Configuration backup: $backupPath"
}
if (-not $ConnectionOnly) {
    $marketplaceList = & $codexCommand plugin marketplace list --json
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the registered marketplaces.' }
    $existingMarketplace = ($marketplaceList | ConvertFrom-Json).marketplaces | Where-Object { $_.name -eq 'clickup-tasks-local' }
    if ($existingMarketplace -and [IO.Path]::GetFullPath($existingMarketplace.root) -ne $installRoot) {
        & $codexCommand plugin marketplace remove 'clickup-tasks-local' --json
        if ($LASTEXITCODE -ne 0) { throw 'Could not replace the previous ClickUp marketplace source.' }
    }
    & $codexCommand plugin marketplace add $installRoot --json
    if ($LASTEXITCODE -ne 0) { throw 'Could not register the local marketplace.' }
    & $codexCommand plugin add 'puppeteer-bugs@clickup-tasks-local' --json
    if ($LASTEXITCODE -ne 0) { throw 'Could not install the local plugin. The registered marketplace is available in Codex Plugins.' }
    $pluginList = & $codexCommand plugin list --json
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify the installed plugin.' }
    $installed = @(($pluginList | ConvertFrom-Json).installed | Where-Object { $_.pluginId -eq 'puppeteer-bugs@clickup-tasks-local' })
    $expectedPluginPath = [IO.Path]::GetFullPath((Join-Path $installRoot 'plugins/puppeteer-bugs'))
    if ($installed.Count -ne 1 -or $installed[0].version -ne $expectedVersion -or [IO.Path]::GetFullPath($installed[0].source.path) -ne $expectedPluginPath) {
        throw 'Installed plugin version or source does not match this checkout. The config backup is preserved.'
    }
    Write-Host "Verified ClickUp Tasks $expectedVersion from $expectedPluginPath"
}
$serverPath = Join-Path $installRoot 'plugins/puppeteer-bugs/server/index.mjs'
& $codexCommand mcp add puppeteer-bugs-panel -- $nodeCommand $serverPath
if ($LASTEXITCODE -ne 0) { throw 'Could not register the plugin server.' }
$configText = [IO.File]::ReadAllText($configPath)
$headerPattern = '(?m)^\[mcp_servers\.puppeteer-bugs-panel\]\r?$'
if ([regex]::Matches($configText, $headerPattern).Count -ne 1) { throw 'Expected one native MCP section. The config backup is preserved.' }
$sectionPattern = '(?ms)(^\[mcp_servers\.puppeteer-bugs-panel\]\r?\n)(.*?)(?=^\[|\z)'
$configText = [regex]::Replace($configText, $sectionPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match)
    $body = [regex]::Replace($match.Groups[2].Value, '(?m)^(env_vars|startup_timeout_sec|tool_timeout_sec)\s*=.*\r?\n?', '')
    return $match.Groups[1].Value + $body
})
$configText = [regex]::Replace($configText, $headerPattern, '[mcp_servers.puppeteer-bugs-panel]' + "`nenv_vars = [""CODEX_APP_TOOLS_PIPE_PATH""]`nstartup_timeout_sec = 20`ntool_timeout_sec = 300")
[IO.File]::WriteAllText($configPath, $configText, (New-Object System.Text.UTF8Encoding($false)))
& $codexCommand mcp get puppeteer-bugs-panel --json
if ($LASTEXITCODE -ne 0) { throw 'Native MCP configuration validation failed. Restore the preserved config backup.' }
Write-Host ''
Write-Host "Installed runtime: $serverPath"
Write-Host 'Restart Codex, open ClickUp Tasks, then choose Setup in the top-right corner.'
if ($ConnectionOnly) { Write-Host 'ConnectionOnly updates the native server only; it does not update the installed plugin version.' }
if ($UseCheckout) { Write-Host 'This checkout must remain at its current path. Rerun this command after pulling or rebuilding.' }
Write-Host 'The installer does not change chat approval or sandbox settings.'
Write-Host 'Your ClickUp token and project settings stay on this computer.'
