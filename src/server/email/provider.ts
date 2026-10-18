import { serverEnv } from '@/lib/env';

/**
 * Transactional email.
 *
 * Provider is selected by env. The console provider is the only one usable before
 * real credentials exist (approval gate #1): it logs instead of sending, and the
 * Resend path throws rather than silently pretending an email went out.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
  readonly name: string;
}

class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<void> {
    console.log(
      [
        '[email:dev] ---------------------------------------------',
        `  to     : ${message.to}`,
        `  subject: ${message.subject}`,
        '---------------------------------------------------------',
      ].join('\n'),
    );
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  async send(message: EmailMessage): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('EMAIL_ENABLED=true but RESEND_API_KEY is missing');
    }

    // Imported lazily so the dependency is only loaded when actually enabled.
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM ?? 'ecomerce-store <orders@example.com>';

    const { error } = await resend.emails.send({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      throw new Error(`Resend rejected the email: ${error.message}`);
    }
  }
}

export function getEmailProvider(): EmailProvider {
  const enabled = process.env.EMAIL_ENABLED === 'true';
  if (!enabled) return new ConsoleEmailProvider();
  return new ResendEmailProvider();
}

export function siteUrl(): string {
  return serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
}
