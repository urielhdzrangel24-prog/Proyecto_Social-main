const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

// Iconos SVG reutilizables desde el sprite externo.
const makeIcon = (name, className = '') => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add(...className.split(' ').filter(Boolean));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `icons.svg#${name}`);
  svg.append(use);
  return svg;
};

document.querySelectorAll('.role-card').forEach((card) => {
  const type = card.classList.contains('role-student') ? 'student' : card.classList.contains('role-teacher') ? 'teacher' : 'parent';
  const oldIcon = card.querySelector('.role-icon');
  if (oldIcon) oldIcon.replaceWith(makeIcon(type, 'role-icon'));
});
document.querySelectorAll('.node-student .node-icon').forEach((icon) => icon.replaceWith(makeIcon('student', 'node-icon')));
document.querySelectorAll('.node-teacher .node-icon').forEach((icon) => icon.replaceWith(makeIcon('teacher', 'node-icon')));

const replaceIcons = (selector, names, className) => {
  document.querySelectorAll(selector).forEach((element, index) => {
    element.replaceWith(makeIcon(names[index % names.length], `${className} ${element.className}`));
  });
};
replaceIcons('.feature-icon', ['book', 'target', 'chart'], 'feature-icon');
replaceIcons('.step-icon', ['target', 'book', 'check', 'chart'], 'step-icon');
replaceIcons('.subject-symbol', ['target', 'book'], 'subject-symbol');
replaceIcons('.dash-sidebar > span:not(.dash-logo):not(.side-bottom)', ['chart', 'book', 'target', 'progress'], 'dashboard-icon');

// La ilustración responde suavemente cuando el cursor entra en su campo cercano.
const heroArt = document.querySelector('.hero-art');
if (heroArt && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  heroArt.addEventListener('pointermove', (event) => {
    const bounds = heroArt.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;
    const distance = Math.hypot(x - centerX, y - centerY);
    const near = distance < Math.min(bounds.width, bounds.height) * .72;
    const strength = near ? Math.max(0, 1 - distance / (Math.min(bounds.width, bounds.height) * .72)) : 0;
    heroArt.style.setProperty('--mx', `${(x / bounds.width) * 100}%`);
    heroArt.style.setProperty('--my', `${(y / bounds.height) * 100}%`);
    heroArt.style.setProperty('--cursor-glow', strength.toFixed(2));
    heroArt.style.setProperty('--cursor-scale', (1 + strength * .14).toFixed(2));
    heroArt.style.setProperty('--core-x', `${(x - centerX) * .035 * strength}px`);
    heroArt.style.setProperty('--core-y', `${(y - centerY) * .035 * strength}px`);
    heroArt.style.setProperty('--student-x', `${(x - bounds.width * .26) * -.025 * strength}px`);
    heroArt.style.setProperty('--student-y', `${(y - bounds.height * .43) * -.025 * strength}px`);
    heroArt.style.setProperty('--teacher-x', `${(x - bounds.width * .74) * -.025 * strength}px`);
    heroArt.style.setProperty('--teacher-y', `${(y - bounds.height * .43) * -.025 * strength}px`);
    heroArt.classList.toggle('is-near', near);
  });
  heroArt.addEventListener('pointerleave', () => {
    heroArt.classList.remove('is-near');
    ['--cursor-glow', '--core-x', '--core-y', '--student-x', '--student-y', '--teacher-x', '--teacher-y'].forEach((property) => heroArt.style.removeProperty(property));
  });
}

menuToggle?.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
});

document.querySelectorAll('.nav-links a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

const revealItems = document.querySelectorAll('.role-card, .feature-grid article, .step, .dashboard-wrap, .comparison');
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.animate(
          [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
        );
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealItems.forEach((item) => observer.observe(item));
}
