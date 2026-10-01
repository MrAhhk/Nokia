import { sendOutgoingMessage, normalizeSmsRecipient } from './outgoingMessage';

test('requires a concrete number instead of guessing a contact', () => {
  expect(normalizeSmsRecipient(' +84 (90) 123-4567 ')).toBe('+84901234567');
  expect(() => normalizeSmsRecipient('Nam')).toThrow('recipient');
  expect(() => normalizeSmsRecipient('Nam 090123')).toThrow('recipient');
});

test('a failed notification reply never falls through to SMS', async () => {
  const sendSms = jest.fn();
  const replyNotification = jest.fn().mockResolvedValue({ success: false });
  await expect(sendOutgoingMessage({ notificationKey: 'key', address: '0901234567', body: 'hello' },
    { sendSms, replyNotification })).rejects.toThrow();
  expect(sendSms).not.toHaveBeenCalled();
});

test.each([{ sent: false }, { sent: false, fallback: true }, { status: 'unknown' }, undefined])(
  'does not turn an unconfirmed send into success: %j', async (result) => {
    await expect(sendOutgoingMessage({ address: '0901234567', body: 'hello' },
      { sendSms: jest.fn().mockResolvedValue(result) })).rejects.toThrow();
  });

test('returns only an acknowledged SMS submission', async () => {
  await expect(sendOutgoingMessage({ address: '0901234567', body: 'hello' },
    { sendSms: jest.fn().mockResolvedValue({ sent: true }) })).resolves.toEqual({ sent: true });
});
