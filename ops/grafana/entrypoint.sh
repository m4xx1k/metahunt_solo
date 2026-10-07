#!/bin/sh
set -e

# Railway volumes are mounted as root:root (UID 0).
# Fix volume ownership to unprivileged user 'grafana' (UID 472).
mkdir -p /var/lib/grafana /etc/grafana
chown -R 472:0 /var/lib/grafana /etc/grafana 2>/dev/null || true
chmod 750 /var/lib/grafana 2>/dev/null || true

# Drop root privileges immediately and run Grafana strictly as unprivileged user 'grafana' (UID 472).
exec su -s /bin/sh grafana -c "exec /run.sh"
