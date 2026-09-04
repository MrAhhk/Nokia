const DESTINATION = 'mr.ahhk142857@gmail.com';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function subscribe(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const body = request.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const company = typeof body.company === 'string' ? body.company.trim() : '';
  const elapsed = Date.now() - Number(body.startedAt || 0);

  if (company) return response.status(200).json({ ok: true });
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return response.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!Number.isFinite(elapsed) || elapsed < 900) {
    return response.status(400).json({ error: 'Please try again in a moment.' });
  }

  try {
    const upstream = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(DESTINATION)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        email,
        _replyto: email,
        _subject: 'New Nokia Retro Phone early-access signup',
        _template: 'table',
        _captcha: 'false',
        source: 'Nokia Retro Phone website'
      })
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result.success === 'false' || result.success === false) {
      throw new Error('Submission service rejected the request.');
    }

    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error('Early-access submission failed:', error.message);
    return response.status(502).json({ error: 'Unable to join right now. Try again in a moment.' });
  }
};
