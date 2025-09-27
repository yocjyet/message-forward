import adze from 'adze';

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
    const server = Bun.serve(this.app);
    adze.info(`[Webhooks] Webhooks service started at ${server.url}`);
  }

  async stop() {
    adze.info('[Webhooks] Webhooks service stopped');
  }
}
