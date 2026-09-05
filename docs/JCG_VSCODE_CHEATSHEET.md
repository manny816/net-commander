# JCG Network TS Platform - VS Code Cheat Sheet

Developed by Manny Colón for JCG Solutions

## QUICK START

### Build JCG
Use the VS Code bottom terminal:

    npm run compile

Or use:

    NPM Scripts -> compile

### Test JCG
Double-click:

    JCG Network TS Platform.app

on the macOS Desktop.

### Check project status

    git status

---

# KNOW YOUR TWO VS CODE WINDOWS

## Main VS Code Window = WORKSHOP

This window has the net-commander project open.

Use it for:

- Editing code
- Codex
- Terminal
- Git
- Compiling
- Debugging
- Reviewing errors

Project:

    /Users/MCOLON/scripts/net-commander

## Extension Development Host = TEST LAB

This is the second VS Code window that opens when testing the extension.

JCG Network TS actually runs here.

Use it for:

- RF Analyzer
- Testing features
- Developer Tools
- Viewing extension behavior

Do not normally edit project files here.

---

# I WANT TO...

## Open the Terminal

    Terminal -> New Terminal

The terminal appears at the bottom of VS Code.

## Verify where I am

    pwd

Expected:

    /Users/MCOLON/scripts/net-commander

## Compile JCG

    npm run compile

## Build/restart development code

    npm run dev:restart

Then use:

    Run -> Stop Debugging
    Run -> Start Debugging

Configuration:

    Run JCG Network TS Platform

## Open RF Analyzer manually

Press:

    Command + Shift + P

Search:

    JCG Network TS: RF Analyzer

## Test using one click

Double-click the Desktop application:

    JCG Network TS Platform.app

---

# GIT

## See changed files

    git status

## See exactly what changed

    git diff

## See recent commits

    git log --oneline -10

## Commit a completed change

    git add <files>
    git commit -m "description"
    git push

Do not commit code that does not compile.

---

# FIND THINGS

## Find a file

Use Explorer on the left.

Or:

    Command + P

Then type part of the filename.

## Search the entire project

    Command + Shift + F

## Open Command Palette

    Command + Shift + P

This is one of the most useful VS Code commands.

---

# CODEX WORKFLOW

Use Codex for:

- Editing source files
- Refactoring
- Creating tests
- Finding code
- Reviewing diffs
- Explaining unfamiliar code
- Running builds/tests

Good request:

    Add the Evidence Provenance panel to the RF Analyzer.
    Do not modify RF collection logic.
    Compile after the change and report any errors.

Prefer Codex editing the actual files over pasting large source-code
patches into the terminal.

---

# IF SOMETHING BREAKS

Do not start randomly changing files.

First run:

    git status

Then:

    npm run compile

Read the FIRST meaningful error.

If necessary:

    git diff

Give ChatGPT or Codex the error and relevant file.

---

# IMPORTANT LOCATIONS

Project:

    /Users/MCOLON/scripts/net-commander

Project Plan:

    docs/Project Plan/JCG_Network_TS_Project_Plan.xlsx

Evidence Architecture:

    docs/EVIDENCE_SCHEMA_V1.md

VS Code Cheat Sheet:

    docs/JCG_VSCODE_CHEATSHEET.md

RF Analyzer:

    media/module-wifianalyzer/main.js

RF Backend:

    src/modules/wifiAnalyzer.ts

macOS RF Collector:

    src/modules/macosWifiEvidence.ts

Evidence Core:

    src/core/evidence/

Desktop Launcher Script:

    scripts/launch-rf-dev.sh

---

# GOLDEN RULE

Main VS Code window = build JCG.

Development Host = test JCG.

Bottom Terminal = commands.

Codex = code changes.

Desktop JCG icon = one-click test.
