/**
 * Concept C: The Scroll Film — Main JS
 * Navigation, counters, mobile menu, dev mode
 */

document.addEventListener('DOMContentLoaded', function () {
  if (typeof IS_DEV_MODE !== 'undefined' && IS_DEV_MODE) {
    initDevMode();
    return;
  }

  initNavigation();
  initMobileMenu();
  initCounters();
  initProjectImageCrossfade();
});

/** Pixels to leave clear below the fixed navbar (includes safe-area padding on notched devices). */
function getFixedNavOffset() {
  var navbar = document.getElementById('navbar');
  if (!navbar) return 60;
  return navbar.offsetHeight;
}

function getAnchorScrollTop(targetSection) {
  var top = targetSection.getBoundingClientRect().top + window.pageYOffset;

  if (typeof ScrollTrigger !== 'undefined' && ScrollTrigger.getAll) {
    var triggers = ScrollTrigger.getAll();
    for (var i = 0; i < triggers.length; i += 1) {
      if (triggers[i].trigger === targetSection && triggers[i].pin && typeof triggers[i].start === 'number') {
        top = triggers[i].start;
        break;
      }
    }
  }

  return Math.max(0, top - getFixedNavOffset());
}

/* ===========================
   Dev Mode
   =========================== */
function initDevMode() {
  var overlay = document.getElementById('dev-overlay');
  if (!overlay) return;

  overlay.innerHTML =
    '<div style="max-width:500px">' +
    '<h1 style="font-family:Syne,sans-serif;font-size:2.5rem;font-weight:800;margin-bottom:1rem">Work in Progress</h1>' +
    '<p style="font-size:1.1rem;color:#8B8680;line-height:1.7">This website is currently under development.</p>' +
    '</div>';
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/* ===========================
   Navigation (scroll effects)
   =========================== */
function initNavigation() {
  var navbar = document.getElementById('navbar');
  var navLinks = document.querySelectorAll('.nav-link');

  var darkSections = document.querySelectorAll('.scene--experience, .scene--contact');

  window.addEventListener('scroll', function () {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    var navBottom = navbar.getBoundingClientRect().bottom;
    var isInDark = false;
    darkSections.forEach(function (section) {
      var rect = section.getBoundingClientRect();
      if (rect.top < navBottom && rect.bottom > 0) {
        isInDark = true;
      }
    });

    if (isInDark) {
      navbar.classList.add('inverted');
    } else {
      navbar.classList.remove('inverted');
    }
  });

  navLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId && targetId.startsWith('#')) {
        e.preventDefault();
        var targetSection = document.querySelector(targetId);
        if (targetSection) {
          window.scrollTo({ top: getAnchorScrollTop(targetSection), behavior: 'smooth' });
        }
      }
    });
  });

  window.addEventListener('scroll', function () {
    var current = '';
    var sections = document.querySelectorAll('section[id]');
    var viewportMid = window.innerHeight * 0.35;

    sections.forEach(function (section) {
      var rect = section.getBoundingClientRect();
      if (rect.top <= viewportMid && rect.bottom > viewportMid) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(function (link) {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
      var href = link.getAttribute('href');
      if (href === '#' + current) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });
  });
}

/* ===========================
   Mobile Menu
   =========================== */
function initMobileMenu() {
  var navToggle = document.getElementById('nav-toggle');
  var navMenu = document.getElementById('nav-menu');
  var navLinks = document.querySelectorAll('.nav-link');

  if (!navToggle || !navMenu) return;

  function setNavMenuOpen(open) {
    document.documentElement.classList.toggle('nav-menu-open', open);
    document.body.classList.toggle('nav-menu-open', open);
  }

  function closeNavMenu() {
    navMenu.classList.remove('active');
    navToggle.classList.remove('active');
    navToggle.setAttribute('aria-expanded', 'false');
    setNavMenuOpen(false);
  }

  navToggle.addEventListener('click', function () {
    var isExpanded = navMenu.classList.toggle('active');
    navToggle.classList.toggle('active');
    navToggle.setAttribute('aria-expanded', isExpanded);
    setNavMenuOpen(isExpanded);
  });

  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      closeNavMenu();
    });
  });

  document.addEventListener('click', function (e) {
    if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
      if (navMenu.classList.contains('active')) {
        closeNavMenu();
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navMenu.classList.contains('active')) {
      closeNavMenu();
    }
  });
}

/* ===========================
   Counter Animation
   =========================== */
function initCounters() {
  var stats = document.querySelectorAll('.about__stat-number');
  if (!stats.length) return;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  stats.forEach(function (stat) {
    observer.observe(stat);
  });
}

function animateCounter(element) {
  var originalText = element.textContent;
  var isDecimal = originalText.includes('.');

  if (isDecimal) {
    var target = parseFloat(originalText);
    var current = 0;
    var increment = target / 50;
    var timer = setInterval(function () {
      current += increment;
      if (current >= target) {
        element.textContent = originalText;
        clearInterval(timer);
      } else {
        element.textContent = current.toFixed(1);
      }
    }, 30);
  } else {
    var numTarget = parseInt(originalText.replace(/\D/g, ''));
    if (!numTarget || isNaN(numTarget)) {
      // Nothing to animate yet (e.g. placeholder "—" before async stats load).
      // stats.js will overwrite the text when data arrives.
      return;
    }
    var suffix = originalText.replace(/\d/g, '');
    var numCurrent = 0;
    var numIncrement = numTarget / 50;
    var numTimer = setInterval(function () {
      numCurrent += numIncrement;
      if (numCurrent >= numTarget) {
        element.textContent = numTarget + suffix;
        clearInterval(numTimer);
      } else {
        element.textContent = Math.floor(numCurrent) + suffix;
      }
    }, 30);
  }
}

/* ===========================
   Project Image Crossfade (non-GSAP fallback)
   Activated on mobile or when GSAP isn't available.
   On desktop, GSAP animations.js handles this.
   =========================== */
function initProjectImageCrossfade() {
  var images = document.querySelectorAll('.projects__img');
  // Exclude compact cards — they're always full-opacity, not image-linked.
  var cards = document.querySelectorAll('.proj-card:not(.proj-card--compact)');

  if (!images.length || !cards.length) return;

  images[0].classList.add('active');
  cards[0].classList.add('active');

  if (window.innerWidth <= 768) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var idx = parseInt(entry.target.getAttribute('data-project'), 10);
            images.forEach(function (img) {
              img.classList.remove('active');
            });
            cards.forEach(function (card) {
              card.classList.remove('active');
            });
            if (images[idx]) images[idx].classList.add('active');
            entry.target.classList.add('active');
          }
        });
      },
      { threshold: 0.4 }
    );

    cards.forEach(function (card) {
      observer.observe(card);
    });
  }
}

/* ===========================
   Utility
   =========================== */
window.addEventListener('load', function () {
  document.body.classList.add('loaded');
});
