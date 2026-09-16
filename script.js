(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery = window.matchMedia('(max-width: 720px)');

  const storage = {
    get(key, fallback = null) {
      try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch { /* Storage is optional. */ }
    }
  };

  const readHistory = () => {
    try {
      const parsed = JSON.parse(storage.get('udit-terminal-history', '[]') || '[]');
      return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string').slice(-30) : [];
    } catch { return []; }
  };

  const state = {
    theme: storage.get('udit-theme', 'dark'),
    terminalHistory: readHistory(),
    historyIndex: -1,
    paletteIndex: 0,
    scrollTicking: false,
    pointerTicking: false
  };

  const themeMeta = $('meta[name="theme-color"]');
  const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');

  const resolvedTheme = () => state.theme === 'auto' ? (themeMedia.matches ? 'dark' : 'light') : state.theme;

  const syncThemeButtons = () => {
    $$('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === state.theme));
    });
  };

  const applyTheme = (theme, persist = true) => {
    const nextTheme = ['light', 'dark', 'auto'].includes(theme) ? theme : 'auto';
    state.theme = nextTheme;
    const resolved = resolvedTheme();
    root.dataset.theme = resolved;
    root.dataset.themeChoice = nextTheme;
    if (themeMeta) themeMeta.setAttribute('content', resolved === 'dark' ? '#151619' : '#f7f5f1');
    if (persist) storage.set('udit-theme', nextTheme);
    syncThemeButtons();
  };

  applyTheme(state.theme, false);
  themeMedia.addEventListener?.('change', () => { if (state.theme === 'auto') applyTheme('auto', false); });

  // Sticky header, progress bar, and subtle scroll state.
  const header = $('.site-header');
  const progress = $('.scroll-progress span');
  const updateScrollUI = () => {
    state.scrollTicking = false;
    const scrollTop = window.scrollY;
    header?.classList.toggle('is-scrolled', scrollTop > 24);
    if (progress) {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = `${scrollable > 0 ? Math.min(100, (scrollTop / scrollable) * 100) : 0}%`;
    }
  };
  const requestScrollUI = () => {
    if (!state.scrollTicking) {
      state.scrollTicking = true;
      window.requestAnimationFrame(updateScrollUI);
    }
  };
  window.addEventListener('scroll', requestScrollUI, { passive: true });
  window.addEventListener('resize', requestScrollUI, { passive: true });
  updateScrollUI();

  // Mobile navigation has complete dismissal behavior.
  const nav = $('#primary-nav');
  const menuButton = $('#menu-button');
  const closeMenu = () => {
    nav?.classList.remove('is-open');
    menuButton?.setAttribute('aria-expanded', 'false');
  };
  const toggleMenu = () => {
    const open = !nav?.classList.contains('is-open');
    nav?.classList.toggle('is-open', open);
    menuButton?.setAttribute('aria-expanded', String(open));
  };
  menuButton?.addEventListener('click', toggleMenu);
  $$('.nav-link').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => {
    if (!mobileQuery.matches || !nav?.classList.contains('is-open')) return;
    if (!nav.contains(event.target) && !menuButton?.contains(event.target)) closeMenu();
  });
  window.addEventListener('resize', () => { if (!mobileQuery.matches) closeMenu(); }, { passive: true });

  // Current-section navigation.
  const sections = $$('[data-section]');
  const navObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      if (!$(`.nav-link[href="#${entry.target.id}"]`)) return;
      $$('.nav-link').forEach(link => {
        link.setAttribute('aria-current', link.getAttribute('href') === `#${entry.target.id}` ? 'page' : 'false');
      });
    });
  }, { rootMargin: '-38% 0px -52% 0px', threshold: 0 }) : null;
  sections.forEach(section => navObserver?.observe(section));

  // Reveal content only after the browser can observe it; content remains visible without JS.
  const revealItems = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotionQuery.matches) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin: '0px 0px -5% 0px' });
    revealItems.forEach(item => revealObserver.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add('is-visible'));
  }

  // Experience cards unfold vertically as each paper layer reaches the viewport.
  const experienceGrid = $('.experience-grid');
  const experienceCards = $$('[data-unfold]', experienceGrid || document);
  if (experienceGrid && experienceCards.length) {
    experienceGrid.classList.add('is-unfolding');
    const syncExperienceCard = card => {
      const details = $('.experience-card-details', card);
      details?.setAttribute('aria-hidden', String(!card.classList.contains('is-unfolded')));
    };
    experienceCards.forEach((card, index) => {
      card.classList.toggle('is-current', index === 0);
      card.classList.remove('is-settled');
      syncExperienceCard(card);
    });
    const unfoldTriggers = experienceCards.slice(1).map(card => {
      const trigger = document.createElement('span');
      trigger.className = 'experience-unfold-trigger';
      trigger.setAttribute('aria-hidden', 'true');
      card.hidden = true;
      experienceGrid.insertBefore(trigger, card);
      return trigger;
    });
    const revealCard = (card, previous, trigger) => {
      card.hidden = false;
      previous?.classList.remove('is-current');
      previous?.classList.add('is-settled');
      card.classList.remove('is-settled');
      card.classList.add('is-current');
      trigger?.classList.add('is-open');
      window.requestAnimationFrame(() => {
        card.classList.add('is-unfolded');
        syncExperienceCard(card);
      });
    };
    if ('IntersectionObserver' in window && !reduceMotionQuery.matches) {
      let nextIndex = 1;
      const unfoldObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting || nextIndex >= experienceCards.length) return;
          unfoldObserver.unobserve(entry.target);
          revealCard(experienceCards[nextIndex], experienceCards[nextIndex - 1], unfoldTriggers[nextIndex - 1]);
          nextIndex += 1;
          if (nextIndex < experienceCards.length) unfoldObserver.observe(unfoldTriggers[nextIndex - 1]);
        });
      }, { threshold: .5, rootMargin: '0px 0px -12% 0px' });
      if (unfoldTriggers[0]) unfoldObserver.observe(unfoldTriggers[0]);
    } else {
      unfoldTriggers.forEach(trigger => trigger.remove());
      experienceCards.forEach(card => {
        card.hidden = false;
        card.classList.remove('is-current', 'is-settled');
        card.classList.add('is-unfolded');
        syncExperienceCard(card);
      });
    }
  }

  // Theme menu.
  const themeControl = $('.theme-control');
  const themeToggle = $('#theme-toggle');
  const closeThemeMenu = () => {
    themeControl?.classList.remove('is-open');
    themeToggle?.setAttribute('aria-expanded', 'false');
  };
  themeToggle?.addEventListener('click', event => {
    event.stopPropagation();
    const open = !themeControl?.classList.contains('is-open');
    themeControl?.classList.toggle('is-open', open);
    themeToggle.setAttribute('aria-expanded', String(open));
  });
  $$('[data-theme-choice]').forEach(button => button.addEventListener('click', () => {
    applyTheme(button.dataset.themeChoice);
    closeThemeMenu();
  }));
  document.addEventListener('click', event => { if (!themeControl?.contains(event.target)) closeThemeMenu(); });

  // Hero pointer spotlight and restrained parallax.
  const hero = $('.hero');
  const heroVisual = $('.hero-visual');
  const onPointerMove = event => {
    if (reduceMotionQuery.matches || state.pointerTicking || !hero) return;
    state.pointerTicking = true;
    window.requestAnimationFrame(() => {
      state.pointerTicking = false;
      const rect = hero.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      hero.style.setProperty('--spot-x', `${x}px`);
      hero.style.setProperty('--spot-y', `${y}px`);
      if (heroVisual && window.innerWidth > 900) {
        heroVisual.style.transform = `translate3d(${(x / rect.width - .5) * 7}px, ${(y / rect.height - .5) * 5}px, 0)`;
      }
    });
  };
  hero?.addEventListener('pointermove', onPointerMove, { passive: true });
  hero?.addEventListener('pointerleave', () => { if (heroVisual) heroVisual.style.transform = ''; }, { passive: true });

  // Button magnetism is opt-in and disabled for touch/reduced-motion.
  if (!reduceMotionQuery.matches && window.matchMedia('(pointer: fine)').matches) {
    $$('.js-magnetic').forEach(button => {
      button.addEventListener('pointermove', event => {
        const rect = button.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - .5) * 5;
        const y = ((event.clientY - rect.top) / rect.height - .5) * 4;
        button.style.setProperty('--mag-x', `${x}px`);
        button.style.setProperty('--mag-y', `${y}px`);
      });
      button.addEventListener('pointerleave', () => {
        button.style.setProperty('--mag-x', '0px');
        button.style.setProperty('--mag-y', '0px');
      });
    });
  }

  const currentYear = new Date().getFullYear();
  $$('[data-current-year]').forEach(element => { element.textContent = currentYear; });

  // Count one view per browser profile. A static site cannot identify a person
  // across devices, private windows, or cleared storage without a real analytics backend.
  const pageViews = $('#page-views');
  const viewCounterKey = 'udit-portfolio-view-counted-v1';
  const viewCounterIncrementEndpoint = 'https://api.counterapi.dev/v1/udit-kulkarni98-portfolio/unique-views/up';
  const viewCounterGetEndpoint = 'https://api.counterapi.dev/v1/udit-kulkarni98-portfolio/unique-views/';
  const canPersistView = (() => {
    try {
      const testKey = 'udit-portfolio-storage-test';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch { return false; }
  })();
  const loadViewCounter = async () => {
    if (!pageViews) return;
    try {
      const alreadyCounted = storage.get(viewCounterKey) === 'true';
      const endpoint = canPersistView && !alreadyCounted ? viewCounterIncrementEndpoint : viewCounterGetEndpoint;
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error(`Counter request failed: ${response.status}`);
      const payload = await response.json();
      const count = Number(payload?.data?.value ?? payload?.data?.count ?? payload?.value ?? payload?.count);
      if (!Number.isFinite(count)) throw new Error('Invalid counter response');
      if (canPersistView && !alreadyCounted) storage.set(viewCounterKey, 'true');
      pageViews.textContent = new Intl.NumberFormat('en-IN').format(count);
      pageViews.removeAttribute('data-loading');
    } catch {
      pageViews.textContent = '—';
      pageViews.setAttribute('aria-label', 'View count unavailable');
    }
  };
  loadViewCounter();

  const counters = $$('[data-counter]');
  const animateCounter = element => {
    const target = Number(element.dataset.target || 0);
    const suffix = element.dataset.suffix || '';
    if (reduceMotionQuery.matches || target === 0) {
      element.textContent = `${target}${suffix}`;
      return;
    }
    const startedAt = performance.now();
    const duration = 850;
    const tick = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = `${Math.round(target * eased)}${suffix}`;
      if (progress < 1) window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window && !reduceMotionQuery.matches) {
    const counterObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      });
    }, { threshold: .5 });
    counters.forEach(counter => counterObserver.observe(counter));
  } else {
    counters.forEach(animateCounter);
  }

  // Copy email with a graceful fallback and status announcement.
  const copyEmail = async button => {
    const email = button.dataset.email;
    const status = button.closest('.contact-card')?.querySelector('[data-copy-status]');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(email);
      else throw new Error('clipboard unavailable');
      if (status) status.textContent = 'Copied';
    } catch {
      const helper = document.createElement('textarea');
      helper.value = email;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.append(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
      if (status) status.textContent = 'Copied';
    }
    window.setTimeout(() => { if (status) status.textContent = 'Copy'; }, 1800);
  };
  $$('[data-copy-email]').forEach(button => button.addEventListener('click', () => copyEmail(button)));
  const emailHref = 'mailto:udit.kulkarni98@gmail.com?subject=Portfolio%20enquiry';
  $$('a[href^="mailto:"]').forEach(link => {
    if (link.matches('a.social-link[aria-label="Email"]')) return;
    link.setAttribute('href', emailHref);
    link.addEventListener('click', () => { window.location.href = emailHref; }, { once: true });
  });
  const webmailHref = 'https://mail.google.com/mail/?view=cm&fs=1&to=udit.kulkarni98@gmail.com&su=Portfolio%20enquiry';
  $$('a.social-link[aria-label="Email"]').forEach(link => {
    link.setAttribute('href', webmailHref);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noreferrer');
  });

  // Resume download engine with dynamic date timestamp
  const getResumeFilename = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `Udit_Kulkarni_Resume_${year}-${month}-${day}.pdf`;
  };

  const downloadResumePdf = async event => {
    if (event?.preventDefault) event.preventDefault();
    const filename = getResumeFilename();
    try {
      const response = await fetch('./Udit-Kulkarni_Resume.pdf');
      if (!response.ok) throw new Error('Failed to fetch resume');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch {
      const link = document.createElement('a');
      link.href = './Udit-Kulkarni_Resume.pdf';
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
    }
  };

  const initResumeDownloadLinks = () => {
    const filename = getResumeFilename();
    $$('[data-resume-download], a[href*="Resume.pdf"]').forEach(link => {
      link.setAttribute('download', filename);
      link.addEventListener('click', downloadResumePdf);
    });
  };
  initResumeDownloadLinks();

  // Project details are intentionally local and editable: there are no invented links
  // for private client work, so each card opens an accessible project profile instead.
  const projectModal = $('#project-modal');
  const projectModalTitle = $('#project-modal-title');
  const projectModalSummary = $('#project-modal-summary');
  const projectModalBody = $('#project-modal-body');
  const projectModalTags = $('#project-modal-tags');
  const projectDetails = {
    'hincol-crm': {
      title: 'HINCOL — Sales & Operations Platform',
      summary: 'A 77+ module modular Laravel enterprise platform spanning lead scoring, KAM classification, indents, credit governance, and SAP integrations across 5 national zones.',
      award: {
        name: 'Wow@Work',
        title: 'Collective Impact Award',
        description: 'Recognized for the successful delivery of the Hindustan Colas (HINCOL) project.',
        image: './assets/wow@work.png',
        alt: 'Wow@Work Collective Impact Award for successful delivery of the Hindustan Colas HINCOL project'
      },
      sections: [
        {
          title: 'Lead scoring & qualification engine',
          details: [
            'Created a multi-criteria Lead Scoring & Qualification engine in Laravel using project type, volume, product specifications, margin and urgency, processing 800–1,500 enterprise leads/opportunities per month across 5 national zones.',
            'Cut lead qualification from ~15 minutes to <1 second and routing from 24–48 hours to real time, saving an estimated 60–80 hours/month of sales and leadership effort and reducing administrative vetting overhead by ~35%.'
          ]
        },
        {
          title: 'KAM classification & approval state machine',
          details: [
            'Designed a Key Account Management (KAM) classification engine for ~2,000–2,500 active accounts, replacing quarterly spreadsheet reviews with event-driven and queued batch re-evaluation, plus a multi-stage approval state machine with AWS S3 audit attachments.'
          ]
        },
        {
          title: 'Whitespace deficit matrix & calendar sync',
          details: [
            'Added a Product Penetration & Cross-Sell matrix engine to calculate customer whitespace deficits from sales orders, enabling sales teams to identify product-category gaps across customer accounts.',
            'Connected Microsoft Graph API to automate Outlook seminar calendar synchronization.'
          ]
        },
        {
          title: 'Modular monolith & SAP integrations',
          details: [
            'Worked on a 77+ module Laravel platform spanning leads, opportunities, RFQs, indents and credit governance, with SAP integrations for pricing, inventory, sales orders, bank guarantees and statements.'
          ]
        }
      ],
      tags: ['Laravel', 'PHP', 'MySQL', 'SAP APIs', 'Microsoft Graph API', 'Redis', 'AWS S3', 'State Machines', 'REST APIs']
    },
    'hincolbot': {
      title: 'Hincol – Voice Assistant AI',
      summary: 'A full-duplex voice application using FastAPI, WebSockets, and Azure AI Foundry, streaming 24kHz PCM16 audio at <200ms latency to reduce ERP/CRM data-entry time by 80%.',
      sections: [
        {
          title: 'Full-duplex voice architecture',
          details: [
            'Architected and built HincolBot, a full-duplex voice application using FastAPI, WebSockets and Azure AI Foundry, reducing ERP/CRM data-entry time by 80% across 5 national operating zones, from 10–15 minutes to <2 minutes per opportunity.'
          ]
        },
        {
          title: 'Real-time 24kHz PCM16 audio streaming',
          details: [
            'Implemented bidirectional 24kHz PCM16 speech streaming over authenticated WebSockets using GPT-Live-1 and browser Web Audio APIs, achieving <200ms audio response latency with real-time barge-in, interruption handling, Redis conversational memory and persistent session summaries.'
          ]
        }
      ],
      tags: ['FastAPI', 'WebSockets', 'Azure AI Foundry', 'GPT-Live-1', 'PCM16 Audio', 'Web Audio APIs', 'Redis', 'Python']
    },
    'sales-governance': {
      title: 'Strategic Sales Agent',
      summary: 'A deterministic LangGraph agentic system physically separating conversational reasoning from database execution, with hybrid entity disambiguation (98.4% accuracy), read-only Text-to-SQL, and HITL safeguards.',
      sections: [
        {
          title: 'LangGraph conversational reasoning',
          details: [
            'Used a LangGraph StateGraph to manage multi-turn context, intent classification and dynamic slot filling, physically separating conversational reasoning from database execution and pausing for confirmation before mutations.'
          ]
        },
        {
          title: 'Hybrid entity disambiguation (98.4% accuracy)',
          details: [
            'Built hybrid entity disambiguation across 4,628 master vectors spanning ~2,500 contractors/customers, ~1,500 locations, 20 product grades and 619 highway projects; fused Qdrant dense retrieval with lexical SQL search to achieve 98.4% accuracy across 500 conversational test cases.'
          ]
        },
        {
          title: 'Governed Text-to-SQL & observability',
          details: [
            'Wrote a read-only Text-to-SQL service with vector schema discovery, read-only MySQL validation, sensitive-column masking and SSE streaming; added asynchronous Redis workflows and LangSmith observability for p50/p90/p99 latency, token usage, tracing and continuous AI evaluation.'
          ]
        },
        {
          title: 'HITL security safeguards',
          details: [
            'Added HITL safeguards: multilingual Zero-Delete protection, prompt-injection defenses, PII/schema validation and zone-scoped RBAC across 5 operating regions, requiring explicit confirmation before ACID database mutations.'
          ]
        }
      ],
      tags: ['LangGraph', 'Python', 'FastAPI', 'Qdrant', 'Text-to-SQL', 'LangSmith', 'MySQL', 'Redis', 'HITL Safeguards']
    },
    'disney-plus': {
      title: 'Disney+ Hotstar — Campaign CMS & Delivery',
      summary: 'Campaign CMS for drafting emailers and an in-house project-management tool for delivery tracking, invoicing, and pending payments.',
      sections: [
        {
          title: 'Campaign CMS & project delivery',
          details: [
            'Created a Disney+ Hotstar campaign CMS for drafting emailers and an in-house project-management tool for delivery tracking, invoicing and pending-payment management.',
            'Coordinated email campaign delivery and asset distribution for 4 international client markets across the US, UK, and MENA regions.'
          ]
        }
      ],
      tags: ['PHP', 'Laravel', 'Campaign CMS', 'Project Delivery', 'REST APIs']
    },
    citroen: {
      title: 'Citroën — Dealer Locator REST API & Platform',
      summary: 'High-concurrency Dealer Locator REST API and vehicle data ingestion platform for Citroën India, serving 1.5M+ monthly visitors with 50+ RPS peak traffic.',
      sections: [
        {
          title: 'Dealer Locator REST API & geo-spatial matching',
          details: [
            'Built the Citroën Dealer Locator REST API, aggregating real-time Stellantis/PSA global APIs, Citroën Advisor reviews and localized databases; supported a platform serving 1.5M+ monthly visitors with 50+ RPS peak traffic during national campaigns.',
            'Implemented geo-spatial dealer matching with real-time Haversine distance calculations, achieving <350ms typical response latency; deployed scalable containerized architecture using Docker, AWS ECS/ECR, S3, CloudFront and Redis.'
          ]
        },
        {
          title: '12+ REST API modules & integrations',
          details: [
            'Delivered 12+ REST API modules for the Citroën India digital platform using Drupal and PHP, including automated vehicle-data ingestion and synchronization across 1,000+ dealer locations.',
            'Connected OTP verification, WhatsApp messaging and OpenID/OAuth authentication with third-party platforms, and improved page-load performance by 25% through server-side caching and media-asset optimization.'
          ]
        }
      ],
      tags: ['Drupal', 'PHP', 'Docker', 'AWS ECS/ECR', 'AWS S3', 'CloudFront', 'Redis', 'Haversine', 'REST APIs']
    },
    'hinduja-ai': {
      title: 'Hinduja Hospital — Healthcare RAG & Conversational AI',
      summary: 'Clinical Healthcare RAG and voice assistant for P.D. Hinduja Hospital (Mahim & Khar), integrating 260+ doctors, 90 specialties, hybrid search, and BillDesk payment processing.',
      sections: [
        {
          title: 'Healthcare RAG & hybrid clinical search',
          details: [
            'Built a Healthcare RAG & voice assistant using Python 3.11, FastAPI, Qdrant and LangChain for P.D. Hinduja Hospital (Mahim & Khar), integrating 260+ doctors, 90 specialties and 2 hospital units for symptom triage, doctor discovery and real-time OPD booking.',
            'Combined dense retrieval and BM25 across 3,096 clinical chunks to maximize recall across symptom language and exact medical entities, followed by BAAI/bge-reranker-base cross-encoder reranking for precision and clinical grounding.',
            'Tuned retrieval weights (70/30 dense-sparse) for symptom versus doctor/department queries, reducing a ~30-candidate pool to 6–12 grounded chunks through reranking, threshold gating and token-budget allocation.'
          ]
        },
        {
          title: 'Multi-turn state machine & BillDesk integration',
          details: [
            'Added an asynchronous multi-turn state machine and HIS integration layer supporting live slot discovery, SMS OTP authentication, BillDesk payment processing using JWS HMAC-SHA256 and automated hospital voucher generation; validated same-slot contention with 250 simultaneous booking attempts.'
          ]
        },
        {
          title: 'Automated clinical & functional regression',
          details: [
            'Ran a 320+ PyTest/PHPUnit regression suite, achieving 96.6% pass rate for Mahim and 86.9% for Khar in automated clinical and functional regression tests; end-to-end booking flows completed in ~45–60 seconds in interactive testing.'
          ]
        }
      ],
      tags: ['Python 3.11', 'FastAPI', 'Qdrant', 'LangChain', 'BM25', 'bge-reranker-base', 'BillDesk JWS', 'PyTest', 'PHPUnit']
    }
  };
  let projectModalReturnFocus = null;
  const openProjectModal = projectId => {
    const project = projectDetails[projectId];
    if (!project || !projectModal) return;
    projectModalReturnFocus = document.activeElement;
    if (projectModalTitle) projectModalTitle.textContent = project.title;
    if (projectModalSummary) projectModalSummary.textContent = project.summary;
    if (projectModalBody) {
      const createList = details => {
        const list = document.createElement('ul');
        list.className = 'project-detail-list';
        list.replaceChildren(...details.map(detail => {
          const item = document.createElement('li');
          item.textContent = detail;
          return item;
        }));
        return list;
      };
      const content = document.createDocumentFragment();
      if (project.sections) {
        project.sections.forEach(section => {
          const sectionElement = document.createElement('div');
          sectionElement.className = 'project-detail-section';
          const heading = document.createElement('h3');
          heading.className = 'project-detail-heading';
          heading.textContent = section.title;
          sectionElement.append(heading, createList(section.details));
          content.append(sectionElement);
        });
      } else {
        content.append(createList(project.details));
      }
      if (project.award) {
        const award = document.createElement('figure');
        award.className = 'project-award';
        const media = document.createElement('div');
        media.className = 'project-award-media';
        const image = document.createElement('img');
        image.src = project.award.image;
        image.alt = project.award.alt;
        image.width = 1384;
        image.height = 1086;
        image.loading = 'lazy';
        image.decoding = 'async';
        media.append(image);
        const caption = document.createElement('figcaption');
        caption.className = 'project-award-caption';
        const label = document.createElement('span');
        label.className = 'project-award-label';
        label.textContent = 'Recognition';
        const title = document.createElement('strong');
        title.className = 'project-award-title';
        title.textContent = `${project.award.name} · ${project.award.title}`;
        const description = document.createElement('p');
        description.className = 'project-award-description';
        description.textContent = project.award.description;
        caption.append(label, title, description);
        award.append(media, caption);
        content.append(award);
      }
      projectModalBody.replaceChildren(content);
    }
    if (projectModalTags) {
      projectModalTags.replaceChildren(...project.tags.map(tag => {
        const item = document.createElement('span');
        item.className = 'tag';
        item.textContent = tag;
        return item;
      }));
    }
    if (!projectModal.open) projectModal.showModal();
  };
  $$('[data-project-open]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    openProjectModal(button.dataset.projectOpen);
  }));
  $$('.project-card').forEach(card => card.addEventListener('click', event => {
    if (event.target.closest('button, a')) return;
    openProjectModal(card.querySelector('[data-project-open]')?.dataset.projectOpen);
  }));
  $$('[data-modal-close]').forEach(button => button.addEventListener('click', () => projectModal?.close()));
  projectModal?.addEventListener('click', event => {
    if (event.target === projectModal) projectModal.close();
  });
  projectModal?.addEventListener('close', () => {
    projectModalReturnFocus?.focus?.({ preventScroll: true });
    projectModalReturnFocus = null;
  });

  // Terminal command engine.
  const terminalOutput = $('#console-output');
  const terminalInput = $('#console-input');
  const terminalStatus = $('#console-status');
  const terminalPrefix = 'php artisan';
  const terminalCommands = ['help', 'about', 'skills', 'projects', 'experience', 'contact', 'resume', 'github', 'linkedin', 'email', 'clear', 'theme', 'history'];
  const fullCommand = command => `${terminalPrefix} ${command}`;
  const commandDescriptions = {
    help: 'Show available commands', about: 'Read the professional summary', skills: 'Explore technical focus areas', projects: 'See selected systems and platforms', experience: 'View work history and education', contact: 'Show contact details', resume: 'Download the PDF resume', github: 'Open GitHub profile', linkedin: 'Open LinkedIn profile', email: 'Compose an email', clear: 'Clear terminal output', theme: 'Cycle light, dark, or auto', history: 'Show command history'
  };
  state.terminalHistory = state.terminalHistory.map(command => {
    const normalized = command.trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized.startsWith(`${terminalPrefix} `) ? normalized : fullCommand(normalized);
  }).filter(command => terminalCommands.includes(command.slice(terminalPrefix.length + 1)));
  storage.set('udit-terminal-history', JSON.stringify(state.terminalHistory));
  const escapeHTML = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const writeTerminal = (content, type = '') => {
    if (!terminalOutput) return;
    const line = document.createElement('div');
    line.className = `terminal-result${type ? ` terminal-result--${type}` : ''}`;
    line.innerHTML = content;
    terminalOutput.append(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  };

  const bootTyping = () => {
    const typingTarget = $('[data-typing]');
    if (!typingTarget || reduceMotionQuery.matches) return;
    const commands = ['php artisan optimize', 'php artisan queue:work', 'php artisan test'];
    let commandIndex = 0;
    const typeCommand = () => {
      const text = commands[commandIndex];
      typingTarget.textContent = '';
      let index = 0;
      const interval = window.setInterval(() => {
        typingTarget.textContent += text[index++];
        if (index >= text.length) {
          window.clearInterval(interval);
          window.setTimeout(() => {
            commandIndex = (commandIndex + 1) % commands.length;
            typeCommand();
          }, 3200);
        }
      }, 35);
    };
    typeCommand();
  };
  window.setTimeout(bootTyping, 520);
  const setTerminalStatus = message => { if (terminalStatus) terminalStatus.textContent = message; };
  const parseCommand = rawInput => {
    const normalizedInput = rawInput.trim().toLowerCase().replace(/\s+/g, ' ');
    const match = normalizedInput.match(/^php artisan(?:\s+(.+))?$/);
    return { normalizedInput, command: match?.[1] || '' };
  };
  const runCommand = rawInput => {
    const { normalizedInput, command } = parseCommand(rawInput);
    if (!normalizedInput) return;
    if (command && command !== 'clear' && terminalCommands.includes(command)) {
      state.terminalHistory = [...state.terminalHistory.filter(item => item !== normalizedInput), normalizedInput].slice(-30);
      storage.set('udit-terminal-history', JSON.stringify(state.terminalHistory));
    }
    state.historyIndex = state.terminalHistory.length;
    writeTerminal(`<span class="terminal-prompt">udit@portfolio:~$</span> ${escapeHTML(rawInput)}`, 'command');
    setTerminalStatus('');

    if (!command) {
      writeTerminal(`Use <span class="terminal-green">${terminalPrefix} &lt;command&gt;</span>. Type <span class="terminal-green">${fullCommand('help')}</span> to see the list.`, 'error');
      return;
    }
    if (!terminalCommands.includes(command)) {
      writeTerminal(`Unknown command: ${escapeHTML(command)}. Type <span class="terminal-green">${fullCommand('help')}</span> for the command list.`, 'error');
      return;
    }

    switch (command) {
      case 'help':
        writeTerminal(`<span class="terminal-green">Available commands:</span><div class="terminal-command-list">${terminalCommands.map(item => `<span class="terminal-help-row"><code>${fullCommand(item)}</code><span>${commandDescriptions[item]}</span></span>`).join('')}</div>`);
        break;
      case 'about':
        writeTerminal('Software Engineer with a Master’s in Computer Applications (Machine Learning), working across Laravel/PHP and Python/FastAPI. Experience building backend systems, RAG and voice applications, Text-to-SQL services, CRM/ERP platforms, high-concurrency APIs, and third-party integrations.');
        break;
      case 'skills':
        writeTerminal('Backend: PHP, Laravel, Python, FastAPI, Magento 2, Drupal, Symfony, WebSockets · Frontend: JavaScript, ReactJS, HTML/CSS, Tailwind CSS · Data, Cloud &amp; DevOps: SQL, MySQL, SQLite, Redis, AWS, Docker, Linux, Nginx, GitHub/GitLab CI, Jenkins');
        break;
      case 'projects':
        writeTerminal('HINCOL Sales &amp; Operations Platform · Hincol — Voice Assistant AI · Strategic Sales Agent · Hinduja Hospital — Healthcare RAG · Citroën Dealer Locator REST API · Disney+ Hotstar Campaign CMS');
        break;
      case 'experience':
        writeTerminal('Publicis Digital Experience (Jan 2025 – Present): Software Developer (HINCOL &amp; Hinduja Hospital) · Razorfish (Jan 2023 – Dec 2024): Software Developer &amp; Delivery (Disney+ Hotstar &amp; Citroën) · Publicis Media (Jan 2022 – Jul 2022): Software Developer &amp; Project Management Intern (Magento 2, PWA Studio, GraphQL)');
        break;
      case 'contact':
        writeTerminal('Mumbai, India · <a class="terminal-link" href="mailto:udit.kulkarni98@gmail.com">udit.kulkarni98@gmail.com</a> · 9892955429');
        break;
      case 'resume': {
        const filename = getResumeFilename();
        writeTerminal(`Downloading <a class="terminal-link" href="./Udit-Kulkarni_Resume.pdf" download="${filename}">${escapeHTML(filename)}</a>…`);
        downloadResumePdf();
        break;
      }
      case 'github':
        writeTerminal('Opening <a class="terminal-link" href="https://github.com/udit-kulkarni98" target="_blank" rel="noreferrer">github.com/udit-kulkarni98</a>…');
        window.open('https://github.com/udit-kulkarni98', '_blank', 'noopener,noreferrer');
        break;
      case 'linkedin':
        writeTerminal('Opening <a class="terminal-link" href="https://linkedin.com/in/udit-kulkarni" target="_blank" rel="noreferrer">linkedin.com/in/udit-kulkarni</a>…');
        window.open('https://linkedin.com/in/udit-kulkarni', '_blank', 'noopener,noreferrer');
        break;
      case 'email':
        writeTerminal(`Opening <a class="terminal-link" href="${webmailHref}" target="_blank" rel="noreferrer">Gmail compose</a>…`);
        window.open(webmailHref, '_blank', 'noopener,noreferrer');
        break;
      case 'clear':
        if (terminalOutput) terminalOutput.replaceChildren();
        break;
      case 'theme': {
        applyTheme(state.theme === 'light' ? 'dark' : state.theme === 'dark' ? 'auto' : 'light');
        writeTerminal(`Theme set to <span class="terminal-green">${state.theme}</span>.`);
        break;
      }
      case 'history':
        writeTerminal(state.terminalHistory.length ? state.terminalHistory.map((item, index) => `${index + 1}  ${escapeHTML(item)}`).join('<br>') : 'No commands yet.');
        break;
      default:
        break;
    }
  };
  const submitTerminal = () => {
    if (!terminalInput) return;
    const value = terminalInput.value;
    if (!value.trim()) return;
    runCommand(value);
    terminalInput.value = '';
  };
  $('#console-form')?.addEventListener('submit', event => {
    event.preventDefault();
    submitTerminal();
  });
  terminalInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitTerminal();
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!state.terminalHistory.length) return;
      state.historyIndex = Math.max(0, state.historyIndex - 1);
      terminalInput.value = state.terminalHistory[state.historyIndex] || '';
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.historyIndex = Math.min(state.terminalHistory.length, state.historyIndex + 1);
      terminalInput.value = state.terminalHistory[state.historyIndex] || '';
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const value = terminalInput.value.trim().toLowerCase().replace(/\s+/g, ' ');
      const matches = terminalCommands.map(fullCommand).filter(command => command.startsWith(value));
      if (matches.length === 1) terminalInput.value = matches[0];
      else if (matches.length > 1) setTerminalStatus(matches.join('  ·  '));
    }
  });
  $$('[data-command]').forEach(button => button.addEventListener('click', () => { terminalInput?.focus(); runCommand(button.dataset.command); }));

  // Command palette, opened by Ctrl/Cmd + K.
  const paletteBackdrop = $('#command-palette');
  const paletteInput = $('#palette-input');
  const paletteList = $('#palette-list');
  let paletteReturnFocus = null;
  const closePalette = () => {
    paletteBackdrop?.classList.remove('is-open');
    paletteBackdrop?.setAttribute('aria-hidden', 'true');
    (paletteReturnFocus || $('#palette-button'))?.focus({ preventScroll: true });
    paletteReturnFocus = null;
  };
  const renderPalette = query => {
    if (!paletteList) return;
    const filtered = terminalCommands.filter(command => `${fullCommand(command)} ${commandDescriptions[command]}`.toLowerCase().includes(query.toLowerCase()));
    state.paletteIndex = Math.min(state.paletteIndex, Math.max(0, filtered.length - 1));
    paletteList.replaceChildren(...filtered.map((command, index) => {
      const button = document.createElement('button');
      button.className = 'palette-item';
      button.type = 'button';
      button.dataset.command = fullCommand(command);
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === state.paletteIndex));
      button.innerHTML = `<code>${fullCommand(command)}</code><small>${commandDescriptions[command]}</small>`;
      button.addEventListener('click', () => { closePalette(); terminalInput?.focus(); runCommand(fullCommand(command)); });
      return button;
    }));
  };
  const openPalette = () => {
    if (!paletteBackdrop) return;
    paletteReturnFocus = document.activeElement;
    paletteBackdrop.classList.add('is-open');
    paletteBackdrop.setAttribute('aria-hidden', 'false');
    state.paletteIndex = 0;
    renderPalette('');
    window.setTimeout(() => paletteInput?.focus(), 20);
  };
  $('#palette-button')?.addEventListener('click', openPalette);
  paletteInput?.addEventListener('input', () => { state.paletteIndex = 0; renderPalette(paletteInput.value); });
  paletteInput?.addEventListener('keydown', event => {
    const items = $$('.palette-item', paletteList);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!items.length) return;
      state.paletteIndex = (state.paletteIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((item, index) => item.setAttribute('aria-selected', String(index === state.paletteIndex)));
    }
    if (event.key === 'Enter') items[state.paletteIndex]?.click();
  });
  paletteBackdrop?.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [paletteInput, ...$$('.palette-item', paletteList)].filter(Boolean);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  paletteBackdrop?.addEventListener('click', event => { if (event.target === paletteBackdrop) closePalette(); });

  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); }
    if (event.key === 'Escape') { closeMenu(); closeThemeMenu(); closePalette(); }
  });

  // Remove the loader after the first paint. The page stays usable if JS is slow or unavailable.
  window.addEventListener('load', () => window.setTimeout(() => $('.page-loader')?.remove(), reduceMotionQuery.matches ? 0 : 650), { once: true });
})();
