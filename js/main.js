// Main JavaScript file for portfolio website

document.addEventListener('DOMContentLoaded', function () {
  // Check if we're in development mode
  if (typeof IS_DEV_MODE !== 'undefined' && IS_DEV_MODE) {
    initDevMode();
  } else {
    // Initialize all functionality
    initNavigation();
    initScrollEffects();
    initAnimations();
    initMobileMenu();
  }
});

// Development Mode functionality
function initDevMode() {
  const overlay = document.getElementById('dev-overlay');

  if (overlay) {
    overlay.innerHTML = `
      <div class="dev-overlay-content">
        <div class="dev-overlay-icon">
          <i class="fas fa-code"></i>
        </div>
        <h1 class="dev-overlay-title">Work in Progress</h1>
        <p class="dev-overlay-message">
          This website is currently under development. 
          I'm working hard to bring you an amazing experience!
        </p>
        <p class="dev-overlay-subtitle">
          Check back soon for the final release 🚀
        </p>
      </div>
    `;
    overlay.style.display = 'flex';

    // Add development badge
    const badge = document.createElement('div');
    badge.className = 'dev-badge';
    badge.textContent = '🚧 DEV';
    document.body.appendChild(badge);

    // Prevent scrolling
    document.body.style.overflow = 'hidden';
  }
}

// Navigation functionality
function initNavigation() {
  const navbar = document.getElementById('navbar');
  const navLinks = document.querySelectorAll('.nav-link');

  // Navbar scroll effect
  window.addEventListener('scroll', function () {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // Smooth scrolling for navigation links
  navLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');

      // Only prevent default for hash links (internal navigation)
      // Allow external links and file downloads to work normally
      if (targetId && targetId.startsWith('#')) {
        e.preventDefault();
        const targetSection = document.querySelector(targetId);

        if (targetSection) {
          const offsetTop = targetSection.offsetTop - 70; // Account for fixed navbar
          window.scrollTo({
            top: offsetTop,
            behavior: 'smooth',
          });
        }
      }
      // If it's not a hash link (like PDF, external URL), let it work normally
    });
  });

  // Active link highlighting
  window.addEventListener('scroll', function () {
    let current = '';
    const sections = document.querySelectorAll('section');

    sections.forEach(section => {
      const sectionTop = section.offsetTop - 100;
      const sectionHeight = section.clientHeight;

      if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(link => {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
      if (link.getAttribute('href') === `#${current}`) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });
  });
}

// Mobile menu functionality
function initMobileMenu() {
  const navToggle = document.getElementById('nav-toggle');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');

  navToggle.addEventListener('click', function () {
    const isExpanded = navMenu.classList.toggle('active');
    navToggle.classList.toggle('active');
    navToggle.setAttribute('aria-expanded', isExpanded);
  });

  // Close mobile menu when clicking on a link
  navLinks.forEach(link => {
    link.addEventListener('click', function () {
      navMenu.classList.remove('active');
      navToggle.classList.remove('active');
    });
  });

  // Close mobile menu when clicking outside
  document.addEventListener('click', function (e) {
    if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
      navMenu.classList.remove('active');
      navToggle.classList.remove('active');
    }
  });
}

// Scroll effects (GSAP handles reveals in animations.js)
function initScrollEffects() {
  // Fallback fade-in for elements without GSAP (e.g. contact items)
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
  };

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in-up');
      }
    });
  }, observerOptions);

  const animateElements = document.querySelectorAll('.contact-item');
  animateElements.forEach(el => observer.observe(el));
}

// Animation utilities
function initAnimations() {
  // Hero typing moved to terminal intro in animations.js

  // Counter animation for stats
  const stats = document.querySelectorAll('.stat-number');
  const statsObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          statsObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  stats.forEach(stat => {
    statsObserver.observe(stat);
  });
}

// Counter animation function
function animateCounter(element) {
  const originalText = element.textContent;
  const isDecimal = originalText.includes('.');

  if (isDecimal) {
    // Handle decimal numbers like "4.0"
    const target = parseFloat(originalText);
    let current = 0;
    const increment = target / 50;
    const timer = setInterval(function () {
      current += increment;
      if (current >= target) {
        element.textContent = originalText;
        clearInterval(timer);
      } else {
        element.textContent = current.toFixed(1);
      }
    }, 30);
  } else {
    // Handle integer numbers with suffixes like "2K+", "75%"
    const target = parseInt(element.textContent.replace(/\D/g, ''));
    const suffix = element.textContent.replace(/\d/g, '');
    let current = 0;
    const increment = target / 50;
    const timer = setInterval(function () {
      current += increment;
      if (current >= target) {
        element.textContent = target + suffix;
        clearInterval(timer);
      } else {
        element.textContent = Math.floor(current) + suffix;
      }
    }, 30);
  }
}

// Utility functions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Smooth reveal animation for sections
function revealOnScroll() {
  const reveals = document.querySelectorAll('.section-header, .about-text, .about-image');

  reveals.forEach(reveal => {
    const windowHeight = window.innerHeight;
    const elementTop = reveal.getBoundingClientRect().top;
    const elementVisible = 150;

    if (elementTop < windowHeight - elementVisible) {
      reveal.classList.add('fade-in-up');
    }
  });
}

// Add scroll event listener with debounce
window.addEventListener('scroll', debounce(revealOnScroll, 10));

// Project card hover handled by GSAP in animations.js (3D tilt)

// Contact form handling (if you add a contact form later)
function handleContactForm() {
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();

      // Get form data
      const formData = new FormData(this);
      const name = formData.get('name');
      const email = formData.get('email');
      const message = formData.get('message');

      // Basic validation
      if (!name || !email || !message) {
        showNotification('Please fill in all fields', 'error');
        return;
      }

      if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
      }

      // Simulate form submission
      showNotification("Thank you for your message! I'll get back to you soon.", 'success');
      this.reset();
    });
  }
}

// Email validation
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Notification system
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  // Style the notification
  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;

  document.body.appendChild(notification);

  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);

  // Remove after 5 seconds
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 5000);
}

// Initialize contact form handling
handleContactForm();

// Performance optimization: Lazy loading for images
function initLazyLoading() {
  const images = document.querySelectorAll('img[data-src]');

  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove('lazy');
        imageObserver.unobserve(img);
      }
    });
  });

  images.forEach(img => imageObserver.observe(img));
}

// Initialize lazy loading
initLazyLoading();

// Add loading animation
window.addEventListener('load', function () {
  document.body.classList.add('loaded');
});

// Console message for developers
console.log('%c👋 Hello Developer!', 'color: #2563eb; font-size: 20px; font-weight: bold;');
console.log('%cThanks for checking out my portfolio code!', 'color: #64748b; font-size: 14px;');
console.log('%cFeel free to reach out if you have any questions.', 'color: #64748b; font-size: 14px;');
