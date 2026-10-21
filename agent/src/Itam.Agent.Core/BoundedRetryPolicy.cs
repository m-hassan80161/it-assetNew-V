namespace Itam.Agent.Core;

public sealed record BoundedRetryOptions(
    int MaximumAttempts,
    TimeSpan InitialDelay,
    TimeSpan MaximumDelay,
    double JitterRatio = 0.2)
{
    public void Validate()
    {
        if (MaximumAttempts is < 1 or > 10)
        {
            throw new ArgumentOutOfRangeException(
                nameof(MaximumAttempts),
                "MaximumAttempts must be between 1 and 10.");
        }

        if (InitialDelay <= TimeSpan.Zero ||
            MaximumDelay < InitialDelay ||
            MaximumDelay > TimeSpan.FromMinutes(1))
        {
            throw new ArgumentOutOfRangeException(
                nameof(InitialDelay),
                "Retry delays must be positive and capped at one minute.");
        }

        if (JitterRatio is < 0 or > 0.5)
        {
            throw new ArgumentOutOfRangeException(
                nameof(JitterRatio),
                "JitterRatio must be between zero and 0.5.");
        }
    }
}

public sealed class BoundedRetryPolicy
{
    private readonly BoundedRetryOptions _options;
    private readonly Func<double> _randomValue;
    private readonly Func<TimeSpan, CancellationToken, Task> _delay;

    public BoundedRetryPolicy(
        BoundedRetryOptions options,
        Func<double>? randomValue = null,
        Func<TimeSpan, CancellationToken, Task>? delay = null)
    {
        options.Validate();
        _options = options;
        _randomValue = randomValue ?? Random.Shared.NextDouble;
        _delay = delay ?? Task.Delay;
    }

    public async Task<T> ExecuteAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        Func<Exception, bool> isTransient,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(operation);
        ArgumentNullException.ThrowIfNull(isTransient);

        for (var attempt = 1; ; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                return await operation(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception) when (
                attempt < _options.MaximumAttempts &&
                isTransient(exception))
            {
                await _delay(CalculateDelay(attempt), cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private TimeSpan CalculateDelay(int failedAttempt)
    {
        var exponentialMilliseconds = _options.InitialDelay.TotalMilliseconds *
            Math.Pow(2, failedAttempt - 1);
        var boundedMilliseconds = Math.Min(
            exponentialMilliseconds,
            _options.MaximumDelay.TotalMilliseconds);
        var jitter = (2 * _randomValue() - 1) * _options.JitterRatio;
        var jitteredMilliseconds = boundedMilliseconds * (1 + jitter);
        return TimeSpan.FromMilliseconds(Math.Min(
            jitteredMilliseconds,
            _options.MaximumDelay.TotalMilliseconds));
    }
}
