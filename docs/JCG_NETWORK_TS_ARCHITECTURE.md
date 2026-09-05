# JCG Network TS Platform

Network Troubleshooting & Intelligence Platform

Developed by Manny Colón for JCG Solutions.

## Product direction

JCG Network TS Platform is vendor-neutral at the core. Local endpoint evidence is authoritative. Controller and cloud integrations enrich evidence but must never be required for the analyzer to function.

## Evidence hierarchy

1. Local measured evidence
   - Interface identity and addressing
   - RSSI, noise, SNR
   - PHY, band, primary channel, width, MCS, PHY rate
   - Observed RF records
   - Interface counters
   - Packet capture
   - Timestamps and collection provenance
2. Vendor/controller telemetry
   - AP identity and radio configuration
   - Client association/authentication/DHCP/DNS/roam events
   - Signal quality and PHY rate history
   - Channel utilization and non-802.11 utilization where exposed
   - Health/assurance events
3. Correlated inference
   - CCI/overlap candidates
   - Roam-related failures
   - DHCP stage failures
   - Wired path and gateway dependencies
4. RCA conclusion
   - Every conclusion must include evidence, confidence, alternative hypotheses, and next validation step.

## Terminology

Use neutral language until identity is proven:

- Observed RF Environment
- Observed radio
- Serving radio
- Managed radio
- Foreign radio
- Same-channel observation
- Overlapping-channel observation
- Candidate CCI

Do not label a radio as interference solely because it is strong or shares a primary channel.

## RF assessment rules

- RSSI and SNR are measurements, not standalone RCA conclusions.
- Channel width must be considered when evaluating spectral overlap.
- Same primary channel is only a candidate CCI indicator.
- Airtime/channel utilization and radio identity materially strengthen CCI conclusions.
- ACI/overlap calculations must be band-aware and width-aware.
- 6 GHz channel interpretation must not reuse 5 GHz assumptions blindly.
- Missing RSSI on an observed radio is valid missing evidence, not zero signal.

## Vendor adapter architecture

Adapters normalize vendor telemetry into a shared schema.

Initial adapters:

- Cisco Meraki Dashboard API
- Cisco Catalyst Center

Future adapters:

- HPE Aruba Central
- Juniper Mist
- Ruckus One / SmartZone
- Ubiquiti UniFi
- Generic SNMP / SSH / controller API

Each adapter should expose capabilities rather than force a common lowest denominator. Example capability flags:

- client_events
- signal_history
- data_rate_history
- radio_config
- rf_profiles
- channel_utilization
- packet_capture
- assurance_events
- topology

## Meraki integration priorities

Use the official Meraki Dashboard API/OpenAPI model and official SDK behavior as the reference for pagination, retries and rate limiting.

High-value wireless endpoints include:

- Client connectivity events: assoc, auth, connection, deauth, DHCP, disassoc, DNS, roam, sticky
- Signal quality history
- PHY data rate history
- Failed connections
- RF profiles
- Device radio settings/status
- Channel utilization / network wireless utilization where available
- Assurance correlated client events, but beta endpoints must be clearly marked as beta evidence

## Cisco Catalyst Center integration priorities

Normalize Catalyst Center client and health telemetry into the same evidence model:

- Overall client health
- Wireless client detail
- Connected AP identity
- Band, channel, channel width, spatial stream
- Site/network/device health
- Issues and suggested actions

## Packet analysis

Do not copy GPL Wireshark code into this product. Wireshark/tshark can be supported as an external executable integration where licensing permits. Packet capture files remain vendor-neutral evidence artifacts.

Recommended capture presets:

- DHCP
- DNS
- ARP / Neighbor Discovery
- 802.1X / EAPOL
- ICMP
- Client-focused host filter
- Full capture

Capture UI must show interface, filter, elapsed time, packet/file status, destination and explicit errors.

## Trusted research inputs

Prestige alone is not a selection criterion. Sources are accepted when technically relevant and licensing/provenance are clear.

Useful references identified:

- Cisco Meraki Developer Hub and official Meraki SDK/OpenAPI repositories
- Cisco Catalyst Center DevNet APIs
- NIST WLAN 802.11ax airtime utilization measurement work
- MIT CSAIL Wi-Fi RTT/FTM work as a possible future ranging/site-survey research path

MIT historical wireless projects are interesting research references, but old Madwifi/Click-era code should not be imported into the modern product merely because it came from MIT.

## Engineering quality requirements

- Evidence provenance attached to every measurement
- Monotonic timestamps for local time-series calculations
- No overlapping expensive probes
- Last-known-good cache must expose age and freshness state
- Unit tests for every parser using captured fixtures
- Fixture tests for OS-version output changes
- No silent failure paths
- Structured error objects instead of console-only errors
- Vendor API rate limiting and retry policy
- Read-only vendor adapters by default
- Secrets never stored in source code
- Exportable RCA evidence bundle
- Explicit confidence scoring with explainable inputs

## Immediate backlog

1. Finish visible JCG branding while preserving MIT attribution in LICENSE/source notices.
2. Rename Neighbor / Interference Context to Observed RF Environment.
3. Rename Strongest neighbor to Strongest observed radio.
4. Rename Same primary channel to Observed radios on serving channel.
5. Add developer reminder: `npm run dev:restart`.
6. Add RF probe freshness/age to Raw Evidence.
7. Add parser fixture tests for current macOS `system_profiler` output.
8. Add width-aware channel-overlap calculation.
9. Add evidence classifications: measured, vendor-reported, inferred.
10. Fix packet capture UX and macOS interface/permission handling.
11. Build first normalized vendor adapter using Meraki read-only telemetry.
12. Build Catalyst Center adapter against the same normalized schema.
