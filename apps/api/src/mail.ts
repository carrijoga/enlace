import nodemailer from 'nodemailer';
import type { ApiConfig } from './config.js';

export function createMailSender(config: ApiConfig) {
  if (!config.smtpHost || !config.smtpPort || !config.smtpFrom) return undefined;
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    ...(config.smtpUser && config.smtpPassword
      ? { auth: { user: config.smtpUser, pass: config.smtpPassword } }
      : {}),
  });
  return async (to: string, url: string) => {
    await transport.sendMail({
      from: config.smtpFrom,
      to,
      subject: 'Redefinição de senha do Enlace',
      text: `Use este link para redefinir sua senha: ${url}\nSe você não solicitou, ignore esta mensagem.`,
    });
  };
}
