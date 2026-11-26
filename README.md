# Calendar Invite Link

Static, no-account page. Fill in a form, get one share URL. Whoever opens it can add the event to Google, Outlook.com, Office 365, Yahoo, or Apple / .ics. Event data lives in the URL fragment (`#`), so it never reaches a server. MIT licensed.

An optional **Shorten** button stores the event in Cloudflare KV and returns `/s/<code>`.

## Run / test

```bash
python3 -m http.server 8000   # form + share pages (Shorten needs Pages Functions)
npm test                      # node --test, no dependencies
npx wrangler pages dev .      # with Functions + local KV
```

## Deploy (Cloudflare Pages)

1. `npx wrangler kv namespace create SHORTLINKS`, then put the id in `wrangler.toml`.
2. Connect the repo to Pages. Build command: none. Output directory: `/`.

## Not yet verified (needs live testing)

- Outlook/Office 365 and Yahoo all-day end-date handling, and Yahoo `et` in UTC.
- Outlook `deeplink/compose` on desktop and mobile.
- iOS Safari `.ics` Blob download (fallback: `data:text/calendar` URI).
- Rate limiting on `/api/shorten`: not implemented. The 2 KB cap, origin check, validation and free-plan KV ceilings are the only guards so far.
- Recurring `.ics` writes explicit `VTIMEZONE` observances for 10 years from the event's year; later repeats fall back to the last one.
