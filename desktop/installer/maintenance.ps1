param(
    [ValidateSet("CheckLocation", "OpenFirewall", "CloseFirewall", "EraseData")]
    [string] $Action,
    [string] $InstallDir
)
$ErrorActionPreference = "Stop"

function Test-ReparsePoint([string] $Name) {
    $item = Get-Item -Force -LiteralPath $Name -ErrorAction Stop
    return [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
}

switch ($Action) {
    "CheckLocation" {
        $path = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
        $programs = [IO.Path]::GetFullPath([Environment]::GetFolderPath('ProgramFiles')).TrimEnd('\')
        if (-not $path.StartsWith("$programs\", [StringComparison]::OrdinalIgnoreCase)) {
            throw "Choose a folder inside 64-bit Program Files."
        }
        # All existing ancestors must be real directories, even when creating a new leaf.
        for ($part = $path; $part.Length -ge $programs.Length; $part = Split-Path $part) {
            if ((Test-Path -LiteralPath $part) -and (Test-ReparsePoint $part)) {
                throw "Choose a folder without symbolic links or junctions."
            }
        }
        if ((Test-Path -LiteralPath $path) -and (Get-ChildItem -Force -LiteralPath $path) -and
            -not (Test-Path -LiteralPath (Join-Path $path "Tijori POS.exe"))) {
            throw "Choose an empty folder or an existing Tijori POS installation."
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
