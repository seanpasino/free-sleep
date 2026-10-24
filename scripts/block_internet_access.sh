#!/bin/bash

echo "Blocking internet access..."

# IPv4 Rules
echo "Configuring IPv4 rules..."

# Only the local network and loopback are allowed; everything else is dropped.
# Time comes from an NTP server on the LAN (the NUC), so no internet NTP either.
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

echo "Updating the timesyncd config"
# The Pod has no RTC, so it must sync after every boot. It uses the LAN NTP server
# on the NUC (chrony on the Proxmox host); the LAN rules above cover that traffic.
# Must be an IP literal: DNS is blocked. Override with NTP_SERVERS=... if needed.
NTP_SERVERS="${NTP_SERVERS:-192.168.1.75}"
NTP_FALLBACK="${NTP_FALLBACK:-$NTP_SERVERS}"
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

# Block everything else (IPv6)
ip6tables -A INPUT -j DROP
ip6tables -A OUTPUT -j DROP
ip6tables-save > /etc/iptables/ip6tables.rules

echo "Blocked WAN internet access successfully!"

