using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Itam.Agent.Core;

public sealed class BoundedJsonFileLogger
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly object _sync = new();
    private readonly string _directory;
    private readonly string _activeLogPath;
    private readonly long _maximumFileSizeBytes;
    private readonly int _retainedFiles;

    public BoundedJsonFileLogger(AgentRuntimeConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        configuration.Validate();

        _directory = Path.GetFullPath(configuration.LogDirectory);
        if (!Directory.Exists(_directory))
        {
            throw new DirectoryNotFoundException(
                "The configured log directory must be provisioned with appropriate access controls.");
        }

        _activeLogPath = Path.Combine(_directory, "agent.log");
        _maximumFileSizeBytes = configuration.MaxLogFileSizeBytes;
        _retainedFiles = configuration.RetainedLogFiles;
    }

    public void Write(
        AgentLogEvent eventName,
        AgentLogComponent component,
        AgentLogOutcome outcome,
        Guid? correlationId = null,
        long? durationMilliseconds = null,
        int? httpStatusCode = null)
    {
        if (!Enum.IsDefined(eventName) || !Enum.IsDefined(component) || !Enum.IsDefined(outcome))
        {
            throw new ArgumentOutOfRangeException(nameof(eventName), "Log values must use defined enum members.");
        }

        if (durationMilliseconds < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(durationMilliseconds));
        }

        if (httpStatusCode is < 100 or > 599)
        {
            throw new ArgumentOutOfRangeException(nameof(httpStatusCode));
        }

        var entry = new AgentLogEntry(
            DateTimeOffset.UtcNow,
            eventName,
            component,
            outcome,
            correlationId,
            durationMilliseconds,
            httpStatusCode);
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(entry, SerializerOptions) + Environment.NewLine);
        if (bytes.Length > _maximumFileSizeBytes)
        {
            throw new InvalidDataException("The log entry exceeds the configured file-size limit.");
        }

        lock (_sync)
        {
            if (File.Exists(_activeLogPath) &&
                new FileInfo(_activeLogPath).Length + bytes.Length > _maximumFileSizeBytes)
            {
                Rotate();
            }

            using var stream = new FileStream(
                _activeLogPath,
                FileMode.Append,
                FileAccess.Write,
                FileShare.Read);
            if (stream.Length + bytes.Length > _maximumFileSizeBytes)
            {
                throw new IOException("The active log grew beyond its configured limit.");
            }

            stream.Write(bytes);
            stream.Flush(flushToDisk: true);
        }
    }

    private void Rotate()
    {
        var oldestPath = GetBackupPath(_retainedFiles);
        if (File.Exists(oldestPath))
        {
            File.Delete(oldestPath);
        }

        for (var index = _retainedFiles - 1; index >= 1; index--)
        {
            var source = GetBackupPath(index);
            if (File.Exists(source))
            {
                File.Move(source, GetBackupPath(index + 1), overwrite: true);
            }
        }

        if (File.Exists(_activeLogPath))
        {
            File.Move(_activeLogPath, GetBackupPath(1), overwrite: true);
        }
    }

    private string GetBackupPath(int index) =>
        Path.Combine(_directory, $"agent.{index}.log");
}
