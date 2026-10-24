#!/bin/bash

echo "Blocking internet access..."

# IPv4 Rules
echo "Configuring IPv4 rules..."

# Only the local network, loopback and NTP are allowed; everything else is dropped.
# Start from empty chains so re-running this (updates, enabling biometrics) never
# stacks duplicate rules.
iptables -F INPUT
iptables -F OUTPUT

# Replies on connections that were allowed to start
iptables -A INPUT  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow LAN traffic Class A (10.0.0.0/8)
iptables -A INPUT -s 10.0.0.0/8 -j ACCEPT
iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT

# Allow LAN traffic Class B (172.16.0.0/12)
iptables -A INPUT -s 172.16.0.0/12 -j ACCEPT
iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT

# Allow LAN traffic Class C (192.168.0.0/16)
iptables -A INPUT -s 192.168.0.0/16 -j ACCEPT
iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT

# Allow NTP traffic - this allows us to synchronize the system time
iptables -I OUTPUT -p udp --dport 123 -j ACCEPT
iptables -I INPUT -p udp --sport 123 -j ACCEPT

echo "Updating the timesyncd config"
# NTP servers must be IP literals - outbound DNS is blocked below, so hostnames
# never resolve and the clock never syncs (Google + Cloudflare anycast)
NTP_SERVERS="216.239.35.0 216.239.35.4 162.159.200.1 162.159.200.123"
NTP_FALLBACK="216.239.35.8 216.239.35.12"
cat > /etc/systemd/timesyncd.conf <<EOF
[Time]
NTP=$NTP_SERVERS
FallbackNTP=$NTP_FALLBACK
RootDistanceMaxSec=5
PollIntervalMinSec=32
PollIntervalMaxSec=2048
EOF

# Drop-ins override timesyncd.conf, and the Pod ships one with hostnames
mkdir -p /etc/systemd/timesyncd.conf.d
cat > /etc/systemd/timesyncd.conf.d/local.conf <<EOF
[Time]
NTP=$NTP_SERVERS
FallbackNTP=$NTP_FALLBACK
EOF

# Restart timesyncd to apply changes
systemctl restart systemd-timesyncd


# Allow localhost (loopback) traffic so local apps can talk to each other
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Block everything else
iptables -A INPUT -j DROP
iptables -A OUTPUT -j DROP

# Save rules
iptables-save > /etc/iptables/iptables.rules

echo "Configuring IPv6 rules..."
# unblock_internet_access.sh only flushes IPv4, so clear these here as well
ip6tables -F INPUT
ip6tables -F OUTPUT

# Allow local traffic for IPv6
ip6tables -A INPUT -s fe80::/10 -j ACCEPT
ip6tables -A OUTPUT -d fe80::/10 -j ACCEPT
ip6tables -A INPUT -s fd00::/8 -j ACCEPT
ip6tables -A OUTPUT -d fd00::/8 -j ACCEPT

# Allow NTP traffic (IPv6)
ip6tables -I OUTPUT -p udp --dport 123 -j ACCEPT
ip6tables -I INPUT -p udp --sport 123 -j ACCEPT

# Block everything else (IPv6)
ip6tables -A INPUT -j DROP
ip6tables -A OUTPUT -j DROP
ip6tables-save > /etc/iptables/ip6tables.rules

echo "Blocked WAN internet access successfully!"

