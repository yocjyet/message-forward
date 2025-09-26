import adze, { setup as adzeSetup } from 'adze';
import { TelegramService } from './telegram';
import { ZulipService } from './zulip';
import { bold } from 'gramio';
import { convertMarkdownToGramio } from './utils/markdown';

if (process.env.NODE_ENV !== 'production') {
  adzeSetup({
    activeLevel: 7,
  });
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    adze.error(`${name} is not set`);
    throw new Error(`${name} is not set`);
  }
  return v;
}

(async () => {
  // --- Load env
  const TELEGRAM_BOT_TOKEN = requireEnv('TELEGRAM_BOT_TOKEN');
  const TELEGRAM_USER_PRIVATE_CHAT_ID = process.env.TELEGRAM_USER_PRIVATE_CHAT_ID
    ? Number(process.env.TELEGRAM_USER_PRIVATE_CHAT_ID)
    : undefined;

  const ZULIP_SITE = requireEnv('ZULIP_SITE'); // e.g. https://your-org.zulipchat.com
  const ZULIP_EMAIL = requireEnv('ZULIP_EMAIL');
  const ZULIP_KEY = requireEnv('ZULIP_KEY');

  adze.info(`All required environment variables are set`);

  // --- Init Telegram
  const telegram = new TelegramService({
    botToken: TELEGRAM_BOT_TOKEN,
    userPrivateChatId: TELEGRAM_USER_PRIVATE_CHAT_ID,
  });
  adze.info('Telegram service initialized');

  // --- Init Zulip
  const zulip = new ZulipService({
    site: ZULIP_SITE,
    email: ZULIP_EMAIL,
    apiKey: ZULIP_KEY,
    // applyMarkdown: true, // uncomment to get server-rendered HTML content (then send as HTML to Telegram)
  });
  adze.info('Zulip service initialized');

  adze.info('Starting services in parallel');

  const tgStart = telegram.launch();
  // --- Wire: Zulip DM -> Telegram DM
  await zulip.start(async (msg) => {
    const header = `📩 Zulip DM`;
    const from = `${bold`${msg.sender_full_name}`} (${msg.sender_email})`;
    const names = msg.display_recipient.map((p) => p.full_name).filter((n) => n !== msg.sender_full_name);

    function preprocessContent(content: string): string {
      return content.replace(/@_?\*\*/g, '@ **');
    }

    const content = convertMarkdownToGramio(preprocessContent(msg.content), { baseUrl: ZULIP_SITE });
    const url = `${ZULIP_SITE}#narrow/near/${msg.id}`;

    // If applyMarkdown=true, msg.content is HTML; switch to parse_mode HTML in TelegramService if you prefer.
    await telegram.sendForwardedToUser({ header, from, with: names, content, url });
    adze.info(`Forwarded Zulip DM ${msg.id} from ${msg.sender_full_name}`);
  });
  await tgStart;

  // --- Shutdown hooks
  const stopAll = () => {
    zulip.stop();
    telegram.stop('shutdown');
  };
  process.once('SIGINT', stopAll);
  process.once('SIGTERM', stopAll);
})();
