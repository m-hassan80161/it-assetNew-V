using System.Text.Json;
using Itam.Agent.Contracts;

var assertions = new ContractAssertions();
assertions.ReferencePayloadRoundTrips();
assertions.OptionalFieldsAndEmptyCollectionsKeepTheirSemantics();
assertions.NetworkInterfaceContractUsesExactNamesAndEnumValues();
assertions.UnexpectedFieldsAreRejected();
Console.WriteLine($"Contract tests passed: {assertions.Count} assertions.");

internal sealed class ContractAssertions
{
    private int _count;

    public int Count => _count;

    public void ReferencePayloadRoundTrips()
    {
        var fixturePath = Path.Combine(
            AppContext.BaseDirectory,
            "Fixtures",
            "sample-inventory-payload.json");
        var fixture = File.ReadAllText(fixturePath);
        var payload = InventoryJson.Deserialize(fixture);
        var serialized = InventoryJson.Serialize(payload);

        AssertJsonEqual(
            JsonDocument.Parse(fixture).RootElement,
            JsonDocument.Parse(serialized).RootElement,
            "Reference fixture round-trip");
        Equal("WORKSTATION-01", payload.ComputerName, "Computer name");
        Equal(12, payload.Cpu.Cores, "CPU cores");
        Equal(2, payload.RamModules.Count, "RAM array length");
        Equal(4, payload.Software.Count, "Software array length");
        Equal("2024-09-01", payload.Software[0].InstallDate, "Install date stays text");
    }

    public void OptionalFieldsAndEmptyCollectionsKeepTheirSemantics()
    {
        var payload = new InventoryPayload
        {
            ComputerName = "TEST-HOST",
            Cpu = new CpuInventory
            {
                Model = "Test CPU",
                Cores = 1,
                Threads = 1,
                ClockSpeedMhz = 1000,
                Architecture = "x64",
            },
            Motherboard = new MotherboardInventory
            {
                Manufacturer = "Test",
                Model = "Test Board",
            },
            RamModules = [],
            Disks = [],
            Software = [],
            NetworkInterfaces = [],
        };

        using var document = JsonDocument.Parse(InventoryJson.Serialize(payload));
        var root = document.RootElement;
        HasProperty(root, "computerName");
        HasProperty(root, "cpu");
        HasProperty(root, "motherboard");
        HasProperty(root, "ramModules");
        HasProperty(root, "disks");
        HasProperty(root, "software");
        HasProperty(root, "networkInterfaces");
        IsEmptyArray(root.GetProperty("ramModules"), "ramModules");
        IsEmptyArray(root.GetProperty("disks"), "disks");
        IsEmptyArray(root.GetProperty("software"), "software");
        IsEmptyArray(root.GetProperty("networkInterfaces"), "networkInterfaces");
        DoesNotHaveProperty(root, "loggedInUser");
        DoesNotHaveProperty(root.GetProperty("motherboard"), "serialNumber");

        var omittedNetworkSnapshot = InventoryJson.Serialize(
            new InventoryPayload
            {
                ComputerName = payload.ComputerName,
                Cpu = payload.Cpu,
                Motherboard = payload.Motherboard,
                RamModules = payload.RamModules,
                Disks = payload.Disks,
                Software = payload.Software,
            });
        using var omittedDocument = JsonDocument.Parse(omittedNetworkSnapshot);
        DoesNotHaveProperty(omittedDocument.RootElement, "networkInterfaces");
    }

    public void NetworkInterfaceContractUsesExactNamesAndEnumValues()
    {
        var payload = new InventoryPayload
        {
            ComputerName = "NETWORK-HOST",
            Cpu = new CpuInventory
            {
                Model = "Test CPU",
                Cores = 1,
                Threads = 1,
                ClockSpeedMhz = 1000,
                Architecture = "x64",
            },
            Motherboard = new MotherboardInventory
            {
                Manufacturer = "Test",
                Model = "Test Board",
            },
            RamModules = [],
            Disks = [],
            Software = [],
            NetworkInterfaces =
            [
                new NetworkInterfaceInventory
                {
                    Name = "Ethernet",
                    InterfaceType = NetworkInterfaceInventoryType.ETHERNET,
                    MacAddress = "A4:BB:6D:12:34:56",
                    IpAddresses =
                    [
                        new NetworkAddressInventory
                        {
                            Address = "10.22.28.45",
                            PrefixLength = 24,
                        },
                    ],
                },
                new NetworkInterfaceInventory
                {
                    Name = "VPN",
                    InterfaceType = NetworkInterfaceInventoryType.VPN,
                    IpAddresses = [],
                },
            ],
        };

        using var document = JsonDocument.Parse(InventoryJson.Serialize(payload));
        var networkInterfaces = document.RootElement.GetProperty("networkInterfaces");
        Equal(2, networkInterfaces.GetArrayLength(), "Network interface count");
        var ethernet = networkInterfaces[0];
        HasProperty(ethernet, "interfaceType");
        HasProperty(ethernet, "macAddress");
        HasProperty(ethernet, "ipAddresses");
        Equal("ETHERNET", ethernet.GetProperty("interfaceType").GetString(), "Ethernet enum");
        Equal("A4:BB:6D:12:34:56", ethernet.GetProperty("macAddress").GetString(), "MAC");
        Equal("10.22.28.45", ethernet.GetProperty("ipAddresses")[0].GetProperty("address").GetString(), "IP address");
        Equal(24, ethernet.GetProperty("ipAddresses")[0].GetProperty("prefixLength").GetInt32(), "Prefix");
        Equal("VPN", networkInterfaces[1].GetProperty("interfaceType").GetString(), "VPN enum");
        IsEmptyArray(networkInterfaces[1].GetProperty("ipAddresses"), "empty interface addresses");
    }

    public void UnexpectedFieldsAreRejected()
    {
        const string unknownFieldPayload =
            """
            {
              "computerName": "TEST",
              "cpu": {},
              "motherboard": {},
              "ramModules": [],
              "disks": [],
              "software": [],
              "unexpectedIdentity": "must-not-be-silently-serialized"
            }
            """;

        Throws<JsonException>(
            () => InventoryJson.Deserialize(unknownFieldPayload),
            "Unknown inventory property");
    }

    private void AssertJsonEqual(JsonElement expected, JsonElement actual, string name)
    {
        if (expected.ValueKind != actual.ValueKind)
        {
            throw new InvalidOperationException($"{name}: JSON kinds differ.");
        }

        switch (expected.ValueKind)
        {
            case JsonValueKind.Object:
                var expectedProperties = expected.EnumerateObject()
                    .OrderBy(property => property.Name, StringComparer.Ordinal)
                    .ToArray();
                var actualProperties = actual.EnumerateObject()
                    .OrderBy(property => property.Name, StringComparer.Ordinal)
                    .ToArray();
                Equal(expectedProperties.Length, actualProperties.Length, $"{name} property count");
                for (var index = 0; index < expectedProperties.Length; index++)
                {
                    Equal(expectedProperties[index].Name, actualProperties[index].Name, $"{name} property name");
                    AssertJsonEqual(
                        expectedProperties[index].Value,
                        actualProperties[index].Value,
                        $"{name}.{expectedProperties[index].Name}");
                }
                break;
            case JsonValueKind.Array:
                Equal(expected.GetArrayLength(), actual.GetArrayLength(), $"{name} array length");
                for (var index = 0; index < expected.GetArrayLength(); index++)
                {
                    AssertJsonEqual(expected[index], actual[index], $"{name}[{index}]");
                }
                break;
            case JsonValueKind.Number:
                Equal(expected.GetDecimal(), actual.GetDecimal(), name);
                break;
            case JsonValueKind.String:
                Equal(expected.GetString(), actual.GetString(), name);
                break;
            case JsonValueKind.True:
            case JsonValueKind.False:
                Equal(expected.GetBoolean(), actual.GetBoolean(), name);
                break;
            case JsonValueKind.Null:
                _count++;
                break;
            default:
                throw new InvalidOperationException($"{name}: unsupported JSON value.");
        }
    }

    private void HasProperty(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out _))
        {
            throw new InvalidOperationException($"Expected property '{propertyName}'.");
        }
        _count++;
    }

    private void DoesNotHaveProperty(JsonElement element, string propertyName)
    {
        if (element.TryGetProperty(propertyName, out _))
        {
            throw new InvalidOperationException($"Did not expect property '{propertyName}'.");
        }
        _count++;
    }

    private void IsEmptyArray(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.Array || element.GetArrayLength() != 0)
        {
            throw new InvalidOperationException($"{name} must be an empty JSON array.");
        }
        _count++;
    }

    private void Equal<T>(T expected, T actual, string name)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
        {
            throw new InvalidOperationException(
                $"{name}: expected '{expected}', got '{actual}'.");
        }
        _count++;
    }

    private void Throws<TException>(Action action, string name)
        where TException : Exception
    {
        try
        {
            action();
        }
        catch (TException)
        {
            _count++;
            return;
        }
        throw new InvalidOperationException($"{name}: expected {typeof(TException).Name}.");
    }
}
