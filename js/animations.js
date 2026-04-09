/**
 * GSAP Animations — Magazine Cover Portfolio
 * Hero entrance with word-by-word reveal, photo compositing parallax,
 * scroll-triggered section reveals, project hover shifts
 */

document.addEventListener('DOMContentLoaded', function () {
  if (typeof IS_DEV_MODE !== 'undefined' && IS_DEV_MODE) return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  initHeroEntrance();
  initHeroScrollEffect();
  initScrollReveals();
  initImageParallax();
  initProjectHoverShift();
});

/**
 * Hero entrance: name lines slide up one-by-one, photo fades in with scale
 */
function initHeroEntrance() {
  const tl = gsap.timeline({ delay: 0.15 });

  gsap.set('.hero__name-line', { y: '110%', opacity: 0 });
  gsap.set('.hero__photo-layer', { opacity: 0, scale: 0.92 });
  gsap.set('.hero__tagline', { opacity: 0, y: 20 });
  gsap.set('.hero__actions', { opacity: 0, y: 16 });

  tl.to('.hero__name-line--first', {
    y: '0%',
    opacity: 1,
    duration: 0.9,
    ease: 'power4.out',
  });

  tl.to(
    '.hero__name-line--second',
    {
      y: '0%',
      opacity: 1,
      duration: 0.9,
      ease: 'power4.out',
    },
    '-=0.55'
  );

  tl.to(
    '.hero__photo-layer',
    {
      opacity: 1,
      scale: 1,
      duration: 1,
      ease: 'power2.out',
    },
    '-=0.6'
  );

  tl.to(
    '.hero__tagline',
    {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power3.out',
    },
    '-=0.4'
  );

  tl.to(
    '.hero__actions',
    {
      opacity: 1,
      y: 0,
      duration: 0.6,
      ease: 'power3.out',
    },
    '-=0.3'
  );
}

/**
 * On scroll: hero text scales down slightly, photo parallaxes away
 */
function initHeroScrollEffect() {
  gsap.to('.hero__name', {
    scale: 0.85,
    opacity: 0.3,
    ease: 'none',
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: 'bottom top',
      scrub: 1.5,
    },
  });

  gsap.to('.hero__photo-layer', {
    y: -120,
    opacity: 0,
    ease: 'none',
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: '80% top',
      scrub: 1,
    },
  });

  gsap.to('.hero__bottom', {
    y: -40,
    opacity: 0,
    ease: 'none',
    scrollTrigger: {
      trigger: '.hero',
      start: '30% top',
      end: '70% top',
      scrub: 1,
    },
  });
}

/**
 * Scroll-triggered reveals for .reveal-el and .project elements
 */
function initScrollReveals() {
  gsap.utils.toArray('.reveal-el').forEach(el => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none',
        },
      }
    );
  });

  gsap.utils.toArray('.project').forEach(proj => {
    gsap.fromTo(
      proj,
      { opacity: 0, y: 60 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: proj,
          start: 'top 90%',
          toggleActions: 'play none none none',
        },
      }
    );
  });
}

/**
 * Subtle parallax on about photo
 */
function initImageParallax() {
  const aboutPhoto = document.querySelector('.about__photo');

  if (aboutPhoto) {
    gsap.to(aboutPhoto, {
      y: 40,
      ease: 'none',
      scrollTrigger: {
        trigger: '.about',
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1,
      },
    });
  }
}

/**
 * Project images shift slightly on hover for tactile feel
 */
function initProjectHoverShift() {
  document.querySelectorAll('.project__image-wrap').forEach(wrap => {
    const img = wrap.querySelector('.project__image');
    if (!img) return;

    wrap.addEventListener('mousemove', e => {
      const rect = wrap.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 8;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 8;
      gsap.to(img, { x, y, duration: 0.4, ease: 'power2.out' });
    });

    wrap.addEventListener('mouseleave', () => {
      gsap.to(img, { x: 0, y: 0, duration: 0.6, ease: 'power2.out' });
    });
  });
}
