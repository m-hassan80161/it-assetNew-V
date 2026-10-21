namespace Itam.Agent.Core;

public sealed record OperatingSystemData(
    string? Name,
    string? Version,
    string? Build);

public sealed record ComputerSystemData(
    bool PartOfDomain,
    string? Domain);

public sealed record ProcessorData(
    string? Name,
    uint? NumberOfCores,
    uint? NumberOfLogicalProcessors,
    uint? MaxClockSpeedMhz,
    uint? Architecture);

public sealed record MotherboardData(
    string? Manufacturer,
    string? Model,
    string? SerialNumber);

public sealed record MemoryModuleData(
    ulong? CapacityBytes,
    uint? SpeedMhz,
    string? SerialNumber,
    string? Slot);

public sealed record PhysicalDiskData(
    string? DeviceId,
    string? SerialNumber,
    uint? MediaType,
    uint? BusType,
    ulong? SizeBytes);

public sealed record DiskPartitionData(
    uint? DiskNumber,
    string? DriveLetter);

public sealed record VolumeData(
    string? DriveLetter,
    ulong? SizeBytes,
    ulong? SizeRemainingBytes);

public sealed record InstalledSoftwareData(
    string? Name,
    string? Version,
    string? Publisher,
    string? InstallDate);

public sealed record NetworkAddressData(
    string Address,
    int? PrefixLength);

public sealed record NetworkAdapterData(
    string Name,
    string Description,
    string InterfaceKind,
    string? MacAddress,
    IReadOnlyList<NetworkAddressData> IpAddresses);

public interface IInventoryDataSource
{
    string GetComputerName();
    OperatingSystemData GetOperatingSystem();
    ComputerSystemData GetComputerSystem();
    IReadOnlyList<ProcessorData> GetProcessors();
    IReadOnlyList<MotherboardData> GetMotherboards();
    IReadOnlyList<MemoryModuleData> GetMemoryModules();
    IReadOnlyList<PhysicalDiskData> GetPhysicalDisks();
    IReadOnlyList<DiskPartitionData> GetDiskPartitions();
    IReadOnlyList<VolumeData> GetVolumes();
    IReadOnlyList<InstalledSoftwareData> GetInstalledSoftware();
    IReadOnlyList<NetworkAdapterData> GetNetworkAdapters();
}

public sealed record CollectorOutcome(
    string Name,
    bool Succeeded,
    long DurationMilliseconds,
    string? ErrorType);

public sealed record InventoryCollectionResult(
    Itam.Agent.Contracts.InventoryPayload? Payload,
    IReadOnlyList<CollectorOutcome> Collectors);
