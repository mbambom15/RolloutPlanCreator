document.addEventListener('DOMContentLoaded', function () {
  const form = document.querySelector('#feedback form');
  if (!form) return;

  const statusEl = document.getElementById('feedbackStatus');
  const submitBtn = form.querySelector('input[type="submit"]');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const recommendValues = Array.from(
      document.querySelectorAll('input[name="recommend"]:checked')
    ).map(el => el.value);

    const payload = {
      recommend: recommendValues.join(', '),
      suggestions: document.getElementById('suggestions')?.value || '',
      rating: document.getElementById('review')?.value || '',
      firstName: document.getElementById('name')?.value || '',
      lastName: document.getElementById('surname')?.value || '',
      email: document.getElementById('email')?.value || ''
    };

    const originalLabel = submitBtn ? submitBtn.value : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.value = 'Sending…';
    }
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.style.color = '';
    }

    try {
      const resp = await fetch('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(result.error || 'Could not send feedback.');
      }
      if (statusEl) {
        statusEl.textContent = 'Thanks — your feedback has been sent.';
        statusEl.style.color = '#2E7D5B';
      }
      form.reset();
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message || 'Something went wrong sending your feedback.';
        statusEl.style.color = '#B23B2E';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.value = originalLabel;
      }
    }
  });
});
