import { getReadMap, markAddressAsRead, isConversationUnread } from './smsReadStatus';

describe('smsReadStatus', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('marks address as read and computes unread properly', () => {
    const conv = { address: '0912345678', threadId: '10', date: 1000, unread: true };
    const initialMap = getReadMap();
    expect(isConversationUnread(conv, initialMap)).toBe(true);

    markAddressAsRead(conv.address, conv.threadId);
    const updatedMap = getReadMap();
    expect(isConversationUnread(conv, updatedMap)).toBe(false);

    // If a newer message arrives later
    const newerConv = { address: '0912345678', threadId: '10', date: Date.now() + 5000, unread: true };
    expect(isConversationUnread(newerConv, updatedMap)).toBe(true);
  });
});
