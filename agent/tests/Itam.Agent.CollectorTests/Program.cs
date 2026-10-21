using Itam.Agent.Contracts;
using Itam.Agent.Core;

var tests = new CollectorTests();
tests.CollectsCompleteHardwareSoftwareAndNetworkSnapshot();
tests.PreservesEmptyNetworkSnapshot();
tests.OmitsNetworkSnapshotWhenCollectionFails();
tests.BlocksIncompleteReplaceAllSnapshotsButRunsOtherCollectors();
tests.OmitsInvalidNetworkSnapshotWithoutBlockingInventory();
tests.OmitsUnknownDiskTypeInsteadOfGuessing();
tests.KeepsOptionalSystemMetadataFailureNonFatal();
tests.ValidatesLocalConfigurationWithoutAllowingCredentialsOrUnknownFields();
tests.RotatesBoundedStructuredLogsWithoutCreatingDirectories();
await tests.RetriesTransientFailuresWithBoundedBackoff();
await tests.DoesNotRetryPermanentFailuresOrCallerCancellation();
Console.WriteLine($"Collector tests passed: {tests.Assertions} assertions.");

internal sealed class CollectorTests
{
    public int Assertions { get; private set; }

    public void CollectsCompleteHardwareSoftwareAndNetworkSnapshot()
    {
        var source = new FakeInventoryDataSource();
        var result = new InventoryCollector(source).Collect();

        NotNull(result.Payload);
        Equal("TEST-PC", result.Payload!.ComputerName);
        Equal("Windows Test", result.Payload.OsName);
        Equal("corp.example", result.Payload.Domain);
        Equal(12, result.Payload.Cpu.Cores);
        Equal(24, result.Payload.Cpu.Threads);
        Equal("x64", result.Payload.Cpu.Architecture);
        Equal(1, result.Payload.RamModules.Count);
        Equal(16d, result.Payload.RamModules[0].CapacityGb);
        Equal(1, result.Payload.Disks.Count);
        Equal(DiskInventoryType.NVME, result.Payload.Disks[0].Type);
        Equal(100d, result.Payload.Disks[0].TotalSpaceGb);
        Equal(25d, result.Payload.Disks[0].FreeSpaceGb);
        Equal(1, result.Payload.Software.Count);
        Equal("2024-09-01", result.Payload.Software[0].InstallDate);
        Equal(5, result.Payload.NetworkInterfaces!.Count);
        var ethernet = result.Payload.NetworkInterfaces.Single(item => item.Name == "Ethernet");
        Equal(NetworkInterfaceInventoryType.ETHERNET, ethernet.InterfaceType);
        Equal("AA:BB:CC:DD:EE:FF", ethernet.MacAddress);
        Equal(2, ethernet.IpAddresses.Count);
        Equal("fe80::1", ethernet.IpAddresses[1].Address);
        Equal(NetworkInterfaceInventoryType.VIRTUAL, result.Payload.NetworkInterfaces.Single(item =>
            item.Name.StartsWith("vEthernet", StringComparison.Ordinal)).InterfaceType);
        Equal(null, result.Payload.NetworkInterfaces.Single(item =>
            item.Name.StartsWith("vEthernet", StringComparison.Ordinal)).MacAddress);
        Equal(NetworkInterfaceInventoryType.VPN, result.Payload.NetworkInterfaces.Single(item =>
            item.Name == "VPN").InterfaceType);
        Equal(NetworkInterfaceInventoryType.WIFI, result.Payload.NetworkInterfaces.Single(item =>
            item.Name == "Wi-Fi").InterfaceType);
        Equal("169.254.2.5", result.Payload.NetworkInterfaces.Single(item =>
            item.Name == "Wi-Fi").IpAddresses[0].Address);
        Equal(0, result.Payload.NetworkInterfaces.Single(item =>
            item.Name == "Disconnected Ethernet").IpAddresses.Count);
        Equal(9, result.Collectors.Count);
        Equal(true, result.Collectors.All(collector => collector.Succeeded));

        var serialized = InventoryJson.Serialize(result.Payload);
        var roundTrip = InventoryJson.Deserialize(serialized);
        Equal(result.Payload.ComputerName, roundTrip.ComputerName);
        Equal(5, roundTrip.NetworkInterfaces!.Count);
        Equal(false, serialized.Contains("\"deviceId\"", StringComparison.Ordinal));
        Equal(false, serialized.Contains("\"loggedInUser\"", StringComparison.Ordinal));
        Equal(false, serialized.Contains("\"gitConfig\"", StringComparison.Ordinal));
    }

    public void PreservesEmptyNetworkSnapshot()
    {
        var source = new FakeInventoryDataSource { NetworkAdapters = [] };
        var result = new InventoryCollector(source).Collect();

        NotNull(result.Payload);
        Equal(0, result.Payload!.NetworkInterfaces!.Count);
    }

    public void OmitsNetworkSnapshotWhenCollectionFails()
    {
        var source = new FakeInventoryDataSource { FailOn = ["network"] };
        var result = new InventoryCollector(source).Collect();

        NotNull(result.Payload);
        Equal(null, result.Payload!.NetworkInterfaces);
        Equal(false, result.Collectors.Single(item => item.Name == "network").Succeeded);
        Equal(nameof(InvalidOperationException), result.Collectors.Single(item => item.Name == "network").ErrorType);
    }

    public void BlocksIncompleteReplaceAllSnapshotsButRunsOtherCollectors()
    {
        var source = new FakeInventoryDataSource { FailOn = ["ram"] };
        var result = new InventoryCollector(source).Collect();

        Equal(null, result.Payload);
        Equal(1, source.CallCounts["disks"]);
        Equal(1, source.CallCounts["software"]);
        Equal(1, source.CallCounts["network"]);
        Equal(false, result.Collectors.Single(item => item.Name == "ram").Succeeded);
    }

    public void OmitsInvalidNetworkSnapshotWithoutBlockingInventory()
    {
        var source = new FakeInventoryDataSource
        {
            NetworkAdapters =
            [
                new NetworkAdapterData(
                    "Ethernet",
                    "Ethernet Adapter",
                    "Ethernet",
                    "001122334455",
                    [new NetworkAddressData("192.0.2.10", 33)]),
            ],
        };
        var result = new InventoryCollector(source).Collect();

        NotNull(result.Payload);
        Equal(null, result.Payload!.NetworkInterfaces);
        Equal(false, result.Collectors.Single(item => item.Name == "network").Succeeded);
    }

    public void OmitsUnknownDiskTypeInsteadOfGuessing()
    {
        var source = new FakeInventoryDataSource
        {
            PhysicalDisks = [new PhysicalDiskData("0", null, null, null, 100 * 1024UL * 1024 * 1024)],
        };
        var result = new InventoryCollector(source).Collect();

        NotNull(result.Payload);
        Equal(DiskInventoryType.UNKNOWN, result.Payload!.Disks[0].Type);
    }

    public void KeepsOptionalSystemMetadataFailureNonFatal()
    {
        var source = new FakeInventoryDataSource { FailOn = ["operatingSystem"] };
        var result = new InventoryCollector(source).Collect();

        NotNull(result.Payload);
        Equal(null, result.Payload!.OsName);
        Equal(false, result.Collectors.Single(item => item.Name == "operatingSystem").Succeeded);
    }

    public void ValidatesLocalConfigurationWithoutAllowingCredentialsOrUnknownFields()
    {
        var directory = CreateTemporaryDirectory();
        try
        {
            var validPath = WriteConfiguration(directory, "https://itam.example.invalid/api/v1");
            var configuration = AgentRuntimeConfiguration.Load(validPath);
            Equal(5 * 1024 * 1024, configuration.MaxLogFileSizeBytes);
            Equal(5, configuration.RetainedLogFiles);

            var httpPath = WriteConfiguration(directory, "http://itam.example.invalid");
            Throws<InvalidDataException>(() => AgentRuntimeConfiguration.Load(httpPath));

            var credentialUrlPath = WriteConfiguration(directory, "https://user:secret@itam.example.invalid");
            Throws<InvalidDataException>(() => AgentRuntimeConfiguration.Load(credentialUrlPath));

            var unknownFieldPath = Path.Combine(directory, "unknown.json");
            File.WriteAllText(unknownFieldPath, """
                {"backendBaseUrl":"https://itam.example.invalid","logDirectory":"/tmp","deviceId":"client"}
                """);
            Throws<System.Text.Json.JsonException>(() => AgentRuntimeConfiguration.Load(unknownFieldPath));
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    public void RotatesBoundedStructuredLogsWithoutCreatingDirectories()
    {
        var directory = CreateTemporaryDirectory();
        try
        {
            var configuration = new AgentRuntimeConfiguration
            {
                BackendBaseUrl = "https://itam.example.invalid",
                LogDirectory = directory,
                MaxLogFileSizeBytes = 1024,
                RetainedLogFiles = 2,
            };
            var logger = new BoundedJsonFileLogger(configuration);
            for (var index = 0; index < 20; index++)
            {
                logger.Write(
                    AgentLogEvent.CollectorCompleted,
                    AgentLogComponent.Network,
                    AgentLogOutcome.Succeeded,
                    Guid.Parse("11111111-1111-1111-1111-111111111111"),
                    durationMilliseconds: index);
            }

            var logs = Directory.GetFiles(directory, "agent*.log");
            Equal(true, logs.Length <= 3);
            Equal(true, logs.All(path => new FileInfo(path).Length <= 1024));

            var missingDirectory = Path.Combine(directory, "not-created");
            var missingDirectoryConfiguration = new AgentRuntimeConfiguration
            {
                BackendBaseUrl = configuration.BackendBaseUrl,
                LogDirectory = missingDirectory,
                MaxLogFileSizeBytes = configuration.MaxLogFileSizeBytes,
                RetainedLogFiles = configuration.RetainedLogFiles,
            };
            Throws<DirectoryNotFoundException>(
                () => new BoundedJsonFileLogger(missingDirectoryConfiguration));
            Equal(false, Directory.Exists(missingDirectory));
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    public async Task RetriesTransientFailuresWithBoundedBackoff()
    {
        var attempts = 0;
        var delays = new List<TimeSpan>();
        var policy = new BoundedRetryPolicy(
            new BoundedRetryOptions(3, TimeSpan.FromMilliseconds(100), TimeSpan.FromMilliseconds(250)),
            randomValue: () => 0.5,
            delay: (delay, _) =>
            {
                delays.Add(delay);
                return Task.CompletedTask;
            });

        var result = await policy.ExecuteAsync(
            _ =>
            {
                attempts++;
                return attempts < 3
                    ? Task.FromException<int>(new HttpRequestException("synthetic transient"))
                    : Task.FromResult(42);
            },
            exception => exception is HttpRequestException);

        Equal(42, result);
        Equal(3, attempts);
        Equal(2, delays.Count);
        Equal(TimeSpan.FromMilliseconds(100), delays[0]);
        Equal(TimeSpan.FromMilliseconds(200), delays[1]);
        Equal(true, delays.All(delay => delay <= TimeSpan.FromMilliseconds(250)));
    }

    public async Task DoesNotRetryPermanentFailuresOrCallerCancellation()
    {
        var attempts = 0;
        var policy = new BoundedRetryPolicy(
            new BoundedRetryOptions(5, TimeSpan.FromMilliseconds(10), TimeSpan.FromMilliseconds(40)),
            randomValue: () => 0.5,
            delay: (_, _) => Task.CompletedTask);

        await ThrowsAsync<InvalidOperationException>(() => policy.ExecuteAsync<int>(
            _ =>
            {
                attempts++;
                return Task.FromException<int>(new InvalidOperationException("permanent"));
            },
            _ => false));
        Equal(1, attempts);

        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await ThrowsAsync<OperationCanceledException>(() => policy.ExecuteAsync<int>(
            _ =>
            {
                attempts++;
                return Task.FromResult(1);
            },
            _ => true,
            cancellation.Token));
        Equal(1, attempts);
    }

    private void NotNull<T>(T? value)
    {
        Assertions++;
        if (value is null) throw new InvalidOperationException("Expected a non-null value.");
    }

    private void Equal<T>(T expected, T actual)
    {
        Assertions++;
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
        {
            throw new InvalidOperationException($"Expected '{expected}', received '{actual}'.");
        }
    }

    private string CreateTemporaryDirectory()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"itam-agent-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        return directory;
    }

    private static string WriteConfiguration(string directory, string backendBaseUrl)
    {
        var path = Path.Combine(directory, $"{Guid.NewGuid():N}.json");
        var json = System.Text.Json.JsonSerializer.Serialize(new
        {
            backendBaseUrl,
            logDirectory = directory,
        });
        File.WriteAllText(path, json);
        return path;
    }

    private void Throws<TException>(Action action)
        where TException : Exception
    {
        Assertions++;
        try
        {
            action();
        }
        catch (TException)
        {
            return;
        }

        throw new InvalidOperationException($"Expected {typeof(TException).Name}.");
    }

    private async Task ThrowsAsync<TException>(Func<Task> action)
        where TException : Exception
    {
        Assertions++;
        try
        {
            await action();
        }
        catch (TException)
        {
            return;
        }

        throw new InvalidOperationException($"Expected {typeof(TException).Name}.");
    }
}

internal sealed class FakeInventoryDataSource : IInventoryDataSource
{
    private static readonly ulong GiB = 1024UL * 1024 * 1024;

    public HashSet<string> FailOn { get; init; } = [];
    public Dictionary<string, int> CallCounts { get; } = new(StringComparer.Ordinal);
    public IReadOnlyList<NetworkAdapterData> NetworkAdapters { get; init; } =
    [
        new NetworkAdapterData(
            "Ethernet",
            "PCIe Ethernet Adapter",
            "Ethernet",
            "aabbccddeeff",
            [
                new NetworkAddressData("10.0.0.10", 24),
                new NetworkAddressData("10.0.0.10", 24),
                new NetworkAddressData("fe80::1%17", 64),
                new NetworkAddressData("127.0.0.1", 8),
            ]),
        new NetworkAdapterData(
            "vEthernet (Default Switch)",
            "Hyper-V Virtual Ethernet Adapter",
            "Ethernet",
            "aabbccddeeff",
            [new NetworkAddressData("192.168.56.1", 24)]),
        new NetworkAdapterData(
            "VPN",
            "WireGuard Tunnel Adapter",
            "Tunnel",
            null,
            [new NetworkAddressData("172.16.4.5", 32)]),
        new NetworkAdapterData(
            "Wi-Fi",
            "Wireless Adapter",
            "Wireless80211",
            "020000000002",
            [new NetworkAddressData("169.254.2.5", 16)]),
        new NetworkAdapterData(
            "Disconnected Ethernet",
            "PCI Ethernet Adapter",
            "Ethernet",
            "020000000003",
            []),
        new NetworkAdapterData(
            "Loopback Pseudo-Interface 1",
            "Loopback",
            "Loopback",
            "000000000000",
            [new NetworkAddressData("127.0.0.1", 8)]),
    ];

    public string GetComputerName() => Call("computer", "TEST-PC");
    public OperatingSystemData GetOperatingSystem() =>
        Call("operatingSystem", new OperatingSystemData("Windows Test", "10.0", "22631"));
    public ComputerSystemData GetComputerSystem() =>
        Call("computerSystem", new ComputerSystemData(true, "corp.example"));
    public IReadOnlyList<ProcessorData> GetProcessors() =>
        Call<IReadOnlyList<ProcessorData>>("cpu",
        [
            new ProcessorData("CPU A", 8, 16, 3600, 9),
            new ProcessorData("CPU B", 4, 8, 3400, 9),
        ]);
    public IReadOnlyList<MotherboardData> GetMotherboards() =>
        Call<IReadOnlyList<MotherboardData>>("motherboard", [new MotherboardData("Vendor", "Model", "BOARD-1")]);
    public IReadOnlyList<MemoryModuleData> GetMemoryModules() =>
        Call<IReadOnlyList<MemoryModuleData>>("ram", [new MemoryModuleData(16 * GiB, 4800, "RAM-1", "DIMM A1")]);
    public IReadOnlyList<PhysicalDiskData> GetPhysicalDisks() =>
        Call<IReadOnlyList<PhysicalDiskData>>("disks", PhysicalDisks);
    public IReadOnlyList<DiskPartitionData> GetDiskPartitions() =>
        Call<IReadOnlyList<DiskPartitionData>>("partitions", [new DiskPartitionData(0, "C")]);
    public IReadOnlyList<VolumeData> GetVolumes() =>
        Call<IReadOnlyList<VolumeData>>("volumes", [new VolumeData("C:", 100 * GiB, 25 * GiB)]);
    public IReadOnlyList<InstalledSoftwareData> GetInstalledSoftware() =>
        Call<IReadOnlyList<InstalledSoftwareData>>("software",
        [
            new InstalledSoftwareData("Example App", "1.0", "Publisher", "20240901"),
            new InstalledSoftwareData("example app", "1.0", "publisher", "bad-date"),
        ]);
    public IReadOnlyList<NetworkAdapterData> GetNetworkAdapters() =>
        Call<IReadOnlyList<NetworkAdapterData>>("network", NetworkAdapters);
    public IReadOnlyList<PhysicalDiskData> PhysicalDisks { get; init; } =
        [new PhysicalDiskData("0", "DISK-1", 4, 17, 100 * GiB)];

    private T Call<T>(string name, T value)
    {
        CallCounts[name] = CallCounts.GetValueOrDefault(name) + 1;
        if (FailOn.Contains(name))
        {
            throw new InvalidOperationException($"Synthetic {name} failure.");
        }

        return value;
    }
}
