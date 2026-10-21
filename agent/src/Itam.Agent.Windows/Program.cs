using System.Runtime.Versioning;
using Itam.Agent.Contracts;
using Itam.Agent.Core;
using Itam.Agent.Windows;

public static class Program
{
    public static int Main(string[] args)
    {
        if (args.Length == 2 &&
            args[0].Equals("validate-config", StringComparison.OrdinalIgnoreCase))
        {
            return ValidateConfiguration(args[1]);
        }

        if ((args.Length is < 1 or > 2) ||
            !args[0].Equals("collect", StringComparison.OrdinalIgnoreCase))
        {
            Console.Error.WriteLine(
                "Usage: Itam.Agent.Windows collect [settings.json] | validate-config <settings.json>");
            return 64;
        }

        if (!OperatingSystem.IsWindows())
        {
            Console.Error.WriteLine("Inventory collection requires Windows.");
            return 69;
        }

        return RunCollection(args.Length == 2 ? args[1] : null);
    }

    private static int ValidateConfiguration(string path)
    {
        try
        {
            AgentRuntimeConfiguration.Load(path);
            Console.WriteLine("Configuration is valid.");
            return 0;
        }
        catch (Exception exception) when (
            exception is IOException or
            UnauthorizedAccessException or
            System.Text.Json.JsonException)
        {
            Console.Error.WriteLine($"Configuration validation failed ({exception.GetType().Name}).");
            return 78;
        }
    }

    [SupportedOSPlatform("windows")]
    private static int RunCollection(string? configurationPath)
    {
        BoundedJsonFileLogger? logger = null;
        if (configurationPath is not null)
        {
            try
            {
                logger = new BoundedJsonFileLogger(
                    AgentRuntimeConfiguration.Load(configurationPath));
            }
            catch (Exception exception) when (
                exception is IOException or
                UnauthorizedAccessException or
                System.Text.Json.JsonException)
            {
                Console.Error.WriteLine(
                    $"Configuration or log initialization failed ({exception.GetType().Name}).");
                return 78;
            }
        }

        var result = new InventoryCollector(new WindowsInventoryDataSource()).Collect();
        var correlationId = Guid.NewGuid();
        foreach (var collector in result.Collectors.Where(collector => !collector.Succeeded))
        {
            Console.Error.WriteLine(
                $"Collector '{collector.Name}' failed ({collector.ErrorType ?? "unknown error"}).");
        }

        if (logger is not null)
        {
            foreach (var collector in result.Collectors)
            {
                logger.Write(
                    AgentLogEvent.CollectorCompleted,
                    GetLogComponent(collector.Name),
                    collector.Succeeded ? AgentLogOutcome.Succeeded : AgentLogOutcome.Failed,
                    correlationId,
                    collector.DurationMilliseconds);
            }
        }

        if (result.Payload is null)
        {
            Console.Error.WriteLine("A complete inventory snapshot could not be collected.");
            return 1;
        }

        Console.Out.WriteLine(InventoryJson.Serialize(result.Payload));
        return 0;
    }

    private static AgentLogComponent GetLogComponent(string collectorName) =>
        collectorName switch
        {
            "computer" => AgentLogComponent.Computer,
            "operatingSystem" => AgentLogComponent.OperatingSystem,
            "computerSystem" => AgentLogComponent.ComputerSystem,
            "cpu" => AgentLogComponent.Cpu,
            "motherboard" => AgentLogComponent.Motherboard,
            "ram" => AgentLogComponent.Ram,
            "disks" => AgentLogComponent.Disks,
            "software" => AgentLogComponent.Software,
            "network" => AgentLogComponent.Network,
            _ => AgentLogComponent.Runtime,
        };
}
