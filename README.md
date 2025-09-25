# message-forward

![Version](https://img.shields.io/github/package-json/v/yocjyet/message-forward?color=blue&logo=github)

A simple tool to forward messages from Zulip to Telegram.

## Setup

Create `.env` file in the root of the project with the following content, replacing `<your-...>` with your own values (remove `<` and `>` as well).

```env

#region Telegram

# Use @BotFather to get the token
TELEGRAM_BOT_TOKEN=<your-token>

# Get chat ID by /ping your bot
USER_PRIVATE_CHAT_ID=<your-private-chat-id>

#endregion

#region Zulip

# Your Zulip account email
ZULIP_EMAIL=<your-account-email>

# Get API key based on https://zulip.com/api/api-keys
ZULIP_KEY=<your-API-key>

# The URL of your Zulip organization server
ZULIP_SITE=<your-zulip-organization-url>

#endregion

## Docker

Create a `docker-compose.yml` file in the root of the project with the following content:

```yaml
services:
  app:
    image: ghcr.io/yocjyet/message-forward:latest  # <- use your owner/repo
    restart: unless-stopped
    environment:
      NODE_ENV: production
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_USER_PRIVATE_CHAT_ID: ${TELEGRAM_USER_PRIVATE_CHAT_ID}
      ZULIP_SITE: ${ZULIP_SITE}
      ZULIP_EMAIL: ${ZULIP_EMAIL}
      ZULIP_KEY: ${ZULIP_KEY}
```

and run:

```bash
docker-compose up -d
```

## Development

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run 
```

### Release

To release a new version, change the version in `package.json` and run:

```bash
git commit -m "chore(release): bump to v0.1.1"
git tag v0.1.1
git push origin main --tags
```

## License

Copyright (c) 2025 Cjyet Yo. [MIT License](LICENSE).
