#!/bin/sh
set -e

# Railway volumes are mounted as root:root (UID 0).
# Fix volume ownership to unprivileged user 'nobody' (UID 65534).
mkdir -p /prometheus /etc/prometheus
chown -R nobody:nobody /prometheus /etc/prometheus 2>/dev/null || true
chmod 750 /prometheus 2>/dev/null || true

# If METRICS_TOKEN is provided as an environment variable in Railway,
# populate /etc/prometheus/bearer.token for authenticated scraping.
if [ -n "$METRICS_TOKEN" ]; then
  printf "%s" "$METRICS_TOKEN" > /etc/prometheus/bearer.token
else
  touch /etc/prometheus/bearer.token
fi
chown nobody:nobody /etc/prometheus/bearer.token 2>/dev/null || true
chmod 600 /etc/prometheus/bearer.token 2>/dev/null || true

# Drop root privileges immediately and execute Prometheus strictly as user 'nobody' (UID 65534).
exec su -s /bin/sh nobody -c 'exec /bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=7d \
  --storage.tsdb.retention.size=5GB \
  "$@"' -- "$@"
