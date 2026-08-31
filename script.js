const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
    toggle.textContent = open ? 'Close' : 'Menu';
  });
}

const contactForm = document.querySelector('[data-contact-form]');
if (contactForm) {
  const status = contactForm.querySelector('.form-status');
  const submitButton = contactForm.querySelector('button[type="submit"]');
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault(); submitButton.disabled = true; status.textContent = 'Sending your request…'; status.className = 'form-status';
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(contactForm))) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to send your request.');
      contactForm.reset(); status.textContent = 'Thanks—we’ll be in touch shortly.'; status.classList.add('is-success');
    } catch (error) { status.textContent = error.message || 'Something went wrong. Please email us directly.'; status.classList.add('is-error'); }
    finally { submitButton.disabled = false; }
  });
}
