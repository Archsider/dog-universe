# Sentry alerts — Dog Universe

This document is the **source of truth** for Sentry alert rules. Sentry's
config-as-code (Terraform / `sentry-cli` import) covers a subset only —
the rest is configured in the Sentry web dashboard. When you change an
alert there, please update the table below.

## Channels

All alerts route to:
- **Slack** — `#alerts-prod` channel (webhook integration)
- **Email** — `eng@dog-universe.app` (escalation only, > P1)

## Active alerts

| #   | Name                            | Trigger                                                                 | Severity | Action                  |
|-----|---------------------------------|-------------------------------------------------------------------------|----------|-------------------------|
| A1  | High error rate                 | `event.type:error` rate > **1%** of all events over **5 min**           | P1       | Slack + Email           |
| A2  | Slow transactions (p95)         | `transaction.duration` p95 > **2 000 ms** over **10 min**               | P2       | Slack                   |
| A3  | Slow DB span (p95)              | `span.op:db.*` p95 > **500 ms** over **10 min**                         | P2       | Slack                   |
| A4  | Cron job failed                 | Any issue with tag `cron:*` (e.g. `cron:reminders`) created             | P1       | Slack + Email           |
| A5  | DLQ saturation (defence depth)  | `message:"DLQ size exceeded threshold"` (emitted by `/api/health`)      | P2       | Slack                   |
| A6  | New release regression          | New issue first seen in the last release, > 5 events in 15 min          | P2       | Slack                   |

## Tagging conventions

Crons and queues should be tagged so the alert filters above work:

```ts
Sentry.withScope((scope) => {
  scope.setTag('cron', 'reminders');
  scope.setTag('service', 'cron-reminders');
  Sentry.captureException(err);
});
```

The DLQ saturation alert (A5) relies on the `Sentry.captureMessage(...)`
call already wired into [`src/app/api/health/route.ts`](../src/app/api/health/route.ts)
with the stable fingerprint `['health', 'dlq-warning']` so repeated
probes inside a single incident dedupe to one Sentry issue.

## Exportable JSON (for future automation)

Sentry's alert API accepts the JSON shape below. The values match the
table above. Re-applying via API:

```bash
curl -X POST "https://sentry.io/api/0/projects/$ORG/$PROJECT/rules/" \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d @sentry-alerts.json
```

```json
{
  "rules": [
    {
      "name": "High error rate",
      "actionMatch": "all",
      "frequency": 5,
      "conditions": [
        { "id": "sentry.rules.conditions.event_frequency.EventFrequencyPercentCondition",
          "interval": "5m", "value": 1, "comparisonType": "count" }
      ],
      "actions": [
        { "id": "sentry.integrations.slack.notify_action",
          "channel": "#alerts-prod", "workspace": "dog-universe" }
      ]
    },
    {
      "name": "Slow transactions p95",
      "actionMatch": "all",
      "frequency": 10,
      "conditions": [
        { "id": "sentry.rules.conditions.event_attribute.EventAttributeCondition",
          "attribute": "transaction.duration", "match": "gt", "value": 2000 }
      ],
      "actions": [
        { "id": "sentry.integrations.slack.notify_action",
          "channel": "#alerts-prod", "workspace": "dog-universe" }
      ]
    },
    {
      "name": "Slow DB span p95",
      "actionMatch": "all",
      "frequency": 10,
      "conditions": [
        { "id": "sentry.rules.conditions.tagged_event.TaggedEventCondition",
          "key": "span.op", "match": "sw", "value": "db." },
        { "id": "sentry.rules.conditions.event_attribute.EventAttributeCondition",
          "attribute": "span.duration", "match": "gt", "value": 500 }
      ],
      "actions": [
        { "id": "sentry.integrations.slack.notify_action",
          "channel": "#alerts-prod", "workspace": "dog-universe" }
      ]
    },
    {
      "name": "Cron job failed",
      "actionMatch": "all",
      "frequency": 1,
      "conditions": [
        { "id": "sentry.rules.conditions.tagged_event.TaggedEventCondition",
          "key": "cron", "match": "is", "value": "*" },
        { "id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition" }
      ],
      "actions": [
        { "id": "sentry.integrations.slack.notify_action",
          "channel": "#alerts-prod", "workspace": "dog-universe" },
        { "id": "sentry.mail.actions.NotifyEmailAction",
          "targetType": "Team", "targetIdentifier": "engineering" }
      ]
    },
    {
      "name": "DLQ saturation",
      "actionMatch": "all",
      "frequency": 30,
      "conditions": [
        { "id": "sentry.rules.conditions.event_attribute.EventAttributeCondition",
          "attribute": "message", "match": "eq", "value": "DLQ size exceeded threshold" }
      ],
      "actions": [
        { "id": "sentry.integrations.slack.notify_action",
          "channel": "#alerts-prod", "workspace": "dog-universe" }
      ]
    }
  ]
}
```

## Maintenance

- Review alert noise weekly during the Monday triage.
- Mute or down-grade any alert that fires more than 3× /week without
  matching a real incident — alert fatigue kills paging.
