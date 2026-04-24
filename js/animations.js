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
  var heroLines = document.querySelectorAll('.hero__line');
  var heroPhotoWrap = document.querySelector('.hero__photo-wrap');
  var heroSubtitle = document.querySelector('.hero__subtitle');
  var paragraphs = document.querySelectorAll('.about__paragraph');
  var projCards = document.querySelectorAll('.proj-card');
  var projImages = document.querySelectorAll('.projects__img');

  heroLines.forEach(function (line) {
    line.style.opacity = '1';
    line.style.transform = 'none';
  });
  if (heroPhotoWrap) {
    heroPhotoWrap.style.opacity = '1';
    heroPhotoWrap.style.transform = 'none';
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
   Time-based entrance on load, then scroll-pinned with gentle drift
   =========================== */
function initHeroScene() {
  var heroSection = document.querySelector('.scene--hero');
  var heroInner = document.querySelector('.hero__inner');
  var firstLine = document.querySelector('.hero__line--first');
  var lastLine = document.querySelector('.hero__line--last');
  var photoWrap = document.querySelector('.hero__photo-wrap');
  var subtitle = document.querySelector('.hero__subtitle');

  if (!heroSection || !heroInner || !firstLine || !lastLine || !photoWrap) return;

  /* --- Entrance: elements land in a tight, overlapping position --- */
  var overlap = 50;
  var spread = overlap + 20;
  var entranceSettled = false;

  function finishEntrance() {
    if (entranceSettled) return;

    entranceSettled = true;
    entrance.kill();

    gsap.set([firstLine, lastLine], { opacity: 1 });
    gsap.set(photoWrap, { opacity: 1, scale: 1 });
    gsap.set(subtitle, { opacity: 1 });
  }

  function syncHeroToProgress(progress) {
    gsap.set(firstLine, { opacity: 1, y: overlap - progress * spread });
    gsap.set(lastLine, { opacity: 1, y: -overlap + progress * spread });
    gsap.set(photoWrap, { opacity: 1, scale: 1 + progress * 0.015 });
    gsap.set(subtitle, { opacity: 1 });
  }

  var entrance = gsap.timeline({
    delay: 0.3,
    onComplete: function () {
      entranceSettled = true;
    },
  });

  entrance.to(firstLine, { opacity: 1, y: overlap, duration: 0.9, ease: 'power3.out' });
  entrance.to(photoWrap, { opacity: 1, scale: 1, duration: 1, ease: 'power3.out' }, 0.15);
  entrance.to(lastLine, { opacity: 1, y: -overlap, duration: 0.9, ease: 'power3.out' }, 0.25);
  entrance.to(subtitle, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0.7);

  /* --- Scroll: name lines breathe outward from tight overlap --- */
  ScrollTrigger.create({
    trigger: heroSection,
    start: 'top top',
    end: 'bottom bottom',
    pin: heroInner,
    pinSpacing: false,
    invalidateOnRefresh: true,
    onRefresh: function (self) {
      if (!entranceSettled && window.scrollY <= 1) return;
      syncHeroToProgress(self.progress);
    },
    onUpdate: function (self) {
      if (!entranceSettled && window.scrollY <= 1) return;

      if (window.scrollY > 1) {
        finishEntrance();
      }

      syncHeroToProgress(self.progress);
    },
  });
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
  var section = document.querySelector('.scene--projects');
  var images = document.querySelectorAll('.projects__img');
  // Compact "Also built" cards are always full-opacity; exclude them from
  // the GSAP crossfade so all four stay visible and don't compete for focus.
  var cards = document.querySelectorAll('.proj-card:not(.proj-card--compact)');

  if (!section || !images.length || !cards.length) return;

  var activeProjectIndex = -1;

  function syncActiveProject() {
    var viewportMid = window.innerHeight * 0.5;
    var bestIndex = 0;
    var bestDistance = Infinity;

    cards.forEach(function (card, index) {
      var rect = card.getBoundingClientRect();
      var cardCenter = rect.top + rect.height / 2;
      var distance = Math.abs(cardCenter - viewportMid);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    if (bestIndex !== activeProjectIndex) {
      activeProjectIndex = bestIndex;
      activateProject(cards[bestIndex], images, cards);
    }
  }

  syncActiveProject();

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom top',
    onEnter: syncActiveProject,
    onEnterBack: syncActiveProject,
    onUpdate: syncActiveProject,
    onRefresh: syncActiveProject,
    onLeave: function () {
      activateProject(cards[cards.length - 1], images, cards);
    },
    onLeaveBack: function () {
      activeProjectIndex = 0;
      activateProject(cards[0], images, cards);
    },
  });

  // Fade the left image panel when the "Also built" grid scrolls into view —
  // those cards have no paired images so the panel would otherwise look orphaned.
  var alsoBuiltGrid = document.querySelector('.projects__also-built-grid');
  if (alsoBuiltGrid) {
    var alsoBuiltObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          section.classList.toggle('in-also-built', entry.isIntersecting);
        });
      },
      { threshold: 0.15 }
    );
    alsoBuiltObserver.observe(alsoBuiltGrid);
  }
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
