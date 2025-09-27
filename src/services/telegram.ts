import { blockquote, bold, Bot, expandableBlockquote, format, FormattableString, User } from 'gramio';
import adze from 'adze';

export interface TelegramOptions {
  botToken: string;
  userPrivateChatId?: number;
}

export type ForwardedData = {
  header: string;
  from: string;
  with?: string[];
  content: string | FormattableString;
  url?: string;
};

export class TelegramService {
  private bot: Bot;
  private userChatId?: number;

  constructor(opts: TelegramOptions) {
    adze.debug('[Telegram] Initializing TelegramService', opts);
    if (!opts.botToken) throw new Error('TELEGRAM_BOT_TOKEN is not set');

    this.bot = new Bot(opts.botToken);
    this.userChatId = opts.userPrivateChatId;

    adze.info(
      `[Telegram] Telegram bot set ${
        this.userChatId ? `with user private chat ID ${this.userChatId}` : 'without user private chat ID'
      }`
    );

    this.bot.command('start', (context) => {
      context.send('Hello, world!');
      if (context.from) adze.info(`[Telegram] ${TelegramService.formatUser(context.from)} started the bot`);
    });

    this.bot.command('ping', (context) => {
      context.send('Pong!');
      adze.info(
        `[Telegram] ${TelegramService.formatUser(context.from)} pinged the bot in chat ${context.chat.id}`,
        context.update
      );
    });

    this.bot.on('message', (context) => {
      adze.info(`[Telegram] ${TelegramService.formatUser(context.from)} sent a message`, context.update);
    });

    process.once('SIGINT', () => {
      adze.info('[Telegram] SIGINT received; stopping Telegram bot');
      this.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      adze.info('[Telegram] SIGTERM received; stopping Telegram bot');
      this.stop('SIGTERM');
    });
  }

  /** Launch the bot (must be called before sending). */
  async launch() {
    adze.info('[Telegram] Telegram bot launching');
    await this.bot.start();

    if (!this.userChatId) {
      adze.warn('[Telegram] USER_PRIVATE_CHAT_ID is not set; cannot send DM to the operator.');
    } else {
      this.sendToUser(`Bot v${process.env.npm_package_version} launched at ${new Date().toISOString()}`, false);
    }
  }

  /** Send a plain text message to any chat id. */
  async send(
    chatId: number,
    text:
      | string
      | {
          toString(): string;
        },
    options?: { linkPreview?: boolean }
  ) {
    await this.bot.api.sendMessage({
      chat_id: chatId,
      text,
      link_preview_options: options?.linkPreview
        ? {
            is_disabled: false,
          }
        : {
            is_disabled: true,
          },
    });
    adze.info(`[Telegram] Message sent to chat ${chatId}: ${text}`);
  }

  async sendForwarded(chatId: number, data: ForwardedData) {
    const header = bold`${data.header}`;
    const from = `From: ${data.from}`;
    const withLine = data.with && data.with.length > 0 ? `With: ${data.with.join(', ')}` : '';
    const linkLine = data.url ? `\n\n🔗 View in Zulip: ${data.url}` : '';

    const content = expandableBlockquote`${data.content}`;
    try {
      await this.send(chatId, format`${header}\n${from}${withLine ? '\n' + withLine : ''}\n\n${content}${linkLine}`, {
        linkPreview: false,
      });
    } catch (error) {
      adze.error('[Telegram] Error sending forwarded message', error);
      await this.send(
        chatId,
        format`${header}\n${from}${
          withLine ? '\n' + withLine : ''
        }\n\n${bold`Error:`} Cannot format forwarded message${linkLine}`,
        {
          linkPreview: false,
        }
      );
    }
  }

  /** Convenience: send to the operator’s private DM if configured. */
  async sendToUser(text: string) {
    if (!this.userChatId) return;
    await this.send(this.userChatId, text);
  }

  async sendForwardedToUser(data: ForwardedData) {
    if (!this.userChatId) return;
    await this.sendForwarded(this.userChatId, data);
  }

  /** Stop the bot gracefully. */
  stop(reason: string) {
    adze.info(`[Telegram] Stopping Telegram bot: ${reason}`);
    try {
      this.bot.stop();
    } catch (error) {
      adze.error('[Telegram] Error stopping Telegram bot', error);
      console.trace(error);
    }
  }

  static formatUser(user: User) {
    return `${user.firstName} ${user.lastName ?? ''} (@${user.username}, ${user.id})`;
  }
}
