param(
    [ValidateSet("CheckLocation", "CheckInstalled", "BeforeUpgrade", "OpenFirewall", "CloseFirewall", "EraseData")]
    [string] $Action,
    [string] $InstallDir,
    [string] $RegisteredDir
)
$ErrorActionPreference = "Stop"

function Test-ReparsePoint([string] $Name) {
    $item = Get-Item -Force -LiteralPath $Name -ErrorAction Stop
    return [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
}

function Assert-ProtectedItem([IO.FileSystemInfo] $Item) {
    if ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Installation path includes a link: $($Item.FullName)" }
    $acl = Get-Acl -LiteralPath $Item.FullName -ErrorAction Stop
    $trusted = @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trusted) {
        throw "Installation path has a non-administrative owner: $($Item.FullName)"
    }
    # Generic write/all, write/create/append, attributes, delete, change ACL, take ownership.
    $mutate = [int64]0x500D0156 -bor [int64][Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles
    $rules = $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
    if (-not $rules.Count) { throw "Missing access rules on installation path: $($Item.FullName)" }
    foreach ($rule in $rules) {
        if ($rule.AccessControlType -ne 'Allow' -or $rule.IdentityReference.Value -in $trusted) { continue }
        if ($rule.IdentityReference.Value -eq 'S-1-3-0' -and ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)) { continue }
        if ([int64]$rule.FileSystemRights -band $mutate) { throw "Installation path is writable outside Administrators or SYSTEM: $($Item.FullName)" }
    }
}

function Assert-ProtectedLocation([string] $Location, [switch] $Tree) {
    $path = [IO.Path]::GetFullPath($Location).TrimEnd('\')
    $programs = [IO.Path]::GetFullPath([Environment]::GetFolderPath('ProgramFiles')).TrimEnd('\')
    if (-not $path.StartsWith("$programs\", [StringComparison]::OrdinalIgnoreCase)) { throw "Choose a folder inside 64-bit Program Files." }
    for ($part = $path; $part.Length -ge $programs.Length; $part = Split-Path $part) {
        if (Test-Path -LiteralPath $part) { Assert-ProtectedItem (Get-Item -Force -LiteralPath $part) }
    }
    if ($Tree) {
        # Verify before following any child directory. Explicit ACLs and side-loaded DLLs must be safe too.
        $dirs = [Collections.Generic.Queue[string]]::new()
        $dirs.Enqueue($path)
        while ($dirs.Count) {
            foreach ($child in Get-ChildItem -Force -LiteralPath $dirs.Dequeue()) {
                Assert-ProtectedItem $child
                if ($child.PSIsContainer) { $dirs.Enqueue($child.FullName) }
            }
        }
    }
}

function Invoke-ExistingService([string] $Client, [string] $Operation) {
    $response = (@{action=$Operation} | ConvertTo-Json -Compress) | & $Client --client | Out-String
    if ($LASTEXITCODE -ne 0) { throw "The existing Tijori service could not prepare this upgrade." }
    $reply = $response | ConvertFrom-Json
    if ($reply.ok -ne $true) { throw "The existing Tijori service could not complete $Operation. Shop files were preserved." }
    return $reply.value
}

switch ($Action) {
    "CheckLocation" {
        $path = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
        Assert-ProtectedLocation $path
        if ((Test-Path -LiteralPath $path) -and (Get-ChildItem -Force -LiteralPath $path)) {
            if (-not $RegisteredDir -or $path -ne [IO.Path]::GetFullPath($RegisteredDir).TrimEnd('\')) {
                throw "Choose an empty folder or the registered Tijori POS installation."
            }
            Assert-ProtectedLocation $path -Tree
        }
    }
    "CheckInstalled" { Assert-ProtectedLocation $InstallDir -Tree }
    "BeforeUpgrade" {
        # Electron's updater performs its own backup. A hand-run replacement must back up too.
        $service = Get-Service -Name "TijoriRuntime" -ErrorAction SilentlyContinue
        if (-not $service) { break }
        Assert-ProtectedLocation $InstallDir -Tree
        $client = Join-Path $InstallDir "resources/service/TijoriService.exe"
        if (-not (Test-Path -LiteralPath $client)) { throw "Cannot find the existing Tijori service to back up the shop." }
        if ($service.Status -ne "Running") { Start-Service -Name "TijoriRuntime" }
        $info = Invoke-ExistingService $client "inspect"
        if ($info.shop) {
            $backup = Invoke-ExistingService $client "beforeUpdate"
            if ($backup.size_bytes -le 0) { throw "The pre-update backup was not verified." }
        }
    }
    "OpenFirewall" {
        Get-NetFirewallRule -Name "TijoriPOS-Private" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
        New-NetFirewallRule -Name "TijoriPOS-Private" -DisplayName "Tijori POS (private shop LAN)" `
            -Program (Join-Path $InstallDir "resources/server/tijori-server.exe") -Protocol TCP -Direction Inbound `
            -RemoteAddress LocalSubnet -Profile Private -Action Allow -Enabled True | Out-Null
    }
    "CloseFirewall" {
        Get-NetFirewallRule -Name "TijoriPOS-Private" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    }
    "EraseData" {
        $programData = [Environment]::GetFolderPath("CommonApplicationData")
        $data = [IO.Path]::GetFullPath((Join-Path $programData "Tijori"))
        if ((Split-Path $data) -ne $programData -or (Split-Path $data -Leaf) -ne "Tijori") {
            throw "Unexpected shop data directory."
        }
        if (-not (Test-Path -LiteralPath $data)) { break }
        # Refuse linked files/directories before any recursive removal.
        $queue = [Collections.Generic.Queue[string]]::new()
        $queue.Enqueue($data)
        while ($queue.Count -gt 0) {
            $current = $queue.Dequeue()
            if (Test-ReparsePoint $current) { throw "Shop data includes a link; the data was retained." }
            foreach ($child in Get-ChildItem -Force -LiteralPath $current) {
                if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Shop data includes a link; the data was retained." }
                if ($child.PSIsContainer) { $queue.Enqueue($child.FullName) }
            }
        }
        Remove-Item -Recurse -Force -LiteralPath $data
    }
}
