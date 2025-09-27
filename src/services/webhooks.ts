import adze from 'adze';
import type { Server } from 'bun';

export interface WebhookRequestInfo {
  method: string;
  url: string;
  headers: Record<string, string>;
  userAgent?: string;
  contentType?: string;
  contentLength?: string;
  origin?: string;
  referer?: string;
  timestamp: string;
  ip?: string;
}

export interface WebhooksOptions {
  port: number;
  onHook: (request: Request, info: WebhookRequestInfo) => Promise<void>;
}

export class WebhooksService {
  private opts: WebhooksOptions;
  private app: {
    port: number;
    fetch: (request: Request) => Promise<Response>;
  };
  private server: Server | null = null;
  constructor(opts: WebhooksOptions) {
    this.opts = opts;
    this.app = {
      port: this.opts.port,
      fetch: async (request: Request) => {
        const info: WebhookRequestInfo = {
          method: request.method,
          url: request.url,
          headers: Object.fromEntries(request.headers.entries()),
          userAgent: request.headers.get('user-agent') || undefined,
          contentType: request.headers.get('content-type') || undefined,
          contentLength: request.headers.get('content-length') || undefined,
          origin: request.headers.get('origin') || undefined,
          referer: request.headers.get('referer') || undefined,
          timestamp: new Date().toISOString(),
          ip:
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            request.headers.get('cf-connecting-ip') ||
            undefined,
        };

        adze.info('[Webhooks] Webhooks accessed', {
          method: info.method,
          url: info.url,
          userAgent: info.userAgent,
          contentType: info.contentType,
          ip: info.ip,
        });

        await this.opts.onHook(request, info);
        return new Response('Success!');
      },
    };
    adze.info('[Webhooks] Webhooks service initialized');
  }

  async start() {
    this.server = Bun.serve(this.app);
    adze.info(`[Webhooks] Webhooks service started at ${this.server.url}`);
  }

  async stop() {
    adze.info('[Webhooks] Webhooks service stopped');
    this.server?.stop();
    this.server = null;
  }
}
