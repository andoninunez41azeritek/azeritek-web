/* =========================================================================
   AZERITEK — site interactions (cursor, nav, reveals, scroll-driven UI)
   Vanilla JS + GSAP/ScrollTrigger (loaded globally before this file).
   ========================================================================= */
(function () {
  "use strict";

  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const IS_TOUCH = window.matchMedia("(hover: none)").matches;

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initPreloader();
    initCursor();
    initNav();
    initQuickContact();
    initMagnetic();
    initReveals();
    initJourney();
    initDemo();
    initTransform();
    initServiceTilt();
    initIndustries();
    initProcess();
    initCounters();
    initFaq();
    initCalculator();
    initSmoothAnchors();
  });

  /* ---------------------------------------------------------------------
     Preloader
     ------------------------------------------------------------------- */
  function initPreloader() {
    const el = document.querySelector(".preloader");
    if (!el) return;
    const bar = el.querySelector(".preloader-bar span");
    let done = false;

    document.addEventListener("azeritek:load-progress", (e) => {
      if (bar) bar.style.width = Math.round((e.detail.progress || 0) * 100) + "%";
    });

    const finish = () => {
      if (done) return;
      done = true;
      if (bar) bar.style.width = "100%";
      setTimeout(() => el.classList.add("is-done"), 260);
    };

    document.addEventListener("azeritek:ready", finish);
    // hard safety net so the site is never blocked by the 3D scene
    setTimeout(finish, 3200);
  }

  /* ---------------------------------------------------------------------
     Custom cursor
     ------------------------------------------------------------------- */
  function initCursor() {
    if (IS_TOUCH) return;
    const dot = document.querySelector(".cursor-dot");
    const ring = document.querySelector(".cursor-ring");
    if (!dot || !ring) return;

    let x = window.innerWidth / 2,
      y = window.innerHeight / 2;
    let rx = x,
      ry = y;

    window.addEventListener("mousemove", (e) => {
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`;
    });

    function raf() {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(raf);
    }
    raf();

    document.addEventListener("mousedown", () => ring.classList.add("is-down"));
    document.addEventListener("mouseup", () => ring.classList.remove("is-down"));

    const hoverables = "a, button, .service-card, .industry-tab, [data-cursor-hover]";
    document.addEventListener("mouseover", (e) => {
      if (e.target.closest(hoverables)) ring.classList.add("is-hover");
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(hoverables)) ring.classList.remove("is-hover");
    });
  }

  /* ---------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------- */
  function initNav() {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const burger = document.querySelector(".nav-burger");
    const panel = document.querySelector(".mobile-panel");
    if (burger && panel) {
      burger.addEventListener("click", () => {
        const open = panel.classList.toggle("is-open");
        document.body.classList.toggle("nav-open", open);
      });
      panel.querySelectorAll("a").forEach((a) =>
        a.addEventListener("click", () => {
          panel.classList.remove("is-open");
          document.body.classList.remove("nav-open");
        })
      );
    }
  }

  /* ---------------------------------------------------------------------
     Floating quick-contact widget
     ------------------------------------------------------------------- */
  function initQuickContact() {
    const wrap = document.getElementById("quick-contact");
    const toggle = document.getElementById("quick-contact-toggle");
    if (!wrap || !toggle) return;

    toggle.addEventListener("click", () => {
      const open = wrap.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
      if (wrap.classList.contains("is-open") && !wrap.contains(e.target)) {
        wrap.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        wrap.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------------------------------------------------------------------
     Magnetic buttons
     ------------------------------------------------------------------- */
  function initMagnetic() {
    if (IS_TOUCH || REDUCED_MOTION) return;
    document.querySelectorAll("[data-magnetic]").forEach((btn) => {
      const strength = 18;
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        const relX = e.clientX - r.left - r.width / 2;
        const relY = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${(relX / r.width) * strength}px, ${(relY / r.height) * strength}px)`;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "";
      });
    });
  }

  /* ---------------------------------------------------------------------
     Generic scroll reveals
     ------------------------------------------------------------------- */
  function initReveals() {
    const items = document.querySelectorAll("[data-reveal], [data-reveal-scale]");
    if (!items.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    items.forEach((el, i) => {
      el.style.setProperty("--i", el.dataset.i || i % 8);
      io.observe(el);
    });
  }

  /* ---------------------------------------------------------------------
     Journey — vertical data flow, scroll-scrubbed
     ------------------------------------------------------------------- */
  function initJourney() {
    const flow = document.querySelector(".journey-flow");
    if (!flow || !window.ScrollTrigger) return;
    const fill = flow.querySelector(".journey-line-fill");
    const steps = Array.from(flow.querySelectorAll(".journey-step"));

    ScrollTrigger.create({
      trigger: flow,
      start: "top 75%",
      end: "bottom 55%",
      scrub: 0.6,
      onUpdate: (self) => {
        const p = self.progress;
        if (fill) fill.style.height = p * 100 + "%";
        const activeIdx = Math.floor(p * steps.length);
        steps.forEach((s, i) => s.classList.toggle("is-active", i <= activeIdx));
      },
    });
  }

  /* ---------------------------------------------------------------------
     Live demo — WhatsApp conversation + module activation
     ------------------------------------------------------------------- */
  function initDemo() {
    const section = document.querySelector(".demo");
    if (!section) return;
    const bubbles = Array.from(section.querySelectorAll(".bubble"));
    const typing = section.querySelector(".typing");
    const modules = Array.from(section.querySelectorAll(".demo-module"));

    let playing = false;

    function reset() {
      bubbles.forEach((b) => b.classList.remove("is-in"));
      modules.forEach((m) => m.classList.remove("is-active"));
      if (typing) typing.classList.remove("is-in");
    }

    function play() {
      if (playing) return;
      playing = true;
      reset();
      const tl = gsap.timeline({
        onComplete: () => (playing = false),
      });
      let t = 0.2;
      bubbles.forEach((b, i) => {
        const isAI = b.classList.contains("out");
        if (isAI && typing) {
          tl.call(() => typing.classList.add("is-in"), null, t);
          t += 0.55;
          tl.call(() => typing.classList.remove("is-in"), null, t);
        }
        tl.call(() => b.classList.add("is-in"), null, t);
        t += 0.55;

        // fire matching module ~ after the AI confirms the booking
        if (i === bubbles.length - 1) {
          modules.forEach((m, mi) => {
            tl.call(() => m.classList.add("is-active"), null, t + mi * 0.28);
          });
        }
      });
    }

    if (window.ScrollTrigger) {
      ScrollTrigger.create({
        trigger: section,
        start: "top 65%",
        onEnter: play,
        onEnterBack: play,
        onLeaveBack: reset,
      });
    } else {
      play();
    }
  }

  /* ---------------------------------------------------------------------
     Problem -> Solution chaos/order transform
     ------------------------------------------------------------------- */
  function initTransform() {
    const stage = document.querySelector(".transform-stage");
    if (!stage || !window.ScrollTrigger) return;
    const beforeEls = Array.from(stage.querySelectorAll(".tf-before .tf-pill"));
    const afterEls = Array.from(stage.querySelectorAll(".tf-after .tf-pill"));
    const afterLayer = stage.querySelector(".tf-after");
    const core = stage.querySelector(".transform-core");
    if (window.innerWidth <= 640) return; // simplified static layout on mobile (CSS handles it)

    // scattered starting spots around the stage
    const scatterSpots = [
      { x: "6%", y: "10%", r: -8 },
      { x: "62%", y: "4%", r: 6 },
      { x: "4%", y: "58%", r: 5 },
      { x: "68%", y: "68%", r: -6 },
      { x: "30%", y: "82%", r: 9 },
      { x: "38%", y: "2%", r: -4 },
    ];
    const gridSpots = [
      { x: "2%", y: "6%" },
      { x: "36%", y: "2%" },
      { x: "70%", y: "8%" },
      { x: "4%", y: "78%" },
      { x: "36%", y: "82%" },
      { x: "68%", y: "76%" },
    ];

    beforeEls.forEach((el, i) => {
      const s = scatterSpots[i % scatterSpots.length];
      gsap.set(el, { left: s.x, top: s.y, rotate: s.r });
    });
    afterEls.forEach((el, i) => {
      const s = gridSpots[i % gridSpots.length];
      gsap.set(el, { left: s.x, top: s.y });
    });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: stage,
        start: "top 70%",
        end: "bottom 30%",
        scrub: 0.7,
      },
    });

    tl.to(
      beforeEls,
      {
        left: "50%",
        top: "50%",
        scale: 0.2,
        opacity: 0,
        rotate: 0,
        stagger: 0.06,
        ease: "power2.in",
      },
      0
    )
      .to(core, { scale: 1.35, duration: 0.25 }, 0.42)
      .to(core, { scale: 1, duration: 0.25 }, 0.67)
      .to(afterLayer, { opacity: 1, duration: 0.05 }, 0.5)
      .from(
        afterEls,
        {
          left: "50%",
          top: "50%",
          scale: 0.2,
          opacity: 0,
          stagger: 0.06,
          ease: "power2.out",
        },
        0.5
      );
  }

  /* ---------------------------------------------------------------------
     Service cards — 3D tilt + spotlight
     ------------------------------------------------------------------- */
  function initServiceTilt() {
    if (IS_TOUCH || REDUCED_MOTION) return;
    document.querySelectorAll(".service-card").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const rx = (py - 0.5) * -10;
        const ry = (px - 0.5) * 12;
        card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
        card.style.setProperty("--mx", px * 100 + "%");
        card.style.setProperty("--my", py * 100 + "%");
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
      });
    });
  }

  /* ---------------------------------------------------------------------
     Industries — tab switcher
     ------------------------------------------------------------------- */
  function initIndustries() {
    const tabs = Array.from(document.querySelectorAll(".industry-tab"));
    const panels = Array.from(document.querySelectorAll(".industry-flow"));
    if (!tabs.length) return;

    function activate(key) {
      tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.industry === key));
      panels.forEach((p) => {
        const match = p.dataset.industry === key;
        if (match) {
          p.hidden = false;
          requestAnimationFrame(() => p.classList.add("is-in"));
        } else {
          p.classList.remove("is-in");
          p.hidden = true;
        }
      });
    }

    tabs.forEach((t) => t.addEventListener("click", () => activate(t.dataset.industry)));
    activate(tabs[0].dataset.industry);
  }

  /* ---------------------------------------------------------------------
     Process — scroll-scrubbed connector line
     ------------------------------------------------------------------- */
  function initProcess() {
    const track = document.querySelector(".process-track");
    if (!track || !window.ScrollTrigger) return;
    const fill = track.querySelector(".process-line-fill");
    const steps = Array.from(track.querySelectorAll(".process-step"));

    ScrollTrigger.create({
      trigger: track,
      start: "top 75%",
      end: "bottom 55%",
      scrub: 0.6,
      onUpdate: (self) => {
        const p = self.progress;
        const isRow = window.innerWidth > 900;
        if (fill) {
          if (isRow) fill.style.width = p * 100 + "%";
          else fill.style.height = p * 100 + "%";
        }
        const activeIdx = Math.floor(p * steps.length);
        steps.forEach((s, i) => s.classList.toggle("is-active", i <= activeIdx));
      },
    });
  }

  /* ---------------------------------------------------------------------
     Metrics — count-up numbers
     ------------------------------------------------------------------- */
  function initCounters() {
    const nums = document.querySelectorAll(".m-num[data-count]");
    if (!nums.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          const el = entry.target;
          const to = parseFloat(el.dataset.count);
          const prefix = el.dataset.prefix || "";
          const suffix = el.dataset.suffix || "";
          const dur = 1400;
          const start = performance.now();
          function step(now) {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = prefix + Math.round(eased * to) + suffix;
            if (p < 1) requestAnimationFrame(step);
          }
          if (REDUCED_MOTION) {
            el.textContent = prefix + to + suffix;
          } else {
            requestAnimationFrame(step);
          }
        });
      },
      { threshold: 0.5 }
    );
    nums.forEach((el) => io.observe(el));
  }

  /* ---------------------------------------------------------------------
     FAQ accordion
     ------------------------------------------------------------------- */
  function initFaq() {
    const items = document.querySelectorAll(".faq-item");
    if (!items.length) return;
    items.forEach((item) => {
      const btn = item.querySelector(".faq-q");
      const answer = item.querySelector(".faq-a");
      btn.addEventListener("click", () => {
        const isOpen = item.classList.contains("is-open");
        items.forEach((other) => {
          other.classList.remove("is-open");
          other.querySelector(".faq-q").setAttribute("aria-expanded", "false");
          other.querySelector(".faq-a").style.maxHeight = null;
        });
        if (!isOpen) {
          item.classList.add("is-open");
          btn.setAttribute("aria-expanded", "true");
          answer.style.maxHeight = answer.scrollHeight + "px";
        }
      });
    });
  }

  /* ---------------------------------------------------------------------
     Impact calculator
     ------------------------------------------------------------------- */
  function initCalculator() {
    const messagesInput = document.getElementById("calc-messages");
    const minutesInput = document.getElementById("calc-minutes");
    if (!messagesInput || !minutesInput) return;

    const messagesVal = document.getElementById("calc-messages-val");
    const minutesVal = document.getElementById("calc-minutes-val");
    const hoursOut = document.getElementById("calc-hours");
    const moneyOut = document.getElementById("calc-money");
    const cta = document.getElementById("calc-cta");

    const HOURLY_COST = 18; // € — disclosed in the on-page disclaimer
    const AUTOMATION_SHARE = 0.75; // disclosed in the on-page disclaimer

    function fillVar(input) {
      const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
      input.style.setProperty("--fill", pct + "%");
    }

    function update() {
      const messages = parseInt(messagesInput.value, 10);
      const minutes = parseInt(minutesInput.value, 10);
      messagesVal.textContent = messages;
      minutesVal.textContent = minutes;
      fillVar(messagesInput);
      fillVar(minutesInput);

      const totalHoursMonth = (messages * minutes) / 60;
      const hoursSaved = Math.round(totalHoursMonth * AUTOMATION_SHARE);
      const moneySaved = Math.round(hoursSaved * HOURLY_COST);

      hoursOut.textContent = hoursSaved;
      moneyOut.textContent = moneySaved.toLocaleString("es-ES");

      if (cta) {
        const msg = `Hola, he calculado que podría ahorrar unas ${hoursSaved}h y ${moneySaved}€ al mes automatizando con Azeritek. Quiero un diagnóstico gratuito.`;
        cta.href = "https://wa.me/34639730895?text=" + encodeURIComponent(msg);
      }
    }

    messagesInput.addEventListener("input", update);
    minutesInput.addEventListener("input", update);
    update();
  }

  /* ---------------------------------------------------------------------
     Smooth anchor scrolling (accounts for fixed nav)
     ------------------------------------------------------------------- */
  function initSmoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (!id || id === "#") return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
      });
    });
  }
})();
