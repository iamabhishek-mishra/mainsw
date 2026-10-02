const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('./config');

function buildEmail(order) {
  let items = [];
  try {
    items = JSON.parse(order.items);
  } catch (e) {
    items = [];
  }
  const itemLines = items.map((i) => `  - Product #${i.id}  x${i.qty || 1}`).join('\n');
  const body =
    `Dear ${order.name},\n\n` +
    `Thank you for your order with Sudha Wellness!\n\n` +
    `Order ID    : #${order.id}\n` +
    `Total       : Rs. ${order.total}\n` +
    `Payment     : ${String(order.payment_method || '').toUpperCase()} (${order.payment_status || ''})\n` +
    `Order status: ${order.order_status || ''}\n\n` +
    `Items:\n${itemLines || '  -'}\n\n` +
    `We will contact you on ${order.phone || order.email} for delivery updates.\n\n` +
    `Warm regards,\nSudha Wellness\nDhanbad, Jharkhand 828106\n`;
  return { subject: `Your Sudha Wellness order #${order.id} is confirmed`, body };
}

async function sendOrderConfirmationEmail(order) {
  const cfg = config.smtp();
  const { subject, body } = buildEmail(order);

  if (cfg.logDir) {
    fs.mkdirSync(cfg.logDir, { recursive: true });
    fs.appendFileSync(
      path.join(cfg.logDir, 'emails.log'),
      `${new Date().toISOString()}\nTO:${order.email}\nSUBJECT:${subject}\n${body}\n${'-'.repeat(40)}\n`
    );
  }

  if (!cfg.host) return [false, 'SMTP not configured; confirmation recorded locally'];

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    });
    await transporter.sendMail({ from: cfg.from, to: order.email, subject, text: body });
    return [true, `Email sent to ${order.email}`];
  } catch (e) {
    return [false, `Email failed: ${e.message}`];
  }
}

module.exports = { sendOrderConfirmationEmail };