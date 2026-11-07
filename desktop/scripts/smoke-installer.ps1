[CmdletBinding()]
param([Parameter(Mandatory)][string]$Installer)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'The installed smoke test requires a disposable GitHub-hosted Windows runner.'
}
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'The installer smoke test needs an elevated CI account.'
}
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
if ((Split-Path $installerPath -Leaf) -cne 'Tijori-POS-Setup.exe') { throw 'Unexpected installer filename.' }
$installRoot = Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'Tijori'
$dataRoot = Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Tijori'
$client = Join-Path $installRoot 'resources/service/TijoriService.exe'
$firewallName = 'TijoriPOS-Private'
function Get-TijoriStartup {
    # Get-ItemPropertyValue throws for a missing value, even with SilentlyContinue.
    [Microsoft.Win32.Registry]::GetValue('HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'Tijori POS', $null)
}
$userConfig = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Tijori/config.json'
if ((Get-Service TijoriRuntime -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath $installRoot) -or
    (Test-Path -LiteralPath $dataRoot) -or (Test-Path -LiteralPath $userConfig) -or
    (Get-NetFirewallRule -Name $firewallName -ErrorAction SilentlyContinue) -or
    (Get-TijoriStartup)) {
    throw 'The CI machine already contains a Tijori installation, database, config, or firewall rule.'
}

function New-CounterProcess([string]$Exe, [string]$Arguments) {
    $start = [Diagnostics.ProcessStartInfo]::new($Exe, $Arguments)
    $start.UserName = $counterAccount.Name
    $start.Domain = $env:COMPUTERNAME
    $start.Password = $counterPassword
    $start.WorkingDirectory = [Environment]::GetFolderPath('System')
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    return $start
}

function Invoke-Bridge([string]$Action, [hashtable]$Fields = @{}, [switch]$ExpectRejection) {
    $request = @{action = $Action} + $Fields
    $start = New-CounterProcess $client '--client'
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    $start.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $process = [Diagnostics.Process]::Start($start)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.WriteLine(($request | ConvertTo-Json -Depth 6 -Compress))
        $process.StandardInput.Close()
        if (!$process.WaitForExit(240000)) {
            $process.Kill()
            throw "Timed out waiting for the installed service operation '$Action'."
        }
        if ($process.ExitCode -ne 0) { throw "The standard counter account could not use the installed service bridge for '$Action'. $($stderr.GetAwaiter().GetResult())" }
        $reply = $stdout.GetAwaiter().GetResult() | ConvertFrom-Json
        if ($reply.ok -ne !$ExpectRejection.IsPresent) {
            throw "Unexpected result for the installed service operation '$Action'. $($reply.error) $($reply.userMessage)"
        }
        return $reply.value
    } finally {
        $process.Dispose()
    }
}

function Test-InstallationPolicy {
    $acl = Get-Acl -LiteralPath (Join-Path $dataRoot 'tijori.env')
    $readers = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) |
        Where-Object AccessControlType -eq 'Allow' | ForEach-Object { $_.IdentityReference.Value } | Sort-Object -Unique)
    if (!$acl.AreAccessRulesProtected -or ($readers -join ',') -ne 'S-1-5-18,S-1-5-32-544') {
        throw 'Unexpected access rights to the machine secrets.'
    }
    $rule = Get-NetFirewallRule -Name $firewallName
    if ($rule.Profile.ToString() -ne 'Private' -or $rule.Action -ne 'Allow' -or
        $rule.Direction -ne 'Inbound' -or $rule.Enabled.ToString() -ne 'True') {
        throw 'The installed LAN firewall rule must allow inbound traffic on Private networks only.'
    }
    $program = ($rule | Get-NetFirewallApplicationFilter).Program
    $exe = Join-Path $installRoot 'resources\server\tijori-server.exe'
    if (![string]::Equals([Environment]::ExpandEnvironmentVariables($program), $exe, 'OrdinalIgnoreCase') -or
        ($rule | Get-NetFirewallPortFilter).Protocol -notin @('TCP', '6')) {
        throw 'The firewall rule must target the installed server using TCP.'
    }
    $addresses = @(($rule | Get-NetFirewallAddressFilter).RemoteAddress)
    if (!$addresses.Count -or @($addresses | Where-Object { $_ -notin @('LocalSubnet','LocalSubnet4','LocalSubnet6') }).Count) {
        throw 'The firewall rule must be limited to the local subnet.'
    }
    $launcher = Join-Path $installRoot 'Tijori POS.exe'
    if (!(Test-Path -LiteralPath $launcher) -or ([string](Get-TijoriStartup)).Trim('"') -ne $launcher) {
        throw 'The Windows startup entry does not launch the installed application.'
    }
    $shell = New-Object -ComObject WScript.Shell
    foreach ($folders in (,@('CommonDesktopDirectory','DesktopDirectory') + ,@('CommonPrograms','Programs'))) {
        $paths = @($folders | ForEach-Object { [Environment]::GetFolderPath($_) } | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
        $shortcuts = @(Get-ChildItem -LiteralPath $paths -File -Filter '*Tijori*.lnk' -Recurse |
            Where-Object { $shell.CreateShortcut($_.FullName).TargetPath -eq $launcher })
        if (!$shortcuts.Count) { throw "Missing installed shortcut in $($folders -join ' or ')." }
    }
    if (Get-ChildItem -LiteralPath (Join-Path $installRoot 'resources/server') -Filter '*.py' -File -Recurse | Select-Object -First 1) {
        throw 'The installed standalone server contains raw Python source.'
    }
    # Exercise the filesystem check with an ordinary Windows token, without reading or logging a secret.
    $probe = @'
try {
    $file = [IO.File]::OpenRead((Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Tijori/tijori.env'))
    $file.Dispose()
    exit 10
} catch {
    if ($_.Exception.GetBaseException() -is [UnauthorizedAccessException]) { exit 0 }
    exit 11
}
'@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($probe))
    $powershell = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
    $probeProcess = [Diagnostics.Process]::Start((New-CounterProcess $powershell "-NoLogo -NoProfile -NonInteractive -EncodedCommand $encoded"))
    try {
        if (!$probeProcess.WaitForExit(30000) -or $probeProcess.ExitCode -ne 0) { throw 'The standard account must be refused read access to the secret file.' }
    } finally { $probeProcess.Dispose() }
}

function Confirm-Dump($Backup, [string]$Kind) {
    if ($Backup.filename -notmatch "^smartshop-$Kind-[\da-z-]+\.sql$" -or $Backup.size_bytes -le 0) { throw "Invalid $Kind backup response." }
    $file = Get-Item -LiteralPath (Join-Path $dataRoot ('backups/' + $Backup.filename))
    if ($file.Length -ne $Backup.size_bytes -or !(Select-String -LiteralPath $file.FullName -SimpleMatch 'PostgreSQL database dump' -Quiet)) {
        throw "The $Kind backup does not contain a SQL dump."
    }
    return $file.FullName
}

$installed = $false
$counterAccount = $null
$backupPath = $null
$backupHash = $null
try {
    $counterPassword = ConvertTo-SecureString ('Ax8!' + [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))) -AsPlainText -Force
    $counterAccount = New-LocalUser -Name ('TijoriCi-' + [guid]::NewGuid().ToString('N').Substring(0,8)) -Password $counterPassword
    $usersGroup = Get-LocalGroup -SID 'S-1-5-32-545'
    if (!(Get-LocalGroupMember -SID $usersGroup.SID | Where-Object SID -eq $counterAccount.SID)) {
        Add-LocalGroupMember -SID $usersGroup.SID -Member $counterAccount
    }
    Write-Host 'Installing Tijori on the fresh hosted runner.'
    $install = Start-Process -WindowStyle Hidden -FilePath $installerPath -ArgumentList '/S' -Wait -PassThru
    if ($install.ExitCode -ne 0) { throw "Installer exited with code $($install.ExitCode)." }
    $installed = $true
    $service = Get-Service TijoriRuntime
    try { $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(60)) } finally { $service.Dispose() }
    Test-InstallationPolicy
    $initial = Invoke-Bridge 'inspect'
    if ($initial.shop -or $initial.consent) { throw 'Unexpected preconfigured database on fresh install.' }
    $null = Invoke-Bridge 'initialize'
    $null = Invoke-Bridge 'migrate' @{consent=$false} -ExpectRejection
    # The CI fixture explicitly confirms migration of the new database initialized above.
    $null = Invoke-Bridge 'migrate' @{consent=$true}
    $email = "owner-$($env:GITHUB_RUN_ID)@example.test"
    $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $fields = @{ storeName = 'Tijori CI'; branchName = 'Lahore'; ownerName = 'CI owner'; ownerEmail = $email; counters = 1 }
    $created = Invoke-Bridge 'setup' @{fields=$fields;password=$password}
    $status = Invoke-Bridge 'status'
    if (!$created.ok -or !$status.configured -or $status.owner_email -ne $email -or $status.store -ne $fields.storeName -or $status.counters -ne 1) {
        throw 'The packaged shop setup did not provision the requested store.'
    }
    $config = Invoke-Bridge 'start'
    $base = "http://127.0.0.1:$($config.port)"
    if ((Invoke-RestMethod "$base/api/health-check/" -TimeoutSec 10).status -ne 'ok' -or
        (Invoke-WebRequest "$base/pos" -TimeoutSec 10).Content -notmatch 'id="root"') { throw 'The installed app did not serve the register and API.' }
    $machine = Get-Content -Raw -LiteralPath (Join-Path $dataRoot 'state/machine.json') | ConvertFrom-Json
    $listens = @(Get-NetTCPConnection -State Listen -LocalPort $machine.pgPort)
    if (!$listens.Count -or @($listens | Where-Object LocalAddress -ne '127.0.0.1').Count) { throw 'PostgreSQL must listen only on loopback.' }
    $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    $login = Invoke-RestMethod "$base/api/auth/login/" -Method Post -WebSession $session -ContentType 'application/json' -TimeoutSec 15 -Body (
        @{ email=$email; password=$password } | ConvertTo-Json -Compress)
    $authenticated = Invoke-RestMethod "$base/api/auth/session/" -WebSession $session -TimeoutSec 10
    if ($login.user.role -ne 'owner' -or $authenticated.user.email -ne $email) { throw 'Installed owner login failed.' }
    $counters = @(Invoke-RestMethod "$base/api/sales/terminals/" -WebSession $session -TimeoutSec 10)
    if (@($counters | ForEach-Object { $_.code }) -join ',' -ne 'C1') { throw 'The till did not get exactly Counter 1.' }
    $csrf = $session.Cookies.GetCookies([uri]$base)['csrftoken'].Value
    if (!$csrf) { throw 'Expected the Django session CSRF cookie.' }
    $backup = Invoke-RestMethod "$base/api/system/backup/" -Method Post -WebSession $session -TimeoutSec 100 -Headers @{ 'X-CSRFToken'=$csrf }
    $backupPath = Confirm-Dump $backup 'manual'
    $backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
    $beforeUpdate = Invoke-Bridge 'beforeUpdate'
    $null = Confirm-Dump $beforeUpdate 'update'
    $null = Invoke-Bridge 'stop'
    Write-Host 'Installed setup, login, register API, backup, and shutdown passed.'
} catch {
    $reason = [Microsoft.Win32.Registry]::GetValue('HKEY_LOCAL_MACHINE\SOFTWARE\Tijori POS\Installer', 'LastError', $null)
    if ($reason) { Write-Host "Installer helper reported: $reason" }
    foreach ($name in 'service.log', 'server.log', 'postgres-tools.log') {
        $logPath = Join-Path $dataRoot "logs/$name"
        if (Test-Path -LiteralPath $logPath) {
            Write-Host "Last lines of $name"
            Get-Content -Tail 25 -LiteralPath $logPath
        }
    }
    try {
        Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Service Control Manager'; StartTime=(Get-Date).AddMinutes(-15) } |
            Where-Object { $_.Message -match 'Tijori' } | Select-Object -First 3 -ExpandProperty Message | Write-Host
    } catch { Write-Host 'No additional service events were available.' }
    throw
} finally {
    try {
        if ($installed) {
            $uninstaller = @(Get-ChildItem -LiteralPath $installRoot -File -Filter 'Uninstall*.exe')
            if ($uninstaller.Count -ne 1) { throw 'Missing or ambiguous installed uninstaller.' }
            $remove = Start-Process -WindowStyle Hidden -FilePath $uninstaller[0].FullName -ArgumentList '/S' -Wait -PassThru
            if ($remove.ExitCode -ne 0) { throw "Uninstaller exited with code $($remove.ExitCode)." }
        }
    } finally {
        if ($counterAccount) { Remove-LocalUser -SID $counterAccount.SID }
    }
}
if ((Get-Service TijoriRuntime -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath $client) -or
    (Get-NetFirewallRule -Name $firewallName -ErrorAction SilentlyContinue) -or
    (Get-TijoriStartup)) {
    throw 'Uninstall left a service, installed bridge, firewall rule, or automatic startup entry.'
}
foreach ($file in @('pgdata/PG_VERSION','pgdata/global/pg_control','state/machine.json','tijori.env')) {
    if (!(Test-Path -LiteralPath (Join-Path $dataRoot $file) -PathType Leaf)) { throw "Uninstall did not retain $file." }
}
if ((Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash -ne $backupHash) { throw 'Uninstall changed the retained backup.' }
Write-Host 'Silent uninstall retained the CI database and backup. The hosted runner will be discarded.'
