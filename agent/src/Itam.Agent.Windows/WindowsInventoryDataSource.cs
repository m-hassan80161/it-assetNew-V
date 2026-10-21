using System.Globalization;
using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.Versioning;
using Microsoft.Win32;
using Itam.Agent.Core;

namespace Itam.Agent.Windows;

[SupportedOSPlatform("windows")]
public sealed class WindowsInventoryDataSource : IInventoryDataSource
{
    private const string CimV2 = @"\\.\root\cimv2";
    private const string Storage = @"\\.\root\Microsoft\Windows\Storage";

    public string GetComputerName() => Environment.MachineName;

    public OperatingSystemData GetOperatingSystem()
    {
        var row = Query(CimV2, "SELECT Caption, Version, BuildNumber FROM Win32_OperatingSystem")
            .FirstOrDefault();
        return new OperatingSystemData(
            GetString(row, "Caption"),
            GetString(row, "Version"),
            GetString(row, "BuildNumber"));
    }

    public ComputerSystemData GetComputerSystem()
    {
        var row = Query(CimV2, "SELECT PartOfDomain, Domain FROM Win32_ComputerSystem")
            .FirstOrDefault();
        return new ComputerSystemData(
            GetBoolean(row, "PartOfDomain"),
            GetString(row, "Domain"));
    }

    public IReadOnlyList<ProcessorData> GetProcessors() =>
        Query(CimV2,
                "SELECT Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, Architecture FROM Win32_Processor")
            .Select(row => new ProcessorData(
                GetString(row, "Name"),
                GetUInt32(row, "NumberOfCores"),
                GetUInt32(row, "NumberOfLogicalProcessors"),
                GetUInt32(row, "MaxClockSpeed"),
                GetUInt32(row, "Architecture")))
            .ToArray();

    public IReadOnlyList<MotherboardData> GetMotherboards() =>
        Query(CimV2, "SELECT Manufacturer, Product, SerialNumber FROM Win32_BaseBoard")
            .Select(row => new MotherboardData(
                GetString(row, "Manufacturer"),
                GetString(row, "Product"),
                GetString(row, "SerialNumber")))
            .ToArray();

    public IReadOnlyList<MemoryModuleData> GetMemoryModules() =>
        Query(CimV2, "SELECT Capacity, Speed, SerialNumber, BankLabel FROM Win32_PhysicalMemory")
            .Select(row => new MemoryModuleData(
                GetUInt64(row, "Capacity"),
                GetUInt32(row, "Speed"),
                GetString(row, "SerialNumber"),
                GetString(row, "BankLabel")))
            .ToArray();

    public IReadOnlyList<PhysicalDiskData> GetPhysicalDisks() =>
        Query(Storage, "SELECT DeviceId, SerialNumber, MediaType, BusType, Size FROM MSFT_PhysicalDisk")
            .Select(row => new PhysicalDiskData(
                GetString(row, "DeviceId"),
                GetString(row, "SerialNumber"),
                GetUInt32(row, "MediaType"),
                GetUInt32(row, "BusType"),
                GetUInt64(row, "Size")))
            .ToArray();

    public IReadOnlyList<DiskPartitionData> GetDiskPartitions() =>
        Query(Storage, "SELECT DiskNumber, DriveLetter FROM MSFT_Partition")
            .Select(row => new DiskPartitionData(
                GetUInt32(row, "DiskNumber"),
                GetString(row, "DriveLetter")))
            .ToArray();

    public IReadOnlyList<VolumeData> GetVolumes() =>
        Query(Storage, "SELECT DriveLetter, Size, SizeRemaining FROM MSFT_Volume")
            .Select(row => new VolumeData(
                GetString(row, "DriveLetter"),
                GetUInt64(row, "Size"),
                GetUInt64(row, "SizeRemaining")))
            .ToArray();

    public IReadOnlyList<InstalledSoftwareData> GetInstalledSoftware()
    {
        var views = Environment.Is64BitOperatingSystem
            ? new[] { RegistryView.Registry64, RegistryView.Registry32 }
            : new[] { RegistryView.Registry32 };
        var results = new List<InstalledSoftwareData>();

        foreach (var view in views)
        {
            using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            using var uninstallKey = baseKey.OpenSubKey(
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
            if (uninstallKey is null)
            {
                continue;
            }

            foreach (var subKeyName in uninstallKey.GetSubKeyNames())
            {
                using var applicationKey = uninstallKey.OpenSubKey(subKeyName);
                var name = applicationKey?.GetValue("DisplayName")?.ToString()?.Trim();
                if (string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                results.Add(new InstalledSoftwareData(
                    name,
                    applicationKey?.GetValue("DisplayVersion")?.ToString(),
                    applicationKey?.GetValue("Publisher")?.ToString(),
                    applicationKey?.GetValue("InstallDate")?.ToString()));
            }
        }

        return results;
    }

    public IReadOnlyList<NetworkAdapterData> GetNetworkAdapters()
    {
        var adapters = new List<NetworkAdapterData>();
        foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
        {
            var addresses = adapter.GetIPProperties().UnicastAddresses
                .Select(address => new NetworkAddressData(
                    address.Address.ToString(),
                    address.PrefixLength))
                .ToArray();

            adapters.Add(new NetworkAdapterData(
                adapter.Name,
                adapter.Description,
                adapter.NetworkInterfaceType.ToString(),
                adapter.GetPhysicalAddress().ToString(),
                addresses));
        }

        return adapters;
    }

    private static IReadOnlyList<IReadOnlyDictionary<string, object?>> Query(
        string scopePath,
        string query)
    {
        var scope = new ManagementScope(scopePath);
        using var searcher = new ManagementObjectSearcher(scope, new ObjectQuery(query));
        using var results = searcher.Get();
        var rows = new List<IReadOnlyDictionary<string, object?>>();

        foreach (ManagementObject item in results)
        {
            using (item)
            {
                var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                foreach (PropertyData property in item.Properties)
                {
                    row[property.Name] = property.Value;
                }

                rows.Add(row);
            }
        }

        return rows;
    }

    private static string? GetString(
        IReadOnlyDictionary<string, object?>? row,
        string propertyName) =>
        row is not null && row.TryGetValue(propertyName, out var value)
            ? value?.ToString()?.Trim()
            : null;

    private static uint? GetUInt32(
        IReadOnlyDictionary<string, object?>? row,
        string propertyName)
    {
        if (row is null || !row.TryGetValue(propertyName, out var value) || value is null)
        {
            return null;
        }

        return Convert.ToUInt32(value, CultureInfo.InvariantCulture);
    }

    private static ulong? GetUInt64(
        IReadOnlyDictionary<string, object?>? row,
        string propertyName)
    {
        if (row is null || !row.TryGetValue(propertyName, out var value) || value is null)
        {
            return null;
        }

        return Convert.ToUInt64(value, CultureInfo.InvariantCulture);
    }

    private static bool GetBoolean(
        IReadOnlyDictionary<string, object?>? row,
        string propertyName)
    {
        if (row is null || !row.TryGetValue(propertyName, out var value) || value is null)
        {
            return false;
        }

        return Convert.ToBoolean(value, CultureInfo.InvariantCulture);
    }
}
