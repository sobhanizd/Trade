# Notifications

Every alert is stored in-app (**Notifications** page) with the delivery status of
each external channel. External channels are optional and need server
credentials (env) **and** per-user enabling (Settings → Notification channels).
Use **Send test** next to each channel to verify.

## What triggers an alert

| Kind | When |
|---|---|
| Signal | A new buy setup at or above your minimum strength **and** minimum reward/risk, for your chosen assets/strategies/timeframes |
| Exit | An exit setup for a setup you were alerted to, or an asset with a manual paper position (same strategy/timeframe for auto-tracked ones) |
| Setup changed | A previously alerted buy setup changes state (cancellation / material change) |
| Invalidated | Price trades through an alerted setup's invalidation level |
| Price alert | Your price level is crossed (checked every snapshot, ~10 min) |
| Volatility | A watched asset moves more than your threshold within 1 hour |
| System | Provider failures or stale data (at most once per 6 hours each) |

**Duplicate prevention**: each alert has a deterministic key (unique in the
database). An unchanged signal never re-alerts; the same asset/strategy/timeframe/
state re-alerts at most once per cooldown window. **Quiet hours** defer external
delivery (dropped if older than 12 h); a **per-hour cap** skips excess alerts.
Failed deliveries retry after 1, 5 and 30 minutes (3 attempts).

## Telegram

1. In Telegram, open **@BotFather** → `/newbot` → follow the prompts → copy the token.
2. Put it in `.env`: `TELEGRAM_BOT_TOKEN=123456:ABC…` and restart web + worker.
3. Send any message to your new bot.
4. Settings → Telegram → **Find my chat ID** → click your chat → enable → **Save** → **Send test**.

Messages are sent as plain text (no markup), so content cannot inject formatting.
Cost: free.

## Email (SMTP)

Any SMTP provider works (e.g. Brevo, Mailgun, Resend SMTP, Postmark, or a Gmail
app password). In `.env`:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false        # true for port 465
SMTP_USER=…
SMTP_PASS=…
EMAIL_FROM="CryptoPilot AI <alerts@yourdomain>"
```

Then Settings → Email → recipient → enable → Save → Send test. Free tiers of most
providers (typically a few hundred emails/day) are far above this app's volume;
check your provider's current terms. Use a sender domain with SPF/DKIM to avoid
spam folders. The SMTP code path was verified against a real SMTP server
(Ethereal test inbox).

## Browser push (Web Push)

1. `npm run vapid:generate` → put the keys in `.env`
   (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:you@…`).
   Rebuild/restart.
2. Open the app over **HTTPS** (or `localhost`) → Settings → Browser push →
   **Enable on this device** → allow → Save → Send test.

**iPhone/iPad**: Web Push works only for a Home-Screen web app (iOS/iPadOS 16.4+):
Safari → Share → *Add to Home Screen* → open from the icon → enable push there.
**Mac**: works in Chrome, Edge, Firefox and Safari 16+.

Push notifications show the first lines of the alert; tapping opens the signal.
Cost: free (delivered via the browser vendor's push service).
