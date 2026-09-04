document.documentElement.classList.add('motion-ready');

const form = document.querySelector('#early-access');
const statusNode = document.querySelector('[data-form-status]');
const submitButton = form?.querySelector('button[type="submit"]');
const submitLabel = document.querySelector('[data-button-label]');
const startedAt = form?.querySelector('[name="startedAt"]');

if (startedAt) startedAt.value = String(Date.now());

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const emailInput = form.elements.email;

  if (!emailInput.checkValidity()) {
    statusNode.dataset.state = 'error';
    statusNode.textContent = 'Enter a valid email address.';
    emailInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitLabel.textContent = 'Joining…';
  statusNode.dataset.state = '';
  statusNode.textContent = 'Saving your place…';

  try {
    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        company: form.elements.company.value,
        startedAt: Number(startedAt.value)
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to join right now.');

    statusNode.dataset.state = 'success';
    statusNode.textContent = 'You’re on the list. Watch your inbox.';
    form.reset();
    startedAt.value = String(Date.now());
  } catch (error) {
    statusNode.dataset.state = 'error';
    statusNode.textContent = error.message || 'Unable to join right now. Try again in a moment.';
  } finally {
    submitButton.disabled = false;
    submitLabel.textContent = 'Join early access';
  }
});

const phoneViews = [
  { kicker: 'FRIDAY · SEPT 05', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }), message: 'Choose what matters.', left: 'Menu', right: 'Focus' },
  { kicker: 'FOCUS MODE', time: '01', message: 'One task. No interruptions.', left: 'Back', right: 'Start' },
  { kicker: 'DESIGN RULE', time: '0∞', message: 'No feed. No streak. No noise.', left: 'Back', right: 'Good' }
];

let activeView = 0;
let dialed = '';
const lcdTime = document.querySelector('[data-lcd-time]');
const lcdMessage = document.querySelector('[data-lcd-message]');
const lcdKicker = document.querySelector('.lcd-kicker');
const softLeft = document.querySelector('[data-soft-left]');
const softRight = document.querySelector('[data-soft-right]');

function renderPhoneView() {
  const view = phoneViews[activeView];
  lcdKicker.textContent = view.kicker;
  lcdTime.textContent = view.time;
  lcdMessage.textContent = view.message;
  softLeft.textContent = view.left;
  softRight.textContent = view.right;
}

function pressEffect(button) {
  button.classList.add('is-pressed');
  window.setTimeout(() => button.classList.remove('is-pressed'), 90);
}

document.querySelectorAll('[data-key]').forEach((button) => {
  button.addEventListener('click', () => {
    pressEffect(button);
    dialed = (dialed + button.dataset.key).slice(-9);
    lcdKicker.textContent = 'KEYPAD READY';
    lcdTime.textContent = dialed;
    lcdMessage.textContent = 'A small interaction. A clear result.';
    softLeft.textContent = 'Clear';
    softRight.textContent = 'Done';
  });
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    pressEffect(button);
    const action = button.dataset.action;
    if (action === 'previous') activeView = (activeView + phoneViews.length - 1) % phoneViews.length;
    if (action === 'next' || action === 'select' || action === 'call') activeView = (activeView + 1) % phoneViews.length;
    if (action === 'end') activeView = 0;
    dialed = '';
    renderPhoneView();
  });
});

document.querySelector('[data-year]').textContent = new Date().getFullYear();

const revealNodes = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });
  revealNodes.forEach((node) => observer.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add('is-visible'));
}

renderPhoneView();
