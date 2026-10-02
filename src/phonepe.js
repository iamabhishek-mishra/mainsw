const crypto = require('crypto');
const config = require('./config');

function getPhonePeBaseUrl(cfg) {
  return cfg.env === 'PROD'
    ? 'https://api.phonepe.com/apis/hermes/pg/v1'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1';
}

function phonepeTxnId(orderId) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `SW${stamp}${orderId}`;
}

function base64Sha256(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest().toString('base64');
}

function verifyPhonePeSignature(rawBase64, xVerifyHeader, saltKey) {
  if (!rawBase64 || !xVerifyHeader || !saltKey) return false;
  const expected = String(xVerifyHeader).split('###')[0];
  const digest = base64Sha256(rawBase64 + saltKey);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(digest, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function phonePeCreatePayment(order, db) {
  const cfg = config.phonepe();
  const txnId = phonepeTxnId(order.id);
  await db.run(
    "UPDATE orders SET transaction_id = ?, payment_status = 'pending' WHERE id = ?",
    [txnId, order.id]
  );

  if (!cfg.merchantId || !cfg.saltKey) {
    return [true, `/api/payments/simulate?order_id=${order.id}`, null];
  }

  const amountPaisa = Math.round(order.total * 100);
  let redirectUri = cfg.redirectUri;
  if (!redirectUri) {
    if (cfg.env === 'TEST') {
      redirectUri = `http://127.0.0.1:${config.port}/api/payments/callback`;
    } else {
      return [false, null, 'PHONEPE_REDIRECT_URI is not set; PhonePe requires a public HTTPS callback URL'];
    }
  }

  const payload = {
    merchantId: cfg.merchantId,
    merchantTransactionId: txnId,
    merchantUserId: `MUID${order.user_id || 'GUEST'}`,
    amount: amountPaisa,
    redirectUrl: redirectUri,
    redirectMode: 'REDIRECT',
    callbackUrl: redirectUri,
    mobileNumber: order.phone || '9999999999',
    paymentInstrument: { type: 'PAY_PAGE' },
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify = `${base64Sha256(payloadB64 + cfg.saltKey)}###${cfg.saltIndex}`;

  try {
    const response = await fetch(`${getPhonePeBaseUrl(cfg)}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerify,
        'X-MERCHANT-ID': cfg.merchantId,
      },
      body: JSON.stringify({ request: payloadB64 }),
    });
    const text = await response.text();
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parsed = {};
    }
    if (parsed.success) {
      return [true, parsed.data && parsed.data.redirectUrl, null];
    }
    return [false, null, parsed.message || 'PhonePe payment failed'];
  } catch (e) {
    return [false, null, e.message];
  }
}

module.exports = { phonePeCreatePayment, verifyPhonePeSignature, getPhonePeBaseUrl };