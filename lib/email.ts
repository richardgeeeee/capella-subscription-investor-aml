import sgMail from '@sendgrid/mail';

let initialized = false;

function init() {
  if (!initialized && process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    initialized = true;
  }
}

const DEFAULT_FROM = 'Capella Capital <richard.ge@capella-capital.com>';

export async function sendVerificationEmail(to: string, code: string, investorName: string): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log(`[DEV] Verification code for ${to}: ${code}`);
    return;
  }

  init();
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  await sgMail.send({
    from,
    to,
    subject: 'Capella Alpha Fund - Verification Code / 奕卓資本 - 验证码',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Capella Alpha Fund / 奕卓資本</h2>
        <p>Dear ${investorName},</p>
        <p>Your verification code is / 您的验证码是：</p>
        <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 20px 0;">
          ${code}
        </div>
        <p>This code will expire in 10 minutes. / 此验证码将在10分钟后过期。</p>
        <p>If you did not request this code, please ignore this email.<br/>
        如果您没有请求此验证码，请忽略此邮件。</p>
        <hr style="margin: 20px 0;" />
        <p style="color: #888; font-size: 12px;">Capella Capital Limited / 奕卓資本有限公司</p>
      </div>
    `,
  });
}

export async function sendInvitationEmail(
  to: string,
  investorName: string,
  link: string,
  expiresAt: string,
  template: { subject: string; body_html: string }
): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log(`[DEV] Invitation email for ${to}: ${link}`);
    return;
  }

  init();
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const formattedExpiry = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const subject = template.subject
    .replace(/\{\{investorName\}\}/g, investorName)
    .replace(/\{\{link\}\}/g, link)
    .replace(/\{\{expiresAt\}\}/g, formattedExpiry);

  const html = template.body_html
    .replace(/\{\{investorName\}\}/g, investorName)
    .replace(/\{\{link\}\}/g, link)
    .replace(/\{\{expiresAt\}\}/g, formattedExpiry);

  await sgMail.send({ from, to, subject, html });
}
