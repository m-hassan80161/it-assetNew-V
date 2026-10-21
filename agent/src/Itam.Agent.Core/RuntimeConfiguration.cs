using System.Text.Json;
using System.Text.Json.Serialization;

namespace Itam.Agent.Core;

public sealed class AgentRuntimeConfiguration
{
    [JsonPropertyName("backendBaseUrl")]
    public required string BackendBaseUrl { get; init; }

    [JsonPropertyName("logDirectory")]
    public required string LogDirectory { get; init; }

    [JsonPropertyName("maxLogFileSizeBytes")]
    public long MaxLogFileSizeBytes { get; init; } = 5 * 1024 * 1024;

    [JsonPropertyName("retainedLogFiles")]
    public int RetainedLogFiles { get; init; } = 5;

    public void Validate()
    {
        if (!Uri.TryCreate(BackendBaseUrl, UriKind.Absolute, out var backendUri) ||
            backendUri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(backendUri.UserInfo) ||
            !string.IsNullOrEmpty(backendUri.Query) ||
            !string.IsNullOrEmpty(backendUri.Fragment)
        )
        {
            throw new InvalidDataException(
                "BackendBaseUrl must be an absolute HTTPS URL without credentials, a query, or a fragment.");
        }

        if (string.IsNullOrWhiteSpace(LogDirectory) || !Path.IsPathFullyQualified(LogDirectory))
        {
            throw new InvalidDataException("LogDirectory must be an absolute path.");
        }

        if (MaxLogFileSizeBytes is < 1024 or > 20 * 1024 * 1024)
        {
            throw new InvalidDataException("MaxLogFileSizeBytes must be between 1024 and 20971520.");
        }

        if (RetainedLogFiles is < 1 or > 10)
        {
            throw new InvalidDataException("RetainedLogFiles must be between 1 and 10.");
        }
    }

    public static AgentRuntimeConfiguration Load(string path)
    {
        var json = File.ReadAllText(path);
        var configuration = JsonSerializer.Deserialize<AgentRuntimeConfiguration>(
            json,
            SerializerOptions) ?? throw new InvalidDataException("Configuration file is empty.");
        configuration.Validate();
        return configuration;
    }

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };
}

public enum AgentLogEvent
{
    ApplicationStarted,
    ApplicationStopped,
    ConfigurationLoaded,
    ConfigurationRejected,
    CollectorCompleted,
    ApiRequestCompleted,
    RetryScheduled,
    AuthenticationFailed,
}

public enum AgentLogComponent
{
    Runtime,
    Configuration,
    Computer,
    OperatingSystem,
    ComputerSystem,
    Cpu,
    Motherboard,
    Ram,
    Disks,
    Software,
    Network,
    Api,
}

public enum AgentLogOutcome
{
    Succeeded,
    Failed,
    Partial,
    Retrying,
    Rejected,
}

public sealed record AgentLogEntry(
    DateTimeOffset TimestampUtc,
    AgentLogEvent Event,
    AgentLogComponent Component,
    AgentLogOutcome Outcome,
    Guid? CorrelationId = null,
    long? DurationMilliseconds = null,
    int? HttpStatusCode = null);
