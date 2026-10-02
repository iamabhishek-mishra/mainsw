const express = require('express');
const { getDb } = require('../db');
const config = require('../config');
const { phonePeCreatePayment, verifyPhonePeSignature } = require('../phonepe');
const { sendOrderConfirmationEmail } = require('../mailer');

const router = express.Router();

function redirect(res, url) {
  res
    .status(303)
    .location(url)
    .send(`<meta http-equiv='refresh' content='0; url=${url}'>Redirecting...`);
}

async function markOrderPaid(db, order, txnId) {
  const newStatus = order.order_status && order.order_status !== 'pending'
    ? order.order_status
    : 'confirmed';
  await db.run(
    'UPDATE orders SET payment_status = ?, transaction_id = ?, order_status = ? WHERE id = ?',
    ['paid', txnId, newStatus, order.id]
  );
  const fresh = await db.get('SELECT * FROM orders WHERE id = ?', [order.id]);
  if (fresh) await sendOrderConfirmationEmail(fresh);
}

router.post('/payments/init', async (req, res) => {
  const db = getDb();
  const oid = parseInt((req.body || {}).order_id, 10);
  if (!Number.isInteger(oid)) return res.status(400).json({ error: 'order_id is required' });
  const order = await db.get('SELECT * FROM orders WHERE id = ?', [oid]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const [ok, redirectUrl, err] = await phonePeCreatePayment(order, db);
  if (!ok) return res.status(400).json({ error: err || 'Payment could not be started' });
  res.json({ ok: true, order_id: oid, redirect_url: redirectUrl });
});

router.get('/payments/callback', async (req, res) => {
  const db = getDb();
  const qs = req.query;
  const txnId = qs.txnId || qs.merchantTransactionId || '';
  const status = String(qs.status || '');
  const signedPayload = String(qs.signedPayload || '');

  const order = await db.get('SELECT * FROM orders WHERE transaction_id = ? OR id = ?', [txnId, txnId]);
  if (!order) return redirect(res, '/#/orders');

  const cfg = config.phonepe();
  const paid = ['success', 'paid'].includes(status.toLowerCase());

  if (cfg.merchantId && cfg.saltKey) {
    const valid = verifyPhonePeSignature(signedPayload, req.headers['x-verify'] || '', cfg.saltKey);
    if (!(valid && paid)) {
      await db.run("UPDATE orders SET payment_status = 'failed' WHERE id = ?", [order.id]);
      return redirect(res, `/#/order?id=${order.id}&status=failed`);
    }
  }

  if (paid) {
    await markOrderPaid(db, order, txnId || order.transaction_id);
    return redirect(res, `/#/order?id=${order.id}&status=paid`);
  }

  await db.run("UPDATE orders SET payment_status = 'failed' WHERE id = ?", [order.id]);
  return redirect(res, `/#/order?id=${order.id}&status=failed`);
});

router.get('/payments/simulate', async (req, res) => {
  const db = getDb();
  const oid = String(req.query.order_id || '');
  const order = await db.get("SELECT * FROM orders WHERE id = ? AND payment_status = 'pending'", [oid]);
  if (!order) return redirect(res, '/#/orders');

  const status = String(req.query.status || 'success');
  if (status === 'success') {
    await markOrderPaid(db, order, order.transaction_id || `SIM${order.id}`);
  } else {
    await db.run("UPDATE orders SET payment_status = 'failed' WHERE id = ?", [order.id]);
  }
  return redirect(res, `/#/order?id=${oid}&status=${status}`);
});

module.exports = router;