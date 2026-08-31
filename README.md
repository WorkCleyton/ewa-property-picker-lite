# Ewa Property Picker Lite

Standalone property review app for Ewa's Poland search, focused on detached homes and cabins between Kraków and Zakopane.

## Architecture

- Static HTML, CSS and JavaScript frontend
- Google Sheets as the data source of truth
- Bound Google Apps Script web app as the JSON API
- GitHub repository deployed through Cloudflare Pages

## Cloudflare Pages

This project has no build step. Deploy the repository root as the output directory.

## Features

- Ewa-only voting
- Notes for AI and concise feedback summaries
- Learned and stated preferences supplied by the API
- Manual search requests
- One-hour request countdown
- Maximum 10 new results per request
