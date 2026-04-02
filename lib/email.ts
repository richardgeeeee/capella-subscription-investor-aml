import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendVerificationEmail(to: string, code: string, investorName: string): Promise<void> {
  // In development, just log the code
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[DEV] Verification code for ${to}: ${code}`);
    return;
  }

  const transport = getTransporter();
  await transport.sendMail({
    from: process.env.SMTP_FROM || 'noreply@capella-capital.com',
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
