function appUrl() {
  if (process.env.APP_URL) return String(process.env.APP_URL).replace(/\/+$/, '');
  if (!process.env.RENDER) return 'http://localhost:5180';
  return 'https://mynextinvoice.com';
}

function resetEmailContent(resetUrl) {
  return {
    subject: 'Reset your Next Invoice password',
    text: `Reset your password:\n${resetUrl}\n\nThis link expires in 1 hour. If you did not ask for this, ignore the email.`,
    html: `<p>Reset your Next Invoice password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour. If you did not ask for this, ignore the email.</p>`,
  };
}

async function sendPasswordResetEmail(to, resetUrl) {
  const content = resetEmailContent(resetUrl);
  const from = process.env.MAIL_FROM || 'Next Invoice <noreply@mynextinvoice.com>';
  const key = process.env.RESEND_API_KEY;

  if (key) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error('[mail] Resend failed', response.status, body);
      throw new Error('MAIL_FAILED');
    }
    return { sent: true };
  }

  console.warn('[mail] RESEND_API_KEY is not set. Password reset URL:', resetUrl);
  const err = new Error('MAIL_NOT_CONFIGURED');
  err.resetUrl = resetUrl;
  throw err;
}

module.exports = { appUrl, sendPasswordResetEmail };
