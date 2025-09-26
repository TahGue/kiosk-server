param(
    [Parameter(Mandatory=$true)]
    [string]$HostsFile,               # Path to hosts.txt with one host per line (IP or hostname)

    [Parameter(Mandatory=$true)]
    [string]$ServerBase,              # e.g. http://192.168.1.101:4000

    [Parameter(Mandatory=$false)]
    [string]$Username = "student",   # SSH username on clients (default 'student')

    [Parameter(Mandatory=$false)]
    [string]$KeyPath,                 # Optional path to private key for key-based auth

    [Parameter(Mandatory=$false)]
    [switch]$Reboot,                  # Reboot client after update

    [Parameter(Mandatory=$false)]
    [switch]$RunSetup                 # Run the root setup portion once (creates user/session/autologin)
)

# Requirements: Windows OpenSSH client available (ssh.exe, scp.exe)
# On Windows 10/11, it's usually built in. Verify with: ssh -V

function Test-Tool($name) {
  $path = (Get-Command $name -ErrorAction SilentlyContinue).Path
  if (-not $path) { throw "'$name' is required but not found in PATH." }
}

try {
  Test-Tool ssh
  Test-Tool scp
} catch {
  Write-Error $_
  exit 1
}

if (-not (Test-Path -Path $HostsFile)) { throw "Hosts file not found: $HostsFile" }

# Resolve repo paths
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ClientDir = Join-Path $RepoRoot 'kiosk-client'
$StartScript = Join-Path $ClientDir 'start-kiosk.sh'
if (-not (Test-Path $StartScript)) { throw "start-kiosk.sh not found at $StartScript" }

$Hosts = Get-Content -Path $HostsFile | Where-Object { $_ -and $_.Trim() -notmatch '^#' } | ForEach-Object { $_.Trim() }
if ($Hosts.Count -eq 0) { throw "No hosts found in $HostsFile" }

# SSH/SCP options
$CommonOpts = @()
if ($KeyPath) { $CommonOpts += @('-i', $KeyPath) }
$CommonOpts += @('-o','StrictHostKeyChecking=no','-o','UserKnownHostsFile=/dev/null')

Write-Host "Updating clients from: $StartScript" -ForegroundColor Cyan
Write-Host "ServerBase: $ServerBase" -ForegroundColor Cyan

foreach ($Host in $Hosts) {
  Write-Host "---- $Host ----" -ForegroundColor Yellow
  $target = "$Username@$Host"

  try {
    # 1) Copy latest start-kiosk.sh to /tmp
    Write-Host "[1/4] Copy start script" -ForegroundColor Gray
    $scpArgs = @($CommonOpts) + @($StartScript, "$target:/tmp/start-kiosk.sh")
    scp @scpArgs

    # 2) Apply config and move script into place
    Write-Host "[2/4] Apply config and install script" -ForegroundColor Gray
    $remoteCmd = @(
      "set -e",
      "if [ ! -f /etc/kiosk-client.conf ]; then echo 'Creating /etc/kiosk-client.conf'; fi",
      "echo 'SERVER_BASE=\"$ServerBase\"' | sudo tee /etc/kiosk-client.conf >/dev/null",
      "sudo mv /tmp/start-kiosk.sh /usr/local/bin/start-kiosk.sh",
      "sudo chown root:root /usr/local/bin/start-kiosk.sh",
      "sudo chmod +x /usr/local/bin/start-kiosk.sh"
    ) -join '; '

    if ($RunSetup) {
      # Run the root setup portion once to create kiosk session/autologin
      $remoteCmd += "; echo '[setup] running root setup...' ; sudo bash /usr/local/bin/start-kiosk.sh"
    }

    $sshArgs = @($CommonOpts) + @($target, $remoteCmd)
    ssh @sshArgs

    # 3) Restart kiosk browser to pick up config change
    Write-Host "[3/4] Restarting kiosk browser" -ForegroundColor Gray
    $restartCmd = @(
      "pkill -f 'google-chrome' >/dev/null 2>&1 || true",
      "pkill -f 'firefox' >/dev/null 2>&1 || true"
    ) -join '; '
    $sshArgs = @($CommonOpts) + @($target, $restartCmd)
    ssh @sshArgs

    # 4) Optional reboot for clean state
    if ($Reboot) {
      Write-Host "[4/4] Rebooting..." -ForegroundColor Gray
      $sshArgs = @($CommonOpts) + @($target, 'sudo reboot')
      ssh @sshArgs
    } else {
      Write-Host "[4/4] Done (no reboot)" -ForegroundColor Gray
    }

    Write-Host "Success: $Host" -ForegroundColor Green
  } catch {
    Write-Host "Failed: $Host -> $_" -ForegroundColor Red
  }
}

Write-Host "All hosts processed." -ForegroundColor Cyan
