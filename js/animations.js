/**
 * Concept C: The Scroll Film — GSAP Animations
 *
 * All scroll-driven scenes using GSAP ScrollTrigger.
 * Scene 1: Hero — pinned, letter-spacing + photo scale
 * Scene 2: About — sticky photo desaturate + paragraph reveals
 * Scene 3: Experience — horizontal scroll via vertical scroll
 * Scene 4: Projects — image crossfade driven by scroll
 * Scene 5: Contact — background color transition
 */

document.addEventListener('DOMContentLoaded', function () {
  if (typeof IS_DEV_MODE !== 'undefined' && IS_DEV_MODE) return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = window.innerWidth <= 768;

  if (prefersReducedMotion || isMobile) {
    initStaticFallback();
    return;
  }

  document.body.classList.add('gsap-ready');

  initHeroScene();
  initAboutScene();
  initExperienceScene();
  initProjectsScene();
  initContactScene();
});

/* ===========================
   Static fallback (reduced motion / mobile)
   Show all content without pinning or scrub
   =========================== */
function initStaticFallback() {
  var heroPhotoWrap = document.querySelector('.hero__photo-wrap');
  var heroSubtitle = document.querySelector('.hero__subtitle');
  var paragraphs = document.querySelectorAll('.about__paragraph');
  var projCards = document.querySelectorAll('.proj-card');
  var projImages = document.querySelectorAll('.projects__img');

  if (heroPhotoWrap) {
    heroPhotoWrap.style.opacity = '1';
    heroPhotoWrap.style.transform = 'translate(-50%, -50%) scale(1)';
  }
  if (heroSubtitle) {
    heroSubtitle.style.opacity = '1';
  }

  paragraphs.forEach(function (p) {
    p.style.opacity = '1';
    p.style.transform = 'none';
  });

  projCards.forEach(function (card) {
    card.style.opacity = '1';
  });

  if (projImages.length) {
    projImages[0].classList.add('active');
  }
}

/* ===========================
   SCENE 1: HERO
   Pin for ~150vh, spread letters, reveal photo
   =========================== */
function initHeroScene() {
  var heroSection = document.querySelector('.scene--hero');
  var heroInner = document.querySelector('.hero__inner');
  var heroName = document.querySelector('.hero__name');
  var photoWrap = document.querySelector('.hero__photo-wrap');
  var subtitle = document.querySelector('.hero__subtitle');

  if (!heroSection || !heroInner || !photoWrap || !heroName) return;

  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: heroSection,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
      pin: heroInner,
      pinSpacing: false,
    },
  });

  tl.to(
    photoWrap,
    {
      opacity: 1,
      scale: 1,
      duration: 0.5,
      ease: 'none',
    },
    0
  );

  tl.to(
    heroName,
    {
      opacity: 0,
      y: -40,
      duration: 0.4,
      ease: 'none',
    },
    0.25
  );

  tl.to(
    subtitle,
    {
      opacity: 0.6,
      duration: 0.3,
      ease: 'none',
    },
    0.5
  );
}

/* ===========================
   SCENE 2: ABOUT
   Photo desaturates, paragraphs slide in
   =========================== */
function initAboutScene() {
  var aboutSection = document.querySelector('.scene--about');
  var photo = document.querySelector('.about__photo');
  var paragraphs = document.querySelectorAll('.about__paragraph');

  if (!aboutSection || !photo) return;

  ScrollTrigger.create({
    trigger: aboutSection,
    start: 'top 80%',
    end: 'bottom 20%',
    scrub: 1,
    onUpdate: function (self) {
      var progress = self.progress;
      var grayPercent = progress * 40;
      photo.style.filter = 'grayscale(' + grayPercent + '%)';
    },
  });

  paragraphs.forEach(function (p, i) {
    gsap.to(p, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: p,
        start: 'top 85%',
        toggleActions: 'play none none reverse',
      },
      delay: i * 0.05,
    });
  });
}

/* ===========================
   SCENE 3: EXPERIENCE
   Horizontal scroll driven by vertical scroll
   =========================== */
function initExperienceScene() {
  var section = document.querySelector('.scene--experience');
  var track = document.querySelector('.experience__track');
  var cards = document.querySelectorAll('.exp-card');

  if (!section || !track || !cards.length) return;

  function getScrollAmount() {
    return -(track.scrollWidth - section.offsetWidth);
  }

  gsap.to(track, {
    x: getScrollAmount,
    ease: 'none',
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: function () {
        return '+=' + Math.abs(getScrollAmount());
      },
      pin: true,
      scrub: 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });
}

/* ===========================
   SCENE 4: PROJECTS
   Image crossfade as project cards scroll into view
   =========================== */
function initProjectsScene() {
  var images = document.querySelectorAll('.projects__img');
  var cards = document.querySelectorAll('.proj-card');

  if (!images.length || !cards.length) return;

  images[0].classList.add('active');
  cards[0].classList.add('active');

  cards.forEach(function (card) {
    ScrollTrigger.create({
      trigger: card,
      start: 'top 60%',
      end: 'bottom 40%',
      onEnter: function () {
        activateProject(card, images, cards);
      },
      onEnterBack: function () {
        activateProject(card, images, cards);
      },
    });
  });
}

function activateProject(card, images, cards) {
  var idx = parseInt(card.getAttribute('data-project'), 10);

  images.forEach(function (img) {
    img.classList.remove('active');
  });
  cards.forEach(function (c) {
    c.classList.remove('active');
  });

  if (images[idx]) images[idx].classList.add('active');
  card.classList.add('active');
}

/* ===========================
   SCENE 5: CONTACT
   Background color transition from cream to accent
   =========================== */
function initContactScene() {
  var contactSection = document.querySelector('.scene--contact');
  var skillsSection = document.querySelector('.scene--skills');

  if (!contactSection || !skillsSection) return;

  gsap.fromTo(
    contactSection,
    { opacity: 0.6 },
    {
      opacity: 1,
      duration: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: contactSection,
        start: 'top 80%',
        end: 'top 20%',
        scrub: 1,
      },
    }
  );
}
