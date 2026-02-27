/**
 * GSAP Animations - Portfolio
 * Handles: Terminal intro, ScrollTrigger reveals, parallax, magnetic buttons,
 * custom cursor, particle background
 */

document.addEventListener('DOMContentLoaded', function () {
  if (typeof IS_DEV_MODE !== 'undefined' && IS_DEV_MODE) return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  initTerminalIntro();
  initScrollReveals();
  initParallax();
  initMagneticButtons();
  initCustomCursor();
  initParticleBackground();
  initProjectCardTilt();
});

/**
 * Phase 4: Terminal-style hero intro
 */
function initTerminalIntro() {
  const terminalIntro = document.getElementById('terminal-intro');
  const heroReveal = document.querySelector('.hero-reveal');
  const typingEl = document.getElementById('terminal-typing');

  if (!terminalIntro || !heroReveal || !typingEl) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    terminalIntro.style.display = 'none';
    heroReveal.style.opacity = '1';
    return;
  }

  const terminalText = 'whoami → Rudraksh Bhandari';
  let charIndex = 0;

  function typeChar() {
    if (charIndex < terminalText.length) {
      typingEl.textContent += terminalText.charAt(charIndex);
      charIndex++;
      setTimeout(typeChar, 80);
    } else {
      setTimeout(() => {
        gsap.to(terminalIntro, {
          opacity: 0,
          y: -20,
          duration: 0.5,
          ease: 'power2.inOut',
          onComplete: () => {
            terminalIntro.style.display = 'none';
            gsap.fromTo(heroReveal, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' });
          },
        });
      }, 600);
    }
  }

  // Start typing after brief delay
  setTimeout(typeChar, 800);
}

/**
 * Phase 2: Scroll-triggered staggered reveals
 */
function initScrollReveals() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  gsap.utils.toArray('.reveal-el').forEach((el, i) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 60 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none reverse',
        },
        delay: i * 0.05,
      }
    );
  });

  // Staggered project cards
  gsap.utils.toArray('.project-card').forEach((card, i) => {
    gsap.fromTo(
      card,
      { opacity: 0, y: 80 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 90%',
          toggleActions: 'play none none reverse',
        },
        delay: i * 0.1,
      }
    );
  });

  // Experience items
  gsap.utils.toArray('.experience-item').forEach((item, i) => {
    gsap.fromTo(
      item,
      { opacity: 0, x: i % 2 === 0 ? -50 : 50 },
      {
        opacity: 1,
        x: 0,
        duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: item,
          start: 'top 88%',
          toggleActions: 'play none none reverse',
        },
        delay: i * 0.08,
      }
    );
  });

  // Skill categories
  gsap.utils.toArray('.skill-category').forEach((cat, i) => {
    gsap.fromTo(
      cat,
      { opacity: 0, scale: 0.95 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: cat,
          start: 'top 90%',
          toggleActions: 'play none none reverse',
        },
        delay: i * 0.06,
      }
    );
  });
}

/**
 * Phase 2: Parallax on hero image
 */
function initParallax() {
  const heroImage = document.querySelector('.hero-image');
  const hero = document.querySelector('.hero');

  if (!heroImage || !hero) return;

  ScrollTrigger.create({
    trigger: hero,
    start: 'top top',
    end: 'bottom top',
    scrub: 1,
    onUpdate: self => {
      const progress = self.progress;
      gsap.set(heroImage, { y: progress * 80 });
    },
  });
}

/**
 * Phase 2: Magnetic button effect
 */
function initMagneticButtons() {
  const buttons = document.querySelectorAll('.magnetic-btn');

  buttons.forEach(btn => {
    btn.addEventListener('mousemove', function (e) {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      gsap.to(btn, {
        x: x * 0.2,
        y: y * 0.2,
        duration: 0.3,
        ease: 'power2.out',
      });
    });

    btn.addEventListener('mouseleave', function () {
      gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
    });
  });
}

/**
 * Phase 2: Custom cursor (desktop only)
 */
function initCustomCursor() {
  const cursor = document.getElementById('custom-cursor');
  const cursorDot = document.getElementById('custom-cursor-dot');

  if (!cursor || !cursorDot) return;

  // Hide on touch devices
  if ('ontouchstart' in window) {
    cursor.style.display = 'none';
    cursorDot.style.display = 'none';
    return;
  }

  let mouseX = 0;
  let mouseY = 0;
  let cursorX = 0;
  let cursorY = 0;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Smooth follow for outer cursor
  function animateCursor() {
    cursorX += (mouseX - cursorX) * 0.15;
    cursorY += (mouseY - cursorY) * 0.15;

    cursor.style.left = cursorX + 'px';
    cursor.style.top = cursorY + 'px';
    cursorDot.style.left = mouseX + 'px';
    cursorDot.style.top = mouseY + 'px';

    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  // Hover states
  const hoverTargets = document.querySelectorAll('a, button, .project-card');
  hoverTargets.forEach(el => {
    el.addEventListener('mouseenter', () => {
      cursor.classList.add('cursor-hover');
      cursorDot.classList.add('cursor-hover');
    });
    el.addEventListener('mouseleave', () => {
      cursor.classList.remove('cursor-hover');
      cursorDot.classList.remove('cursor-hover');
    });
  });
}

/**
 * Phase 4: Canvas particle background
 */
function initParticleBackground() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particles = [];
  let animationId;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initParticles();
  }

  function initParticles() {
    particles = [];
    const count = Math.min(80, Math.floor((canvas.width * canvas.height) / 15000));

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.2,
      });
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(99, 102, 241, ${p.opacity})`;
      ctx.fill();
    });

    // Draw connections
    particles.forEach((p1, i) => {
      particles.slice(i + 1).forEach(p2 => {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(99, 102, 241, ${0.1 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      });
    });

    animationId = requestAnimationFrame(animate);
  }

  resize();
  window.addEventListener('resize', resize);
  animate();
}

/**
 * Phase 1: 3D tilt on project cards and hero image
 */
function initProjectCardTilt() {
  const tiltElements = document.querySelectorAll('[data-tilt], .project-card');

  tiltElements.forEach(el => {
    el.addEventListener('mousemove', e => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      const tiltX = y * 8;
      const tiltY = x * -8;

      gsap.to(el, {
        rotateX: tiltX,
        rotateY: tiltY,
        transformPerspective: 1000,
        duration: 0.3,
        ease: 'power2.out',
      });
    });

    el.addEventListener('mouseleave', () => {
      gsap.to(el, {
        rotateX: 0,
        rotateY: 0,
        duration: 0.5,
        ease: 'power2.out',
      });
    });
  });
}
