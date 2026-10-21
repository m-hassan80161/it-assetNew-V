param(
    [string]$ApiEndpoint = "http://10.22.28.82:3000/api/v1/inventory",
    [bool]$SkipCertValidation = $false,
    [string]$JsonOutputPath,
    [switch]$ExportJsonOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ============================================================
# LOGGING
# ============================================================

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    switch ($Level) {
        "ERROR" {
            Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor Red
        }

        "WARN" {
            Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor Yellow
        }

        "SUCCESS" {
            Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor Green
        }

        default {
            Write-Host "[$timestamp] [$Level] $Message"
        }
    }
}

# ============================================================
# SAFE PROPERTY
# ============================================================

function Get-SafeProperty {
    param(
        $Object,
        [string]$PropertyName,
        $DefaultValue = $null
    )

    if ($null -eq $Object) {
        return $DefaultValue
    }

    if ($Object.PSObject.Properties.Name -contains $PropertyName) {

        $value = $Object.$PropertyName

        if ($null -ne $value) {

            if ($value -is [string]) {

                if ($value.Trim() -ne "") {
                    return $value
                }

            }
            else {
                return $value
            }
        }
    }

    return $DefaultValue
}

function Get-NormalizedSerialNumber {
    param($Value)

    if ($null -eq $Value) {
        return $null
    }

    $serialNumber = $Value.ToString().Trim()

    if ($serialNumber.Length -eq 0) {
        return $null
    }

    return $serialNumber
}

# ============================================================
# START
# ============================================================

Write-Log "=============================================="
Write-Log " IT Asset Inventory Agent"
Write-Log "=============================================="
Write-Log "API Endpoint: $ApiEndpoint"
Write-Log ""

# ============================================================
# 1. COMPUTER INFORMATION
# ============================================================

Write-Log "Collecting computer information..."

try {

    $computerInfo = Get-ComputerInfo

    $computerName = Get-SafeProperty `
        $computerInfo `
        "CsComputerName" `
        $env:COMPUTERNAME

    $loggedInUser = Get-SafeProperty `
        $computerInfo `
        "CsLogonUserName" `
        "$env:USERDOMAIN\$env:USERNAME"

    $osName = Get-SafeProperty `
        $computerInfo `
        "OsName" `
        "Unknown"

    $osVersion = Get-SafeProperty `
        $computerInfo `
        "OsVersion" `
        "Unknown"

    $osBuild = Get-SafeProperty `
        $computerInfo `
        "OsBuildNumber" `
        "Unknown"

    $isPartOfDomain = Get-SafeProperty `
        $computerInfo `
        "CsPartOfDomain" `
        $false

    if ($isPartOfDomain) {

        $domain = Get-SafeProperty `
            $computerInfo `
            "CsDomain" `
            $env:USERDOMAIN
    }
    else {

        $domain = $null
    }

    Write-Log "Computer Name : $computerName"
    Write-Log "Logged User   : $loggedInUser"
    Write-Log "OS            : $osName"
    Write-Log "OS Version    : $osVersion"
    Write-Log "OS Build      : $osBuild"
    Write-Log "Domain        : $domain"
}
catch {

    Write-Log `
        "Failed to collect computer information: $($_.Exception.Message)" `
        "ERROR"
}

# ============================================================
# 2. CPU
# ============================================================

Write-Log ""
Write-Log "Collecting CPU information..."

$cpuInfo = @{
    model         = "Unknown"
    cores         = 0
    threads       = 0
    clockSpeedMhz = 0
    architecture  = "Unknown"
}

try {

    $cpu = Get-CimInstance `
        -ClassName Win32_Processor |
        Select-Object -First 1

    $cpuModel = Get-SafeProperty `
        $cpu `
        "Name" `
        "Unknown"

    $cpuCores = Get-SafeProperty `
        $cpu `
        "NumberOfCores" `
        0

    $cpuThreads = Get-SafeProperty `
        $cpu `
        "NumberOfLogicalProcessors" `
        0

    $cpuClock = Get-SafeProperty `
        $cpu `
        "MaxClockSpeed" `
        0

    $cpuArchitecture = Get-SafeProperty `
        $cpu `
        "Architecture" `
        0

    $architectureMap = @{
        0 = "x86"
        1 = "MIPS"
        2 = "Alpha"
        3 = "PowerPC"
        5 = "ARM"
        6 = "ia64"
        9 = "x64"
    }

    if ($architectureMap.ContainsKey([int]$cpuArchitecture)) {

        $architecture = `
            $architectureMap[[int]$cpuArchitecture]
    }
    else {

        $architecture = "Unknown"
    }

    $cpuInfo = @{
        model = if ($cpuModel -ne "Unknown") {
            $cpuModel.ToString().Trim()
        }
        else {
            "Unknown"
        }

        cores = $cpuCores

        threads = $cpuThreads

        clockSpeedMhz = $cpuClock

        architecture = $architecture
    }

    Write-Log "CPU: $($cpuInfo.model)"
    Write-Log "Cores: $($cpuInfo.cores)"
    Write-Log "Threads: $($cpuInfo.threads)"
}
catch {

    Write-Log `
        "CPU collection failed: $($_.Exception.Message)" `
        "WARN"
}

# ============================================================
# 3. MOTHERBOARD
# ============================================================

Write-Log ""
Write-Log "Collecting motherboard information..."

$motherboardInfo = @{
    manufacturer = "Unknown"
    model        = "Unknown"
    serialNumber = $null
}

try {

    $board = Get-CimInstance `
        -ClassName Win32_BaseBoard |
        Select-Object -First 1

    $manufacturer = Get-SafeProperty `
        $board `
        "Manufacturer" `
        "Unknown"

    $model = Get-SafeProperty `
        $board `
        "Product" `
        "Unknown"

    $serial = Get-SafeProperty `
        $board `
        "SerialNumber" `
        $null

    $motherboardInfo = @{
        manufacturer = if ($manufacturer) {
            $manufacturer.ToString().Trim()
        }
        else {
            "Unknown"
        }

        model = if ($model) {
            $model.ToString().Trim()
        }
        else {
            "Unknown"
        }

        serialNumber = Get-NormalizedSerialNumber $serial
    }

    Write-Log `
        "Motherboard: $($motherboardInfo.manufacturer) $($motherboardInfo.model)"
}
catch {

    Write-Log `
        "Motherboard collection failed: $($_.Exception.Message)" `
        "WARN"
}

# ============================================================
# 4. RAM
# ============================================================

Write-Log ""
Write-Log "Collecting RAM information..."

$ramModules = @()

try {

    $ramSticks = Get-CimInstance `
        -ClassName Win32_PhysicalMemory

    foreach ($stick in $ramSticks) {

        $capacity = Get-SafeProperty `
            $stick `
            "Capacity" `
            0

        $speed = Get-SafeProperty `
            $stick `
            "Speed" `
            0

        $serial = Get-SafeProperty `
            $stick `
            "SerialNumber" `
            $null

        $slot = Get-SafeProperty `
            $stick `
            "BankLabel" `
            $null

        $ramModules += @{
            capacityGb = [int][math]::Round(
                ([double]$capacity / 1GB),
                0
            )

            speedMhz = [int]$speed

            serialNumber = Get-NormalizedSerialNumber $serial

            slot = if ($slot) {
                $slot.ToString().Trim()
            }
            else {
                $null
            }
        }
    }

    Write-Log `
        "RAM modules detected: $($ramModules.Count)"
}
catch {

    Write-Log `
        "RAM collection failed: $($_.Exception.Message)" `
        "WARN"
}

# ============================================================
# 5. DISKS
# ============================================================

Write-Log ""
Write-Log "Collecting disk information..."

$diskDrives = @()
$logicalDiskInfo = @()

try {

    # --------------------------------------------------------
    # Get physical disks
    # --------------------------------------------------------

    $physicalDisks = Get-Disk `
        -ErrorAction Stop

    # --------------------------------------------------------
    # Get partitions
    # --------------------------------------------------------

    $partitions = Get-Partition `
        -ErrorAction Stop

    # --------------------------------------------------------
    # Get volumes
    # --------------------------------------------------------

    $volumes = Get-Volume `
        -ErrorAction Stop

    # --------------------------------------------------------
    # Build logical volume information
    # --------------------------------------------------------

    foreach ($volume in $volumes) {

        $driveLetter = $volume.DriveLetter

        # Ignore volumes without a drive letter
        if (-not $driveLetter) {
            continue
        }

        $drive = "$driveLetter`:"

        $volumeName = $volume.FileSystemLabel

        $totalSpace = [double]$volume.Size
        $freeSpace = [double]$volume.SizeRemaining

        $totalGb = [math]::Round(
            ($totalSpace / 1GB),
            2
        )

        $freeGb = [math]::Round(
            ($freeSpace / 1GB),
            2
        )

        $logicalDiskInfo += @{
            drive = $drive

            volumeName = if ($volumeName) {
                $volumeName.ToString().Trim()
            }
            else {
                $null
            }

            totalSpaceGb = $totalGb
            freeSpaceGb = $freeGb
        }

        Write-Log `
            "Drive $drive : Total=$totalGb GB | Free=$freeGb GB"
    }

    # --------------------------------------------------------
    # Process every physical disk
    # --------------------------------------------------------

    foreach ($disk in $physicalDisks) {

        $diskNumber = [int]$disk.Number

        $model = if ($disk.FriendlyName) {
            $disk.FriendlyName.ToString().Trim()
        }
        else {
            "Unknown"
        }

        $diskSize = [double]$disk.Size

        # ----------------------------------------------------
        # Detect disk type
        # ----------------------------------------------------

        $diskType = "HDD"

        if ($model -match "NVMe|NVME") {

            $diskType = "NVME"
        }
        elseif ($model -match "SSD") {

            $diskType = "SSD"
        }

        # ----------------------------------------------------
        # Get partitions belonging to this physical disk
        # ----------------------------------------------------

        $diskPartitions = @(
            $partitions |
            Where-Object {
                [int]$_.DiskNumber -eq $diskNumber
            }
        )

        # ----------------------------------------------------
        # Calculate free space
        # from volumes belonging to this disk
        # ----------------------------------------------------

        $freeBytes = [double]0

        foreach ($partition in $diskPartitions) {

            # Only partitions with drive letters
            if (-not $partition.DriveLetter) {
                continue
            }

            $driveLetter = "$($partition.DriveLetter):"

            # Find corresponding volume
            $volume = $volumes |
                Where-Object {
                    $_.DriveLetter -eq $partition.DriveLetter
                } |
                Select-Object -First 1

            if ($volume) {

                $volumeFreeSpace = [double]$volume.SizeRemaining

                $freeBytes += $volumeFreeSpace

                Write-Log `
                    "Disk $diskNumber -> $driveLetter : Free=$([math]::Round(($volumeFreeSpace / 1GB), 2)) GB"
            }
        }

        # ----------------------------------------------------
        # Convert physical disk values to GB
        # ----------------------------------------------------

        $totalGb = [math]::Round(
            ($diskSize / 1GB),
            2
        )

        $freeGb = [math]::Round(
            ($freeBytes / 1GB),
            2
        )

        # ----------------------------------------------------
        # Add physical disk
        # ----------------------------------------------------

        $diskDrives += @{
            type = $diskType

            model = $model

            serialNumber = Get-NormalizedSerialNumber $disk.SerialNumber

            totalSpaceGb = $totalGb

            freeSpaceGb = $freeGb
        }

        Write-Log `
            "Physical disk '$model' : Total=$totalGb GB | Free=$freeGb GB"
    }

    Write-Log `
        "Physical disks detected: $($diskDrives.Count)"

    Write-Log `
        "Logical disks detected: $($logicalDiskInfo.Count)"
}
catch {

    Write-Log `
        "Disk collection failed: $($_.Exception.Message)" `
        "WARN"
}

# ============================================================
# 6. INSTALLED SOFTWARE
# ============================================================

Write-Log ""
Write-Log "Collecting installed software..."

$softwareList = @()

try {

    $uninstallPaths = @(
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    $installedApps = @()

    foreach ($path in $uninstallPaths) {

        if (Test-Path $path) {

            $apps = Get-ItemProperty $path |
                Where-Object {

                    $name = Get-SafeProperty `
                        $_ `
                        "DisplayName" `
                        $null

                    $null -ne $name
                }

            $installedApps += $apps
        }
    }

    $installedApps = $installedApps |
        Sort-Object DisplayName -Unique

    foreach ($app in $installedApps) {

        $appName = Get-SafeProperty `
            $app `
            "DisplayName" `
            $null

        if ($appName) {

            $softwareList += @{
                name = $appName

                version = Get-SafeProperty `
                    $app `
                    "DisplayVersion" `
                    "Unknown"

                publisher = Get-SafeProperty `
                    $app `
                    "Publisher" `
                    $null

                installDate = Get-SafeProperty `
                    $app `
                    "InstallDate" `
                    $null
            }
        }
    }

    Write-Log `
        "Software found: $($softwareList.Count)"
}
catch {

    Write-Log `
        "Software collection failed: $($_.Exception.Message)" `
        "WARN"
}

# ============================================================
# 7. GIT CONFIGURATION
# ============================================================

Write-Log ""
Write-Log "Checking Git..."

$gitConfig = $null

try {

    $gitExe = Get-Command git `
        -ErrorAction SilentlyContinue

    if ($gitExe) {

        $gitVersionRaw = & git --version 2>$null

        $gitUserNameRaw = `
            & git config --global user.name 2>$null

        $gitUserEmailRaw = `
            & git config --global user.email 2>$null

        $gitVersion = if ($gitVersionRaw) {
            $gitVersionRaw.ToString().Trim()
        }
        else {
            $null
        }

        $gitUserName = if ($gitUserNameRaw) {
            $gitUserNameRaw.ToString().Trim()
        }
        else {
            $null
        }

        $gitUserEmail = if ($gitUserEmailRaw) {
            $gitUserEmailRaw.ToString().Trim()
        }
        else {
            $null
        }

        $sshKeys = @()

        $sshDir = Join-Path `
            $env:USERPROFILE `
            ".ssh"

        if (Test-Path $sshDir) {

            $pubKeys = Get-ChildItem `
                "$sshDir\*.pub" `
                -ErrorAction SilentlyContinue

            foreach ($key in $pubKeys) {

                $sshKeys += $key.BaseName
            }
        }

        $gitConfig = @{
            userName      = $gitUserName
            userEmail     = $gitUserEmail
            gitVersion    = $gitVersion
            sshPublicKeys = $sshKeys
        }

        Write-Log `
            "Git detected: $gitVersion"
    }
    else {

        Write-Log "Git is not installed" "WARN"
    }
}
catch {

    Write-Log `
        "Git collection failed: $($_.Exception.Message)" `
        "WARN"
}

# ============================================================
# 8. BUILD PAYLOAD
# ============================================================

Write-Log ""
Write-Log "Building inventory payload..."

$payloadObject = @{
    computerName = $computerName
    loggedInUser = $loggedInUser
    osName       = $osName
    osVersion    = $osVersion
    osBuild      = $osBuild
    domain       = $domain
    cpu          = $cpuInfo
    motherboard  = $motherboardInfo
    ramModules   = $ramModules
    disks        = $diskDrives
    software     = $softwareList
    gitConfig    = $gitConfig
}

$payloadJson = $payloadObject |
    ConvertTo-Json -Depth 10

Write-Log `
    "Payload size: $($payloadJson.Length) bytes"

if ($JsonOutputPath) {

    $jsonFullPath = [System.IO.Path]::GetFullPath($JsonOutputPath)
    $jsonDirectory = [System.IO.Path]::GetDirectoryName($jsonFullPath)

    if ($jsonDirectory -and -not (Test-Path -LiteralPath $jsonDirectory)) {
        [System.IO.Directory]::CreateDirectory($jsonDirectory) | Out-Null
    }

    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText(
        $jsonFullPath,
        $payloadJson,
        $utf8WithoutBom
    )

    Write-Log "JSON saved to: $jsonFullPath" "SUCCESS"
}

if ($ExportJsonOnly) {
    if (-not $JsonOutputPath) {
        throw "JsonOutputPath is required when ExportJsonOnly is specified."
    }

    Write-Log "Export-only mode: inventory was not sent to the API."
    return
}

# ============================================================
# 9. TEST API CONNECTION
# ============================================================

Write-Log ""
Write-Log "Testing connection to API..."

try {

    $uri = [System.Uri]$ApiEndpoint

    $connectionTest = Test-NetConnection `
        -ComputerName $uri.Host `
        -Port $uri.Port `
        -WarningAction SilentlyContinue

    if ($connectionTest.TcpTestSucceeded) {

        Write-Log `
            "TCP connection successful: $($uri.Host):$($uri.Port)" `
            "SUCCESS"
    }
    else {

        throw `
            "Cannot connect to $($uri.Host):$($uri.Port)"
    }
}
catch {

    Write-Log `
        "API connectivity test failed: $($_.Exception.Message)" `
        "ERROR"

    exit 1
}

# ============================================================
# 10. POST INVENTORY
# ============================================================

Write-Log ""
Write-Log "Uploading inventory..."
Write-Log "POST $ApiEndpoint"

try {

    if ($SkipCertValidation) {

        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {
            $true
        }
    }

    # IMPORTANT:
    # Keep this on ONE line.
    $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($payloadJson)

    $request = [System.Net.HttpWebRequest]::Create(
        $ApiEndpoint
    )

    $request.Method = "POST"

    $request.ContentType = `
        "application/json; charset=utf-8"

    $request.Accept = "application/json"

    $request.ContentLength = `
        $utf8Bytes.Length

    $request.Timeout = 30000

    $request.ReadWriteTimeout = 30000

    $request.UserAgent = `
        "ITAM-Inventory-Agent/1.0"

    $requestStream = $request.GetRequestStream()

    try {

        $requestStream.Write(
            $utf8Bytes,
            0,
            $utf8Bytes.Length
        )
    }
    finally {

        $requestStream.Close()
    }

    $response = $request.GetResponse()

    try {

        $statusCode = [int]$response.StatusCode

        $statusDescription = `
            $response.StatusDescription

        $reader = New-Object `
            System.IO.StreamReader(
                $response.GetResponseStream()
            )

        try {

            $responseBody = `
                $reader.ReadToEnd()
        }
        finally {

            $reader.Close()
        }
    }
    finally {

        $response.Close()
    }

    Write-Log ""
    Write-Log `
        "HTTP Status: $statusCode $statusDescription"

    if ($responseBody) {

        Write-Log "Server Response:"
        Write-Host $responseBody
    }

    if ($statusCode -ge 200 -and $statusCode -lt 300) {

        Write-Log ""
        Write-Log `
            "Inventory uploaded successfully!" `
            "SUCCESS"
    }
    else {

        Write-Log `
            "Server returned HTTP $statusCode" `
            "ERROR"

        exit 1
    }
}
catch {

    Write-Log ""
    Write-Log "UPLOAD FAILED" "ERROR"

    Write-Log `
        "Error: $($_.Exception.Message)" `
        "ERROR"

    # ========================================================
    # READ HTTP ERROR RESPONSE
    # ========================================================

    if ($_.Exception.Response) {

        try {

            $errorResponse = $_.Exception.Response

            Write-Log `
                "HTTP Status: $([int]$errorResponse.StatusCode) $($errorResponse.StatusDescription)" `
                "ERROR"

            $errorStream = `
                $errorResponse.GetResponseStream()

            $errorReader = New-Object `
                System.IO.StreamReader(
                    $errorStream
                )

            try {

                $errorBody = `
                    $errorReader.ReadToEnd()

                if ($errorBody) {

                    Write-Log `
                        "Server Error Response:" `
                        "ERROR"

                    Write-Host $errorBody
                }
            }
            finally {

                $errorReader.Close()
                $errorStream.Close()
            }
        }
        catch {

            Write-Log `
                "Could not read server error response: $($_.Exception.Message)" `
                "WARN"
        }
    }

    exit 1
}

# ============================================================
# END
# ============================================================

Write-Log ""
Write-Log "=============================================="
Write-Log " Inventory collection completed"
Write-Log "=============================================="
Write-Log `
    "Inventory agent finished successfully." `
    "SUCCESS"
