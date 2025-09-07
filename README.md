# whats-i-own-telegram

A CLI tool to audit and explore the **groups** and **channels** you own or administer with your Telegram user account.  
Built using [GramJS](https://github.com/gram-js/gramjs).

## Features

- Authenticate with your Telegram user account (via MTProto session).
- Detect and list **groups** and **channels** where you are an **owner** or **admin**.
- Show creation date, last interaction date, and status (active, left, deactivated, inaccessible).
- Trminal output for easy distinction between owner/admin/inaccessible.
- Interactive CLI menu with options to view groups/channels or export results.
- Export data to **TXT** or **CSV** with full metadata (IDs, usernames, roles, timestamps).

## Installation

```bash
git clone https://github.com/tas33n/whats-i-own-telegram.git
cd whats-i-own-telegram
npm install
```

## Usage

1. Create an app at [my.telegram.org](https://my.telegram.org) to get your `API_ID` and `API_HASH`.
2. Export them in your shell before running:

3. Create a `.env` file in the project folder (see `.env.example` for reference) and add your credentials:

```
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=abcdef1234567890
```

4. Run the CLI tool:

```bash
node bot.js
```

3. On first run, you will be prompted for your phone number, login code, and 2FA password if set.  
   Your session will be saved locally (`session.txt`).

## Menu Options

- Show groups where you are owner/admin.
- Show channels where you are owner/admin.
- Dump groups to TXT/CSV.
- Dump channels to TXT/CSV.

## Output Examples

**Console:**  
- Owners are shown in **green**.  
- Admins are shown in **yellow**.  
- Inaccessible/deactivated groups are shown in **red**.

**Exports:**  
- TXT: human-readable text with all metadata.  
- CSV: Excel/Sheets-friendly, with proper UTF-8 BOM and separator hints.

## Author

Made with ❤️ by **tas33n**  
- GitHub: [tas33n](https://github.com/tas33n)  
- Telegram Channel: [Join Here](https://t.me/misfitdev)

---
