#!/bin/sh
set -e

# Railway volumes are mounted as root:root by default. Ensure /prometheus is accessible.
mkdir -p /prometheus /etc/prometheus
chmod 777 /prometheus 2>/dev/null || true

# If METRICS_TOKEN is provided as an environment variable in Railway,
# populate /etc/prometheus/bearer.token for authenticated scraping.
if [ -n "$METRICS_TOKEN" ]; then
  printf "%s" "$METRICS_TOKEN" > /etc/prometheus/bearer.token
else
  touch /etc/prometheus/bearer.token
fi

exec /bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=7d \
  --storage.tsdb.retention.size=5GB \
  "$@"
