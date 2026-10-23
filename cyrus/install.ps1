# Installs Cyrus's T3 Code: the newest DynamicRex/t3code release, its settings, and Claude Code
# with its plugins. Safe to rerun. Later releases: `t3 update`.
#
#   irm https://raw.githubusercontent.com/DynamicRex/t3code/flow/cyrus/install.ps1 | iex
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# A child scope, so nothing below leaks into the session that ran `iex`.
& {
  $ErrorActionPreference = "Stop"
  $repo = "DynamicRex/t3code"
  $raw = "https://raw.githubusercontent.com/$repo/flow"
  $bin = Join-Path $HOME ".local\bin"
  $utf8 = New-Object System.Text.UTF8Encoding $false

  function Get-Json([string] $uri) { (Invoke-WebRequest -Uri $uri -UseBasicParsing).Content | ConvertFrom-Json }
  # Node's JSON.parse rejects a byte-order mark, which PowerShell 5.1's Set-Content writes.
  function Write-Json([string] $path, $value) {
    [IO.File]::WriteAllText($path, ($value | ConvertTo-Json -Depth 20), $utf8)
  }
  # In its own PowerShell, so the installer's variables and `exit` stay out of this one.
  function Invoke-Installer([string] $uri) {
    $file = Join-Path ([IO.Path]::GetTempPath()) ("cyrus-" + [IO.Path]::GetRandomFileName() + ".ps1")
    Invoke-WebRequest -Uri $uri -OutFile $file -UseBasicParsing
    try {
      & (Get-Process -Id $PID).Path -NoProfile -ExecutionPolicy Bypass -File $file
      if ($LASTEXITCODE -ne 0) { throw "$uri failed" }
    } finally { Remove-Item $file -Force }
  }
  function Use-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    if (($env:Path -split ";") -notcontains $bin) { $env:Path = "$bin;$env:Path" }
  }

  # 1. ~\.local\bin (claude, t3) on PATH, now and for new terminals
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (($userPath -split ";") -notcontains $bin) {
    [Environment]::SetEnvironmentVariable("Path", "$bin;$userPath", "User")
  }
  Use-Path

  # 2. Git, which Claude Code on Windows and T3 worktrees need
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    Use-Path
  }

  # 3. Claude Code, its settings (merged into any existing file) and its plugins
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Invoke-Installer "https://claude.ai/install.ps1"
    Use-Path
  }
  $claude = Get-Json "$raw/cyrus/claude.json"
  $claudeDir = Join-Path $HOME ".claude"
  New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null
  $settingsPath = Join-Path $claudeDir "settings.json"
  $settings = $null
  if (Test-Path $settingsPath) {
    $text = Get-Content $settingsPath -Raw
    if ($text) { $settings = $text | ConvertFrom-Json }
  }
  if (-not $settings) { $settings = New-Object PSObject }
  foreach ($setting in $claude.settings.PSObject.Properties) {
    $settings | Add-Member -NotePropertyName $setting.Name -NotePropertyValue $setting.Value -Force
  }
  Write-Json $settingsPath $settings

  $known = Join-Path $claudeDir "plugins\known_marketplaces.json"
  function Test-Marketplace([string] $name) {
    (Test-Path $known) -and (Select-String -Path $known -SimpleMatch -Quiet -Pattern "`"$name`"")
  }
  foreach ($marketplace in $claude.marketplaces.PSObject.Properties) {
    if (Test-Marketplace $marketplace.Name) { continue }
    # Sources in order; a local path counts only on a machine that has it
    foreach ($source in $marketplace.Value) {
      if ($source.StartsWith("/") -and -not (Test-Path $source)) { continue }
      claude plugin marketplace add $source
      if ($LASTEXITCODE -eq 0) { break }
    }
    if (-not (Test-Marketplace $marketplace.Name)) { Write-Warning "marketplace $($marketplace.Name) not added" }
  }
  claude plugin marketplace update
  if ($LASTEXITCODE -ne 0) { Write-Warning "marketplace update failed" }
  foreach ($plugin in $claude.plugins) {
    claude plugin install $plugin --scope user
    if ($LASTEXITCODE -eq 0) { claude plugin update $plugin --scope user }
    if ($LASTEXITCODE -ne 0) { Write-Warning "$plugin install failed" }
  }

  # 4. T3 Code: the newest fork release, through the official installer
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ "User-Agent" = "t3-install" }
  $version = $release.tag_name.Substring(1)
  $env:T3CODE_VERSION = $version
  $env:T3CODE_RELEASE_BASE_URL = "https://github.com/$repo/releases/download"
  try { Invoke-Installer "$raw/scripts/install.ps1" }
  finally { Remove-Item Env:T3CODE_VERSION, Env:T3CODE_RELEASE_BASE_URL }

  # 5. T3 settings; the previous file stays as settings.json.bak
  $t3Home = if ($env:T3CODE_HOME) { $env:T3CODE_HOME } else { Join-Path $HOME ".t3" }
  $userdata = Join-Path $t3Home "userdata"
  New-Item -ItemType Directory -Force -Path $userdata | Out-Null
  $t3SettingsPath = Join-Path $userdata "settings.json"
  if (Test-Path $t3SettingsPath) { Copy-Item $t3SettingsPath "$t3SettingsPath.bak" -Force }
  $t3Settings = Get-Json "$raw/cyrus/t3-settings.json"
  # Windows runs worktree setup scripts in PowerShell, and these are bash.
  $t3Settings.PSObject.Properties.Remove("defaultProjectScripts")
  Write-Json $t3SettingsPath $t3Settings

  claude auth status | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host ">> Sign in to Claude once: claude auth login" }
  Write-Host ">> Done: T3 Code $version. Start it with: t3"
}
