import adze from 'adze';
import type { Server } from 'bun';

export interface WebhooksOptions {
  port: number;
  onHook: (request: Request) => Promise<void>;
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
        adze.info('[Webhooks] Webhooks accessed at ', request.url);
        await this.opts.onHook(request);
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
