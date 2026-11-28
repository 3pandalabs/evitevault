# RsvpVault — TODO

## Scheduled email send (deferred)
Let hosts schedule a greeting/event email for a future time instead of sending now.

- **API:** persist the send (recipients + rendered card image) in a `scheduled_sends`
  table with a `scheduled_at`; the existing hourly job (`api/src/jobs/pendingInvitations.ts`
  pattern) dispatches due rows via `sendMail`. Greeting sends are stateless today, so
  scheduling means storing the card image (R2 or the row) at schedule time.
- **Web:** a "Send later" date/time option on the greeting/event send panel.
- **Note:** not demoable on the local preview without Postgres/the API running — needs the
  local DB or a hosted test env to verify end to end.
