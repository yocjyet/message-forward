import adze from 'adze';

export interface ZulipOptions {
  site: string; // e.g. https://your-org.zulipchat.com
  email: string; // your Zulip (or bot) email
  apiKey: string; // API key
  applyMarkdown?: boolean; // if true, server renders message content (HTML)
}

export type ZulipPrivateMessage = {
  id: number;
  sender_full_name: string;
  sender_email: string;
  content: string; // raw or rendered text depending on applyMarkdown
  display_recipient: Array<{ id: number; email: string; full_name: string }>;
  timestamp: number;
};

export type ZulipDMHandler = (msg: ZulipPrivateMessage) => Promise<void> | void;

type QueueState = {
  queue_id: string;
  last_event_id: number;
};

export class ZulipService {
  private opts: ZulipOptions;
  private state: QueueState | null = null;
  private running = false;

  constructor(opts: ZulipOptions) {
    adze.debug('Initializing ZulipService', opts);
    if (!opts.site || !opts.email || !opts.apiKey) {
      throw new Error('Zulip config missing (site/email/apiKey).');
    }
    this.opts = opts;
    adze.info(`Zulip service initialized for site: ${opts.site}, email: ${opts.email}`);
  }

  private authHeader() {
    const b64 = Buffer.from(`${this.opts.email}:${this.opts.apiKey}`).toString('base64');
    return { Authorization: `Basic ${b64}` };
  }

  private async registerQueue() {
    adze.info('Registering Zulip event queue...');
    const body = new URLSearchParams();
    body.set('event_types', JSON.stringify(['message']));
    if (this.opts.applyMarkdown) {
      body.set('apply_markdown', 'true');
      adze.debug('Markdown rendering enabled for Zulip messages');
    }

    const res = await fetch(`${this.opts.site}/api/v1/register`, {
      method: 'POST',
      headers: this.authHeader(),
      body,
    });

    if (!res.ok) {
      const t = await res.text();
      adze.error(`Zulip register failed: ${res.status} ${t}`);
      throw new Error(`Zulip register failed: ${res.status} ${t}`);
    }

    const data = (await res.json()) as any;
    this.state = {
      queue_id: data.queue_id,
      last_event_id: data.last_event_id ?? -1,
    };

    adze.info(`Zulip queue registered successfully: ${this.state.queue_id}, last_event_id=${this.state.last_event_id}`);
  }

  /** Start long-polling loop; calls onDM for each private message to you. */
  async start(onDM: ZulipDMHandler) {
    if (this.running) {
      adze.warn('Zulip service is already running');
      return;
    }
    adze.info('Starting Zulip service...');
    this.running = true;

    if (!this.state) {
      adze.info('No existing queue state found, registering new queue...');
      await this.registerQueue();
    } else {
      adze.info(`Resuming with existing queue: ${this.state.queue_id}`);
    }

    adze.info('Starting Zulip event polling loop...');
    while (this.running) {
      try {
        const params = new URLSearchParams({
          queue_id: this.state!.queue_id,
          last_event_id: String(this.state!.last_event_id),
          // omit dont_block to allow proper long-polling
        });

        adze.debug(
          `Polling Zulip events from queue ${this.state!.queue_id}, last_event_id=${this.state!.last_event_id}`
        );
        const res = await fetch(`${this.opts.site}/api/v1/events?${params}`, {
          headers: this.authHeader(),
          // Optionally set a long timeout on your HTTP client if needed
        });

        if (!res.ok) {
          const txt = await res.text();
          if (txt.includes('BAD_EVENT_QUEUE_ID')) {
            adze.warn('Zulip queue expired; re-registering…');
            this.state = null;
            await this.registerQueue();
            continue;
          }
          adze.error(`Zulip events API error: ${res.status} ${txt}`);
          throw new Error(`Zulip events error: ${res.status} ${txt}`);
        }

        const data = (await res.json()) as any;
        const events = (data.events ?? []) as Array<any>;

        if (events.length > 0) {
          adze.debug(`Received ${events.length} events from Zulip`);
        }

        for (const ev of events) {
          this.state!.last_event_id = Math.max(this.state!.last_event_id, ev.id ?? this.state!.last_event_id);

          if (ev.type === 'message' && ev.message?.type === 'private') {
            const m = ev.message;
            // ignore messages sent by self
            // if (m.sender_email?.toLowerCase() === this.opts.email.toLowerCase()) {
            //   adze.debug(`Ignoring message from self (${m.sender_email})`);
            //   continue;
            // }

            adze.info(`Received private message from ${m.sender_full_name} (${m.sender_email})`);
            const normalized: ZulipPrivateMessage = {
              id: m.id,
              sender_full_name: m.sender_full_name,
              sender_email: m.sender_email,
              content: m.content,
              display_recipient: Array.isArray(m.display_recipient) ? m.display_recipient : [],
              timestamp: m.timestamp,
            };

            await onDM(normalized);
          }
        }
      } catch (err) {
        adze.error('Zulip polling error', err);
        // gentle backoff
        adze.info('Waiting 3 seconds before retrying...');
        await new Promise((r) => setTimeout(r, 3000));
        if (!this.state) {
          try {
            adze.info('Attempting to re-register Zulip queue after error...');
            await this.registerQueue();
          } catch (e) {
            adze.error('Failed to re-register Zulip queue', e);
            adze.info('Waiting 5 seconds before retrying queue registration...');
            await new Promise((r) => setTimeout(r, 5000));
          }
        }
      }
    }
    adze.info('Zulip polling loop ended');
  }

  stop() {
    adze.info('Stopping Zulip service...');
    this.running = false;
    adze.info('Zulip service stopped');
  }
}
