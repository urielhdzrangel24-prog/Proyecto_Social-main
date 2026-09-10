const form = document.querySelector('#register-form');
const errorMessage = document.querySelector('#register-error');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.textContent = '';
  const button = form.querySelector('button');
  button.disabled = true;
  button.textContent = 'Creando…';
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No fue posible crear la cuenta.');
    window.location.href = data.user.role === 'teacher' ? '/teacher' : data.user.role === 'student' ? '/student' : '/parent';
  } catch (error) {
    errorMessage.textContent = error.message;
    button.disabled = false;
    button.innerHTML = 'Crear cuenta <span>→</span>';
  }
});
