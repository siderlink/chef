document.addEventListener('DOMContentLoaded', () => {
    // Registra o ScrollTrigger no GSAP
    gsap.registerPlugin(ScrollTrigger);

    // 1. Inicialização de Animações Iniciais (Hero Section)
    const initHeroAnimations = () => {
        const tl = gsap.timeline({ defaults: { ease: "power4.out" } });

        tl.fromTo('.badge-wrapper', 
            { y: 30, opacity: 0 }, 
            { y: 0, opacity: 1, duration: 1, delay: 0.2 }
        )
        .fromTo('.hero-title', 
            { y: 40, opacity: 0 }, 
            { y: 0, opacity: 1, duration: 1.2 },
            "-=0.8"
        )
        .fromTo('.hero-subtitle', 
            { y: 20, opacity: 0 }, 
            { y: 0, opacity: 1, duration: 1 },
            "-=0.9"
        )
        .fromTo('.hero-actions', 
            { y: 20, opacity: 0 }, 
            { y: 0, opacity: 1, duration: 1 },
            "-=0.8"
        )
        .fromTo('.hero-dashboard-mockup', 
            { y: 60, scale: 0.95, opacity: 0 }, 
            { y: 0, scale: 1, opacity: 1, duration: 1.5, ease: "expo.out" },
            "-=0.6"
        );
    };

    initHeroAnimations();

    // 2. Animações com Scroll (ScrollTrigger)
    const initScrollAnimations = () => {
        // Revelar elementos para cima
        gsap.utils.toArray('.reveal-up:not(.hero *)').forEach(el => {
            gsap.fromTo(el, 
                { y: 50, opacity: 0 },
                {
                    y: 0, opacity: 1,
                    duration: 1,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: el,
                        start: "top 85%",
                        toggleActions: "play none none reverse"
                    }
                }
            );
        });

        // Revelar elementos com escala
        gsap.utils.toArray('.reveal-scale:not(.hero *)').forEach(el => {
            gsap.fromTo(el, 
                { scale: 0.95, opacity: 0 },
                {
                    scale: 1, opacity: 1,
                    duration: 1.2,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: el,
                        start: "top 80%",
                        toggleActions: "play none none reverse"
                    }
                }
            );
        });
    };

    initScrollAnimations();

    // 3. Navbar Efeito ao Rolar a Página
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 4. Efeito Spotlight em Cards
    const initSpotlightCards = () => {
        const cards = document.querySelectorAll('.spotlight-card');
        
        cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);
            });
        });
    };

    initSpotlightCards();

    // 5. Botões Magnéticos (Efeito Hover Seguindo Cursor)
    const initMagneticElements = () => {
        const magnetics = document.querySelectorAll('.magnetic');
        
        magnetics.forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const h = rect.width / 2;
                const v = rect.height / 2;
                const x = e.clientX - rect.left - h;
                const y = e.clientY - rect.top - v;
                
                // Reduz o movimento para botões de texto (links nav)
                const strength = btn.tagName === 'A' ? 10 : 20;

                gsap.to(btn, {
                    x: (x / h) * strength,
                    y: (y / v) * strength,
                    duration: 0.4,
                    ease: "power3.out"
                });
            });

            btn.addEventListener('mouseleave', () => {
                gsap.to(btn, {
                    x: 0,
                    y: 0,
                    duration: 0.7,
                    ease: "elastic.out(1, 0.3)"
                });
            });
        });
    };

    // Apenas ativa magnético se não for mobile/touch
    if (window.matchMedia("(pointer: fine)").matches) {
        initMagneticElements();
    }
});
