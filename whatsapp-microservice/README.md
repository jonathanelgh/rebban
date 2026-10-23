# Rebban WhatsApp Microservice

Standalone Node.js Express server using `whatsapp-web.js` (same pattern as Sunkissed). Hosts one Rebban WhatsApp number for outbound sends and inbound Assistant messages.

## What it does

- `POST /send` — send a text (and optional media) message (API key required)
- `GET /health` — readiness check
- On inbound DMs — forwards `{ from, body, messageId, … }` to Rebban `POST /api/assistant/whatsapp/inbound`

## Deploy with Docker

```bash
cd whatsapp-microservice
docker rm -f rebban-whatsapp-bot 2>/dev/null
docker build -t rebban-whatsapp-server .
docker volume create rebban-whatsapp-auth 2>/dev/null
docker run -d \
  -p 3001:3001 \
  --name rebban-whatsapp-bot \
  --restart unless-stopped \
  -v rebban-whatsapp-auth:/usr/src/app/.wwebjs_auth \
  -e API_KEY="change-me" \
  -e REBBAN_WEBHOOK_URL="https://app.rebban.com/api/assistant/whatsapp/inbound" \
  -e REBBAN_WEBHOOK_SECRET="change-me-webhook-secret" \
  rebban-whatsapp-server
```

Scan the QR once:

```bash
docker logs -f rebban-whatsapp-bot
```

Test send:

```bash
curl -s -X POST http://YOUR_HOST:3001/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: change-me" \
  -d '{"to":"+46700000000","message":"Test from Rebban Assistant"}'
```

## Next.js env

```env
WHATSAPP_API_URL=http://YOUR_HOST:3001
WHATSAPP_API_KEY=change-me
WHATSAPP_WEBHOOK_SECRET=change-me-webhook-secret
```

`WHATSAPP_WEBHOOK_SECRET` must match `REBBAN_WEBHOOK_SECRET` on the microservice.
