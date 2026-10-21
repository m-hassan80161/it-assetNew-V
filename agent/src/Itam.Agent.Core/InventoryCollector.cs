using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using Itam.Agent.Contracts;

namespace Itam.Agent.Core;

public sealed class InventoryCollector(IInventoryDataSource source)
{
    private const double BytesPerGigabyte = 1024d * 1024d * 1024d;

    public InventoryCollectionResult Collect()
    {
        var outcomes = new List<CollectorOutcome>();

        var identity = Execute("computer", source.GetComputerName, outcomes);
        var operatingSystem = Execute("operatingSystem", source.GetOperatingSystem, outcomes);
        var computerSystem = Execute("computerSystem", source.GetComputerSystem, outcomes);
        var processors = Execute("cpu", source.GetProcessors, outcomes);
        var motherboards = Execute("motherboard", source.GetMotherboards, outcomes);
        var memory = Execute("ram", source.GetMemoryModules, outcomes);
        var disks = Execute("disks", CollectDisks, outcomes);
        var software = Execute("software", CollectSoftware, outcomes);
        var network = Execute("network", CollectNetworkInterfaces, outcomes);

        var requiredCollectorsSucceeded =
            identity.Succeeded &&
            processors.Succeeded &&
            motherboards.Succeeded &&
            memory.Succeeded &&
            disks.Succeeded &&
            software.Succeeded &&
            !string.IsNullOrWhiteSpace(identity.Value);

        if (!requiredCollectorsSucceeded)
        {
            return new InventoryCollectionResult(null, outcomes);
        }

        var cpu = CreateCpu(processors.Value!);
        var motherboard = CreateMotherboard(motherboards.Value!);
        var ramModules = CreateRamModules(memory.Value!);

        return new InventoryCollectionResult(
            new InventoryPayload
            {
                ComputerName = identity.Value!.Trim(),
                OsName = operatingSystem.Succeeded ? CleanOptional(operatingSystem.Value?.Name) : null,
                OsVersion = operatingSystem.Succeeded ? CleanOptional(operatingSystem.Value?.Version) : null,
                OsBuild = operatingSystem.Succeeded ? CleanOptional(operatingSystem.Value?.Build) : null,
                Domain = computerSystem.Succeeded && computerSystem.Value!.PartOfDomain
                    ? CleanOptional(computerSystem.Value.Domain)
                    : null,
                Cpu = cpu,
                Motherboard = motherboard,
                RamModules = ramModules,
                Disks = disks.Value!,
                Software = software.Value!,
                NetworkInterfaces = network.Succeeded ? network.Value : null,
            },
            outcomes);
    }

    private IReadOnlyList<DiskInventory> CollectDisks()
    {
        var physicalDisks = source.GetPhysicalDisks();
        var partitions = source.GetDiskPartitions();
        var volumes = source.GetVolumes();
        var volumesWithLetters = volumes
            .Where(volume => !string.IsNullOrWhiteSpace(volume.DriveLetter))
            .Select(volume => (Drive: NormalizeDriveLetter(volume.DriveLetter!), Volume: volume))
            .ToArray();
        if (volumesWithLetters
            .GroupBy(item => item.Drive, StringComparer.OrdinalIgnoreCase)
            .Any(group => group.Count() > 1))
        {
            throw new InvalidDataException("A drive letter was reported by multiple volumes.");
        }

        var volumesByDrive = volumesWithLetters.ToDictionary(
            item => item.Drive,
            item => item.Volume,
            StringComparer.OrdinalIgnoreCase);
        if (partitions.Any(partition =>
                !string.IsNullOrWhiteSpace(partition.DriveLetter) &&
                !partition.DiskNumber.HasValue))
        {
            throw new InvalidDataException("A mounted partition was missing its physical disk number.");
        }

        var partitionsByDisk = partitions
            .Where(partition => partition.DiskNumber.HasValue)
            .GroupBy(partition => partition.DiskNumber!.Value)
            .ToDictionary(group => group.Key, group => group.ToArray());
        var results = new List<DiskInventory>(physicalDisks.Count);

        foreach (var disk in physicalDisks)
        {
            if (!uint.TryParse(disk.DeviceId, NumberStyles.None, CultureInfo.InvariantCulture, out var diskNumber) ||
                !disk.SizeBytes.HasValue ||
                disk.SizeBytes.Value == 0)
            {
                throw new InvalidDataException("A physical disk was missing required capacity or identity data.");
            }

            var freeBytes = 0UL;
            var countedDrives = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (partitionsByDisk.TryGetValue(diskNumber, out var diskPartitions))
            {
                foreach (var partition in diskPartitions)
                {
                    if (string.IsNullOrWhiteSpace(partition.DriveLetter))
                    {
                        continue;
                    }

                    var drive = NormalizeDriveLetter(partition.DriveLetter);
                    if (!countedDrives.Add(drive) || !volumesByDrive.TryGetValue(drive, out var volume))
                    {
                        continue;
                    }

                    if (!volume.SizeRemainingBytes.HasValue)
                    {
                        throw new InvalidDataException("A mounted volume was missing its free-space value.");
                    }

                    freeBytes = checked(freeBytes + volume.SizeRemainingBytes.Value);
                }
            }

            results.Add(new DiskInventory
            {
                Type = GetDiskType(disk.MediaType, disk.BusType),
                SerialNumber = CleanOptional(disk.SerialNumber),
                TotalSpaceGb = ToGigabytes(disk.SizeBytes.Value),
                FreeSpaceGb = ToGigabytes(freeBytes),
            });
        }

        return results;
    }

    private IReadOnlyList<SoftwareInventory> CollectSoftware()
    {
        var installedSoftware = source.GetInstalledSoftware();
        var unique = new Dictionary<string, SoftwareInventory>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in installedSoftware)
        {
            var name = CleanOptional(item.Name);
            if (name is null)
            {
                continue;
            }

            var version = CleanOptional(item.Version) ?? "Unknown";
            var publisher = CleanOptional(item.Publisher);
            var identity = $"{name}\0{version}\0{publisher}";
            unique.TryAdd(identity, new SoftwareInventory
            {
                Name = name,
                Version = version,
                Publisher = publisher,
                InstallDate = NormalizeInstallDate(item.InstallDate),
            });
        }

        return unique.Values
            .OrderBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.Version, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private IReadOnlyList<NetworkInterfaceInventory> CollectNetworkInterfaces()
    {
        var adapters = source.GetNetworkAdapters()
            .OrderBy(adapter => adapter.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var results = new List<NetworkInterfaceInventory>();
        var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenMacAddresses = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var adapter in adapters)
        {
            var name = adapter.Name.Trim();
            if (IsLoopback(adapter, name))
            {
                continue;
            }

            if (name.Length == 0 || name.Length > 255)
            {
                throw new InvalidDataException("A network adapter name was invalid.");
            }

            var addresses = NormalizeAddresses(adapter.IpAddresses);
            var macAddress = NormalizeMacAddress(adapter.MacAddress);
            if (macAddress is not null && !seenMacAddresses.Add(macAddress))
            {
                macAddress = null;
            }

            if (macAddress is null && addresses.Count == 0)
            {
                continue;
            }

            if (!seenNames.Add(name))
            {
                throw new InvalidDataException("Network adapters contained duplicate names.");
            }

            results.Add(new NetworkInterfaceInventory
            {
                Name = name,
                InterfaceType = GetNetworkInterfaceType(adapter),
                MacAddress = macAddress,
                IpAddresses = addresses,
            });
        }

        if (results.Count > 64)
        {
            throw new InvalidDataException("The network interface count exceeded the API limit.");
        }

        return results;
    }

    private static IReadOnlyList<NetworkAddressInventory> NormalizeAddresses(
        IReadOnlyList<NetworkAddressData> addresses)
    {
        var results = new List<NetworkAddressInventory>();
        var seen = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in addresses)
        {
            if (!IPAddress.TryParse(item.Address, out var parsed))
            {
                throw new InvalidDataException("A network adapter returned an invalid IP address.");
            }

            if (IsIneligibleAddress(parsed))
            {
                continue;
            }

            var maximumPrefix = parsed.AddressFamily == AddressFamily.InterNetwork ? 32 : 128;
            if (!item.PrefixLength.HasValue ||
                item.PrefixLength.Value < 0 ||
                item.PrefixLength.Value > maximumPrefix)
            {
                throw new InvalidDataException("A network adapter returned an invalid IP prefix.");
            }

            var address = new IPAddress(parsed.GetAddressBytes()).ToString().ToLowerInvariant();
            if (seen.TryGetValue(address, out var previousPrefix))
            {
                if (previousPrefix != item.PrefixLength.Value)
                {
                    throw new InvalidDataException(
                        "A network address was reported with conflicting prefix lengths.");
                }

                continue;
            }

            seen.Add(address, item.PrefixLength.Value);
            results.Add(new NetworkAddressInventory
            {
                Address = address,
                PrefixLength = item.PrefixLength.Value,
            });
        }

        if (results.Count > 128)
        {
            throw new InvalidDataException("The network address count exceeded the API limit.");
        }

        return results;
    }

    private static CpuInventory CreateCpu(IReadOnlyList<ProcessorData> processors)
    {
        var names = processors
            .Select(processor => CleanOptional(processor.Name))
            .Where(name => name is not null)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new CpuInventory
        {
            Model = names.Length == 0 ? "Unknown" : string.Join(" / ", names),
            Cores = checked((int)processors.Sum(processor => processor.NumberOfCores ?? 0)),
            Threads = checked((int)processors.Sum(processor => processor.NumberOfLogicalProcessors ?? 0)),
            ClockSpeedMhz = checked((int)(processors.Max(processor => processor.MaxClockSpeedMhz) ?? 0)),
            Architecture = processors.Count == 0
                ? "Unknown"
                : GetArchitecture(processors[0].Architecture),
        };
    }

    private static MotherboardInventory CreateMotherboard(IReadOnlyList<MotherboardData> motherboards)
    {
        var board = motherboards.FirstOrDefault();
        return new MotherboardInventory
        {
            Manufacturer = CleanOptional(board?.Manufacturer) ?? "Unknown",
            Model = CleanOptional(board?.Model) ?? "Unknown",
            SerialNumber = CleanOptional(board?.SerialNumber),
        };
    }

    private static IReadOnlyList<RamModuleInventory> CreateRamModules(
        IReadOnlyList<MemoryModuleData> modules)
    {
        var results = new List<RamModuleInventory>(modules.Count);
        foreach (var module in modules)
        {
            if (!module.CapacityBytes.HasValue || module.CapacityBytes.Value == 0)
            {
                throw new InvalidDataException("A memory module was missing its capacity.");
            }

            results.Add(new RamModuleInventory
            {
                CapacityGb = Math.Round(module.CapacityBytes.Value / BytesPerGigabyte, 0),
                SpeedMhz = checked((int)(module.SpeedMhz ?? 0)),
                SerialNumber = CleanOptional(module.SerialNumber),
                Slot = CleanOptional(module.Slot),
            });
        }

        return results;
    }

    private static DiskInventoryType GetDiskType(uint? mediaType, uint? busType)
    {
        if (busType == 17)
        {
            return DiskInventoryType.NVME;
        }

        return mediaType switch
        {
            3 => DiskInventoryType.HDD,
            4 => DiskInventoryType.SSD,
            _ => DiskInventoryType.UNKNOWN,
        };
    }

    private static string GetArchitecture(uint? architecture) =>
        architecture switch
        {
            0 => "x86",
            1 => "MIPS",
            2 => "Alpha",
            3 => "PowerPC",
            5 => "ARM",
            6 => "ia64",
            9 => "x64",
            12 => "ARM64",
            _ => "Unknown",
        };

    private static bool IsLoopback(NetworkAdapterData adapter, string name) =>
        adapter.InterfaceKind.Equals("Loopback", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("lo", StringComparison.OrdinalIgnoreCase) ||
        name.StartsWith("loopback", StringComparison.OrdinalIgnoreCase);

    private static NetworkInterfaceInventoryType GetNetworkInterfaceType(NetworkAdapterData adapter)
    {
        var identity = $"{adapter.Name} {adapter.Description} {adapter.InterfaceKind}";
        if (ContainsAny(identity, "vpn", "tunnel", "wireguard", "tap", "tun", "anyconnect"))
        {
            return NetworkInterfaceInventoryType.VPN;
        }

        if (ContainsAny(identity, "virtual", "hyper-v", "vmware", "virtualbox", "vethernet"))
        {
            return NetworkInterfaceInventoryType.VIRTUAL;
        }

        if (ContainsAny(identity, "wireless", "wi-fi", "wifi", "wlan") ||
            adapter.InterfaceKind.Contains("Wireless80211", StringComparison.OrdinalIgnoreCase))
        {
            return NetworkInterfaceInventoryType.WIFI;
        }

        if (adapter.InterfaceKind.Contains("Ethernet", StringComparison.OrdinalIgnoreCase))
        {
            return NetworkInterfaceInventoryType.ETHERNET;
        }

        return NetworkInterfaceInventoryType.OTHER;
    }

    private static bool ContainsAny(string value, params string[] candidates) =>
        candidates.Any(candidate => value.Contains(candidate, StringComparison.OrdinalIgnoreCase));

    private static bool IsIneligibleAddress(IPAddress address)
    {
        if (IPAddress.IsLoopback(address) ||
            address.Equals(IPAddress.Any) ||
            address.Equals(IPAddress.IPv6Any) ||
            address.IsIPv6Multicast ||
            address.IsIPv4MappedToIPv6)
        {
            return true;
        }

        var bytes = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            return bytes[0] == 0 ||
                (bytes[0] >= 224 && bytes[0] <= 239) ||
                bytes.All(value => value == byte.MaxValue);
        }

        return address.IsIPv6LinkLocal && bytes.All(value => value == 0);
    }

    private static string? NormalizeMacAddress(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var compact = new string(value.Where(Uri.IsHexDigit).ToArray());
        if (compact.Length != 12 || compact.Length != value.Count(character =>
                character != ':' && character != '-'))
        {
            return null;
        }

        var bytes = Enumerable.Range(0, 6)
            .Select(index => byte.Parse(compact.AsSpan(index * 2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture))
            .ToArray();
        if (bytes.All(value => value == 0) ||
            bytes.All(value => value == byte.MaxValue) ||
            (bytes[0] & 1) == 1)
        {
            return null;
        }

        return string.Join(":", bytes.Select(value => value.ToString("X2", CultureInfo.InvariantCulture)));
    }

    private static string NormalizeDriveLetter(string value)
    {
        var drive = value.Trim().TrimEnd(':');
        if (drive.Length != 1 || !char.IsLetter(drive[0]))
        {
            throw new InvalidDataException("A disk volume returned an invalid drive letter.");
        }

        return drive.ToUpperInvariant();
    }

    private static double ToGigabytes(ulong bytes) =>
        Math.Round(bytes / BytesPerGigabyte, 2);

    private static string? NormalizeInstallDate(string? value)
    {
        var normalized = CleanOptional(value);
        if (normalized is null)
        {
            return null;
        }

        var formats = new[] { "yyyyMMdd", "yyyy-MM-dd" };
        return DateOnly.TryParseExact(
            normalized,
            formats,
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var date)
            ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : null;
    }

    private static string? CleanOptional(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrEmpty(normalized) ? null : normalized;
    }

    private static CollectorExecution<T> Execute<T>(
        string name,
        Func<T> collector,
        ICollection<CollectorOutcome> outcomes)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            var value = collector();
            stopwatch.Stop();
            outcomes.Add(new CollectorOutcome(name, true, stopwatch.ElapsedMilliseconds, null));
            return new CollectorExecution<T>(true, value);
        }
        catch (Exception exception)
        {
            stopwatch.Stop();
            outcomes.Add(new CollectorOutcome(
                name,
                false,
                stopwatch.ElapsedMilliseconds,
                exception.GetType().Name));
            return new CollectorExecution<T>(false, default);
        }
    }

    private sealed record CollectorExecution<T>(bool Succeeded, T? Value);
}
