using System.Text.Json;
using System.Text.Json.Serialization;

namespace Itam.Agent.Contracts;

public sealed class InventoryPayload
{
    [JsonPropertyName("computerName")]
    public required string ComputerName { get; init; }

    [JsonPropertyName("loggedInUser")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? LoggedInUser { get; init; }

    [JsonPropertyName("osName")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? OsName { get; init; }

    [JsonPropertyName("osVersion")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? OsVersion { get; init; }

    [JsonPropertyName("osBuild")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? OsBuild { get; init; }

    [JsonPropertyName("domain")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Domain { get; init; }

    [JsonPropertyName("cpu")]
    public required CpuInventory Cpu { get; init; }

    [JsonPropertyName("motherboard")]
    public required MotherboardInventory Motherboard { get; init; }

    [JsonPropertyName("ramModules")]
    public required IReadOnlyList<RamModuleInventory> RamModules { get; init; }

    [JsonPropertyName("disks")]
    public required IReadOnlyList<DiskInventory> Disks { get; init; }

    [JsonPropertyName("software")]
    public required IReadOnlyList<SoftwareInventory> Software { get; init; }

    [JsonPropertyName("components")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<DeviceComponentInventory>? Components { get; init; }

    [JsonPropertyName("gitConfig")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public GitConfigInventory? GitConfig { get; init; }

    [JsonPropertyName("networkInterfaces")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<NetworkInterfaceInventory>? NetworkInterfaces { get; init; }
}

public sealed class CpuInventory
{
    [JsonPropertyName("model")]
    public required string Model { get; init; }

    [JsonPropertyName("cores")]
    public required int Cores { get; init; }

    [JsonPropertyName("threads")]
    public required int Threads { get; init; }

    [JsonPropertyName("clockSpeedMhz")]
    public required int ClockSpeedMhz { get; init; }

    [JsonPropertyName("architecture")]
    public required string Architecture { get; init; }
}

public sealed class MotherboardInventory
{
    [JsonPropertyName("manufacturer")]
    public required string Manufacturer { get; init; }

    [JsonPropertyName("model")]
    public required string Model { get; init; }

    [JsonPropertyName("serialNumber")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SerialNumber { get; init; }
}

public sealed class RamModuleInventory
{
    [JsonPropertyName("capacityGb")]
    public required double CapacityGb { get; init; }

    [JsonPropertyName("speedMhz")]
    public required int SpeedMhz { get; init; }

    [JsonPropertyName("serialNumber")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SerialNumber { get; init; }

    [JsonPropertyName("slot")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Slot { get; init; }
}

public sealed class DiskInventory
{
    [JsonPropertyName("type")]
    [JsonConverter(typeof(JsonStringEnumConverter<DiskInventoryType>))]
    public required DiskInventoryType Type { get; init; }

    [JsonPropertyName("serialNumber")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SerialNumber { get; init; }

    [JsonPropertyName("totalSpaceGb")]
    public required double TotalSpaceGb { get; init; }

    [JsonPropertyName("freeSpaceGb")]
    public required double FreeSpaceGb { get; init; }
}

[JsonConverter(typeof(JsonStringEnumConverter<DiskInventoryType>))]
public enum DiskInventoryType
{
    SSD,
    HDD,
    NVME,
    UNKNOWN,
}

public sealed class SoftwareInventory
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("version")]
    public required string Version { get; init; }

    [JsonPropertyName("publisher")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Publisher { get; init; }

    [JsonPropertyName("installDate")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? InstallDate { get; init; }
}

public sealed class GitConfigInventory
{
    [JsonPropertyName("userName")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? UserName { get; init; }

    [JsonPropertyName("userEmail")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? UserEmail { get; init; }

    [JsonPropertyName("gitVersion")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? GitVersion { get; init; }

    [JsonPropertyName("sshPublicKeys")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyList<string>? SshPublicKeys { get; init; }
}

public sealed class DeviceComponentInventory
{
    [JsonPropertyName("category")]
    public required string Category { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("manufacturer")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Manufacturer { get; init; }

    [JsonPropertyName("model")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Model { get; init; }

    [JsonPropertyName("sizeInches")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? SizeInches { get; init; }

    [JsonPropertyName("details")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Details { get; init; }

    [JsonPropertyName("specifications")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyDictionary<string, string>? Specifications { get; init; }
}

public sealed class NetworkInterfaceInventory
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("interfaceType")]
    [JsonConverter(typeof(JsonStringEnumConverter<NetworkInterfaceInventoryType>))]
    public required NetworkInterfaceInventoryType InterfaceType { get; init; }

    [JsonPropertyName("macAddress")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? MacAddress { get; init; }

    [JsonPropertyName("ipAddresses")]
    public required IReadOnlyList<NetworkAddressInventory> IpAddresses { get; init; }
}

[JsonConverter(typeof(JsonStringEnumConverter<NetworkInterfaceInventoryType>))]
public enum NetworkInterfaceInventoryType
{
    ETHERNET,
    WIFI,
    VPN,
    VIRTUAL,
    OTHER,
}

public sealed class NetworkAddressInventory
{
    [JsonPropertyName("address")]
    public required string Address { get; init; }

    [JsonPropertyName("prefixLength")]
    public required int PrefixLength { get; init; }
}

public static class InventoryJson
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        WriteIndented = false,
    };

    public static string Serialize(InventoryPayload payload) =>
        JsonSerializer.Serialize(payload, SerializerOptions);

    public static InventoryPayload Deserialize(string json) =>
        JsonSerializer.Deserialize<InventoryPayload>(json, SerializerOptions)
        ?? throw new JsonException("Inventory payload was empty.");
}
