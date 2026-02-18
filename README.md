![Net Commander Banner](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/banner/net-commander-banner.png)

<div align="center">

# Network Engineering Toolkit for Visual Studio Code
**Manage and diagnose networks end-to-end without ever leaving your code editor. Conduct real Root Cause Analysis data-driven with no more guessing**

[![published](https://img.shields.io/badge/Cisco%20DevNet-published-blue)](https://developer.cisco.com/codeexchange/github/repo/skhell/net-commander)
![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/skhell.net-commander)
![Open VSX Version](https://img.shields.io/open-vsx/v/skhell/net-commander)
[![Uses VSCode Elements](https://img.shields.io/badge/uses-vscode--elements-blue)](https://github.com/vscode-elements/elements/network/dependents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)



</div>
<br><br>

# Why I should use Net Commander
Aimed to be a powerful all-in-one toolkit for Network Engineers, DevOps Engineers or Solution Architects. Net Commander brings the everyday field tools like public ip query including peeringdb and IANA port lookup, ping, traceroute, Wi-Fi Surveys, subnet calculators, SSH profile jumpers, config colourising and more *into* Visual Studio Code. Stop context-switching between terminals and browsers and troubleshoot where you already work.

## Main features

| Category      | Highlights                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| **Troubleshoot** | • Live Ping panel & multiple-shot ping<br>• Visual Traceroute with mapped SVG path<br>• Assisted Root-Cause Analysis Report creation for data-driven resolution approach with no more guessing |
| **Wireless**     | • Wi-Fi Analyzer ideal for quick site survey<br>• One-click packet capture for deep inspection with Wireshark                      |
| **Lookup**       | • IANA port registry search<br>• Public IP & ASN info (ipinfo.io)<br>• PeeringDB integration               |
| **Calculate**    | • RFC-compliant CIDR calculator + *what-if* assisted subnet simulator                                               |
| **SSH**     | • SSH profile jumper & terminal enhancer
| **Visualise**    | • Cisco-style config colouriser with inline IP assisted tooltips (more will come)                                                    |

*All exports are CSV-ready—drop results straight into tickets or dashboards.*


## Table of Contents
- [Network Engineering Toolkit for Visual Studio Code](#network-engineering-toolkit-for-visual-studio-code)
- [Why I should use Net Commander](#why-i-should-use-net-commander)
  - [Main features](#main-features)
  - [Table of Contents](#table-of-contents)
- [Getting started](#getting-started)
  - [Cloud CIDRs analyzer](#cloud-cidrs-analyzer)
  - [Root cause analysis](#root-cause-analysis)
  - [WiFi analyzer](#wifi-analyzer)
  - [SSH profile jumper](#ssh-profile-jumper)
  - [Optimise terminal experience](#optimise-terminal-experience)
  - [IANA port lookup](#iana-port-lookup)
  - [RFC‑compliant CIDR calculator](#rfccompliant-cidr-calculator)
  - [Public IP lookup (ipinfo.io)](#public-ip-lookup-ipinfoio)
  - [PeeringDB lookup](#peeringdb-lookup)
  - [Ping and traceroute supercharged](#ping-and-traceroute-supercharged)
  - [Network configuration colorizer](#network-configuration-colorizer)
  - [Quick start](#quick-start)
  - [Configuration and settings](#configuration-and-settings)
  - [Contributing and feedback](#contributing-and-feedback)
  - [Sponsor this project](#sponsor-this-project)


# Getting started

## Cloud CIDRs analyzer
![CIDRs analyzer](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/cloud-cidr-analyzer.png)  
You can now query right from Visual Studio Code all Microsoft Azure, Amazon AWS and Google Cloud Platform subscriptions and search for specific CIDRs in use, this will help you understand if the CIDR is in use to avoid overlapping. Net Commander allow also to search all CIDRs in use at once, great for reporting and you can easily export the results in CSV right in your project folder.


## Root cause analysis
![Root cause analysis](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/rootcause-analysis.gif)  
Root-cause analysis must be **data-driven** and free from assumptions or feelings.  
Always validate facts with logs, metrics, or reproducible tests before drawing conclusions. 
Even if you are an expert when you are in the middle of a complex troubleshooting alone, in couple or involving multiple teams sometimes it's hard to get focused under pressure specially when dialing with different platforms at the same time for this reason the Root Cause Analysis Checklist come to help in handy offline format with dedicated commands for Cisco, Arista, Ciena, Microsoft Azure, Amazon AWS and Google Cloud Platform.


## WiFi analyzer
![WiFi analyzer](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/wifi-analyzer.gif)  
Conduct fast site surveys getting RAW data from your notebook WiFi socket that you can extract in CSV or execute an on-demand Packet Trace that you can analyze later on with Wireshark.
You can see the neighbor signals and SSID to quickly understand if there are interference that affect your WiFi signal as well as diagnose your signal strenght and quality.


## SSH profile jumper
![SSH profile jumper](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/ssh.gif)  
Net Commander **SSH Profile Jumper** simplifies SSH management by letting you jump to saved server profiles with a few keystrokes. No more manually typing hostnames or looking up IP addresses define your SSH connections once and instantly launch into remote servers from VS Code.


## Optimise terminal experience
Net Commander leverages VS Code’s Terminal Shell Integration API to track your terminal commands, so you can instantly copy any command’s output or save it directly into your project for later in-depth analysis. All saved outputs land in the terminal-downloads folder.


## IANA port lookup
![IANA port lookup](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/iana-port-calculator.png)  
Ever come across an unfamiliar port number or service name? The **IANA Port Lookup** tool provides quick insights by referencing the official IANA port registry. Input a TCP/UDP port or service name, and Net Commander displays the assigned service (e.g., `80 -> HTTP`, `443 -> HTTPS`), making firewall audits and configuration reviews faster.


## RFC‑compliant CIDR calculator
![CIDR calculator](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/cidr-simulator.gif)  
Designing or subnetting a network? The **CIDR Calculator** computes IPv4 and IPv6 subnets on the fly, following RFC standards. Provide an IP and prefix (e.g., `192.168.100.0/24`) to get network address, broadcast, wildcard mask, and usable host range. Supports supernetting and subnetting, with results exported to `cidr-calc.csv`.
<br><br>
The CIDR Calculator provide you also the capability of running **What-if-simulation** this way you can get an estimate if your address space needs fits inside choosen CIDR block or not. No more guessing or mistakes!


## Public IP lookup (ipinfo.io)
![Public IP Lookup](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/public-ip-info.png)  
Retrieve your external IP or gather details about any IP address with ipinfo.io integration. Instantly fetch geolocation, ASN, hostname, and ISP info without leaving the editor. For higher rate limits or more data, add your ipinfo API token in Settings -> Net Commander -> Ipinfo API Key.


## PeeringDB lookup
![PeeringDB Lookup](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/peeringdb.png)  
Query PeeringDB for ASN and facility data directly in VS Code. Enter an ASN or organization name to view peering policies, IX presence, and facility locations—ideal for planning interconnections and verifying existing peering information.


## Ping and traceroute supercharged
![Ping Panel](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/ping.png)  
- **Panel Mode:** Continuous ping monitoring in VS Code’s sidebar, with real‑time latency charts and packet‑loss stats.  
- **Single‑Shot:** Quick terminal ping for instant reachability tests.  

Run a ping or traceroute against single or multiple targets.
Both modes support detailed CSV export plus for Ping command you get a custom packet size/count via settings.


## Network configuration colorizer
![Config Colorizer](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/net-colorizer.gif)  
Automatically apply syntax highlighting to Cisco‑style `.txt` files. Keywords, interfaces, IPs, and protocols are colorized for easy scanning, reducing errors and speeding up config reviews.
<br><br>
![Config Colorizer](https://raw.githubusercontent.com/skhell/net-commander/refs/heads/main/media/img/readme/net-colorizer-iptooltips.png)  
Plus the extension will automatically detect private and public IPs placing tooltips above them for your better understanding. In case of Public IPs provide you access to **ipinfo.io database** to get accurate informations without leaving the configuration you are exploring avoiding spam ads or distractions.

---

## Quick start
1. **Install** Net Commander from the VS Code Marketplace.  
2. Setup IPinfo account (you need it to query public IP info DB)
3. Open the **Command Palette** with <kbd>Ctrl + Shift + P</kbd> (Windows/Linux) or <kbd>⇧⌘P</kbd> (macOS).  
4. Type `Net Commander:` to see all commands and select the tool you need.  
5. Enjoy seamless network operations without leaving your editor!

> [!NOTE]
> Setup guide of IPinfo
> 1. Signup for a free account at https://ipinfo.io/signup.
>
> 2. Once signed up from your dashboard open the **API Token** page and copy your token https://ipinfo.io/dashboard/token.
>
> 3. Open VS Code Settings panel search for **Net Commander** and paste your Token in the Net Commander IPinfo form.


## Configuration and settings
Go to **File > Preferences > Settings** (or <kbd>Ctrl+,</kbd>), search for **Net Commander**, and configure:

- **IANA csv url**: Edit the IANA database CSV in case it change.
- **IPinfo.io API Token**: Save your API Token to be used by the extension.

All settings are exposed via the VS Code UI—no manual JSON edits required.


## Contributing and feedback
I welcome your ideas and feedbacks! Whether you discover a problem or have a feature request, please:

- **Open an issue**: https://github.com/skhell/net-commander/issues  
- **Suggest a new idea**: https://github.com/skhell/net-commander/discussions/categories/ideas
- **Ask questions and get answers**: https://github.com/skhell/net-commander/discussions/categories/q-a

Your insights help prioritize enhancements and ensure Net Commander scale as a very useful **VS Code network tools** extension. Thank you for contributing!


## Sponsor this project
If you find Net Commander valuable, please consider sponsoring its ongoing development. Thank you for helping me building better open-source tools!  
<br>
[![GitHub sponsors](https://img.shields.io/github/sponsors/skhell?label=Sponsor%20this%20project&logo=GitHub&style=flat)](https://github.com/sponsors/skhell)