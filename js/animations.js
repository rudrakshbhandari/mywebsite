/**
 * GSAP Animations — Editorial Portfolio
 * Text reveals, scroll-triggered fades, parallax, image treatments
 */

document.addEventListener('DOMContentLoaded', function () {
  if (typeof IS_DEV_MODE !== 'undefined' && IS_DEV_MODE) return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  initHeroEntrance();
  initScrollReveals();
  initImageParallax();
  initProjectHoverShift();
});

/**
 * Hero entrance: name slides up, kicker and subtitle fade in
 */
function initHeroEntrance() {
  const tl = gsap.timeline({ delay: 0.2 });

  tl.from('.hero__kicker', {
    opacity: 0,
    y: 20,
    duration: 0.6,
    ease: 'power3.out',
  });

  tl.from(
    '.hero__name .word-reveal',
    {
      y: '110%',
      duration: 0.9,
      ease: 'power4.out',
      stagger: 0.12,
    },
    '-=0.3'
  );

  tl.from(
    '.hero__sub',
    {
      opacity: 0,
      y: 24,
      duration: 0.7,
      ease: 'power3.out',
    },
    '-=0.4'
  );

  tl.from(
    '.hero__image-wrap',
    {
      opacity: 0,
      scale: 0.95,
      duration: 0.8,
      ease: 'power2.out',
    },
    '-=0.5'
  );

  tl.from(
    '.hero__scroll',
    {
      opacity: 0,
      duration: 0.5,
    },
    '-=0.3'
  );
}

/**
 * Scroll-triggered reveals for .reveal-el elements
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

  /* Stagger project entries */
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
 * Subtle parallax on hero and about images
 */
function initImageParallax() {
  const heroImage = document.querySelector('.hero__image');
  const aboutPhoto = document.querySelector('.about__photo');

  if (heroImage) {
    gsap.to(heroImage, {
      y: 60,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
      },
    });
  }

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
