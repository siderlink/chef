document.addEventListener('DOMContentLoaded', () => {
  // 1. Mouse Follower Orb
  const orb = document.querySelector('.cursor-orb');
  if (orb) {
    document.addEventListener('mousemove', (e) => {
      // Usar requestAnimationFrame para performance
      requestAnimationFrame(() => {
        orb.style.left = e.clientX + 'px';
        orb.style.top = e.clientY + 'px';
      });
    });
  }

  // 2. 3D Tilt Effect on Mockup (Apple TV style)
  const mockup = document.querySelector('.mockup-frame');
  if (mockup) {
    mockup.addEventListener('mousemove', (e) => {
      const rect = mockup.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((y - centerY) / centerY) * -10; // Max 10deg
      const rotateY = ((x - centerX) / centerX) * 10;
      
      mockup.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });
    
    mockup.addEventListener('mouseleave', () => {
      mockup.style.transform = `perspective(1000px) rotateX(15deg) rotateY(0deg) scale3d(1, 1, 1)`;
    });
  }

  // 3. GSAP ScrollTrigger Animations (if loaded)
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);

    // Fade in and slide up hero content
    gsap.from('.hero-badge', { y: 20, opacity: 0, duration: 1, delay: 0.2, ease: 'power3.out' });
    gsap.from('.hero-title', { y: 40, opacity: 0, duration: 1, delay: 0.4, ease: 'power3.out' });
    gsap.from('.hero-subtitle', { y: 20, opacity: 0, duration: 1, delay: 0.6, ease: 'power3.out' });
    gsap.from('.hero-cta', { y: 20, opacity: 0, duration: 1, delay: 0.8, ease: 'power3.out' });
    
    gsap.from('.hero-mockup-wrapper', { 
      y: 100, 
      opacity: 0, 
      rotationX: 30,
      duration: 1.5, 
      delay: 1, 
      ease: 'power3.out' 
    });

    // Animate Bento Grid cards on scroll
    gsap.utils.toArray('.glass-card').forEach((card, i) => {
      gsap.from(card, {
        scrollTrigger: {
          trigger: card,
          start: 'top 85%',
          toggleActions: 'play none none reverse'
        },
        y: 50,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        delay: i * 0.1
      });
    });
  }
});
