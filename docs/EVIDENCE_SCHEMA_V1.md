# JCG Network TS Platform - Evidence Schema v1

## Purpose

The evidence model provides a common representation for data collected from:

- Local operating systems
- Packet captures
- Meraki
- Palo Alto
- Cisco IOS / IOS-XE
- Zscaler ZIA
- Zscaler ZPA
- Future network vendors

AI agents consume normalized evidence rather than vendor-specific raw data.

## Evidence Types

### MEASURED

Directly observed by JCG Network TS or a local collector.

Examples:

- RSSI from macOS
- Packet observed in a PCAP
- Interface byte counter
- ICMP response time

### VENDOR_REPORTED

Reported by an external system or vendor controller.

Examples:

- Meraki client RSSI
- Palo Alto traffic log
- Zscaler transaction log
- ISR interface state

### DERIVED

Calculated deterministically from other evidence.

Examples:

- SNR = RSSI - noise floor
- Throughput from byte-counter delta
- DHCP transaction duration

Derived records should reference their source evidence IDs.

### INFERRED

A reasoned conclusion based on evidence.

Examples:

- Candidate co-channel interference
- Probable DHCP relay issue
- Suspected asymmetric routing

Inferred records should include confidence and source evidence IDs.

## Required Evidence Properties

Each evidence record contains:

- Unique evidence ID
- Evidence type
- Name
- Value
- Unit when applicable
- Source
- Collector
- Observation timestamp
- Collection timestamp
- Freshness
- Optional confidence
- Optional incident/site/device/client context
- Optional references to source evidence

## Design Rule

AI may interpret evidence.

AI may not create primary evidence.
