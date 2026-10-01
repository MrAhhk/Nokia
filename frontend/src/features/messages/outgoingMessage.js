export const normalizeSmsRecipient = (address) => {
  const number = String(address || '').trim().replace(/[\s()-]/g, '');
  if (!/^\+?[0-9]{2,20}$/.test(number)) throw new Error('sms_recipient_required');
  return number;
};

// Choose exactly one transport. A failed app reply must never become an SMS.
export const sendOutgoingMessage = async ({ notificationKey, notification, address, body }, { sendSms, replyNotification }) => {
  if (!body?.trim()) throw new Error('message_body_required');
  if (notification || notificationKey) {
    if (!notificationKey) throw new Error('notification_reply_unavailable');
    const result = await replyNotification(notificationKey, body);
    if (result?.success !== true) throw new Error('notification_reply_failed');
    return result;
  }
  const result = await sendSms(normalizeSmsRecipient(address), body);
  if (result?.sent !== true) throw new Error(result?.error || 'sms_send_unconfirmed');
  return result;
};
