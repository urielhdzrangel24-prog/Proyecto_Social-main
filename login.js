const form = document.querySelector('#login-form');
const errorMessage = document.querySelector('#login-error');
const authFeedback = document.querySelector('#auth-feedback');
const showAuthFeedback = (message, type = '') => { document.querySelector('#auth-feedback-message').textContent = message; authFeedback.className = `auth-feedback show ${type}`; };
document.querySelector('#auth-feedback-close')?.addEventListener('click', () => authFeedback.classList.remove('show'));

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.textContent = '';
  const button = form.querySelector('button');
  button.disabled = true;
  button.textContent = 'Entrando…';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No fue posible iniciar sesión.');
    showAuthFeedback('Sesión iniciada. Preparando tu espacio…');
    window.setTimeout(() => { window.location.href = data.user.role === 'teacher' ? '/teacher' : data.user.role === 'student' ? '/student' : '/parent'; }, 450);
  } catch (error) {
    errorMessage.textContent = error.message;
    showAuthFeedback(error.message, 'error');
    button.disabled = false;
    button.innerHTML = 'Entrar <span>→</span>';
  }
});
