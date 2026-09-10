const form = document.querySelector('#login-form');
const errorMessage = document.querySelector('#login-error');

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
    window.location.href = data.user.role === 'teacher' ? '/teacher' : data.user.role === 'student' ? '/student' : '/parent';
  } catch (error) {
    errorMessage.textContent = error.message;
    button.disabled = false;
    button.innerHTML = 'Entrar <span>→</span>';
  }
});
