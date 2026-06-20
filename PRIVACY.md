# Privacy Policy - ClickUp Margin Report Extension

**Last updated:** June 2026

## Overview

ClickUp Margin Report is a Chrome extension that calculates margin reports from ClickUp time entries using privately stored bill and cost rates.

## Data Collection

This extension reads the following data from your ClickUp workspace:
- Workspace member names and IDs
- Time entry data (hours logged, tasks, dates)

This data is read from your active ClickUp browser session and is **never stored permanently or transmitted externally**.

## Data Storage

The extension stores the following data locally in your Chrome browser profile using Chrome's extension storage API:
- Bill rates and cost rates you configure
- Project-to-client mappings
- Extension settings (lookback days)

This data:
- Never leaves your browser
- Is never transmitted to external servers
- Is never shared with third parties
- Is only accessible within your Chrome profile

**Note on at-rest encryption:** Chrome's `storage.local` is stored unencrypted on
disk within your Chrome profile directory. Anyone with access to your operating
system user account could read it. Because cost rates are sensitive, use the
**Clear all rates** button in Settings before sharing or disposing of a device,
and rely on your OS account password / full-disk encryption for at-rest protection.

## Data Usage

- Time entry data is used solely to calculate margin reports
- Rate data is stored locally for repeated calculations
- No analytics, tracking, or telemetry is collected
- No user data is sold or transferred to third parties

## Third-Party Services

This extension does not use any third-party services, analytics, or external APIs. It communicates only with ClickUp (app.clickup.com) using your existing browser session.

## Contact

For questions about this privacy policy, please open an issue on the extension's support page.
