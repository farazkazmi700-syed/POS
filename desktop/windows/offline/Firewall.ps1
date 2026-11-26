param([Parameter(Mandatory)][ValidateSet('Add','Remove')][string]$Action)
$ErrorActionPreference = 'Stop'
$name = 'KazmiOnOfflineDocker8080'
if (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -Name $name
}
if ($Action -eq 'Add') {
    $backend = Join-Path $env:ProgramFiles 'Docker\Docker\resources\com.docker.backend.exe'
    if (Test-Path -LiteralPath $backend -PathType Leaf) {
        New-NetFirewallRule -Name $name -DisplayName 'KazmiOn offline POS blocks non-loopback Docker access on 8080' `
            -Direction Inbound -Action Block -Protocol TCP -LocalPort 8080 -Program $backend `
            -RemoteAddress @('0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255','::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff') | Out-Null
    }
}
