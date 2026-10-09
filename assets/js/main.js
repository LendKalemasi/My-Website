/* ==========================================================================
   Lend Kalemasi — interactions & motion
   Core UI (navigation, clock, copy) works without any library.
   Motion is layered on top with GSAP (+ ScrollTrigger, SplitText) and Lenis,
   and only runs when the visitor has not requested reduced motion.
   ========================================================================== */
(() => {
  "use strict";

  const root = document.documentElement;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  let lenis = null;

  /* ---------- Navigation ---------- */
  const header = $("#siteHeader");
  const nav = $("#siteNav");
  const navToggle = $("#navToggle");
  const navLinks = $$(".site-nav-list a");

  const isMenuOpen = () => nav.dataset.open === "true";

  const setMenuOpen = (open) => {
    nav.dataset.open = String(open);
    header.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  };

  navToggle.addEventListener("click", () => setMenuOpen(!isMenuOpen()));

  $$("a", nav).forEach((link) => link.addEventListener("click", () => setMenuOpen(false)));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isMenuOpen()) {
      setMenuOpen(false);
      navToggle.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (isMenuOpen() && !nav.contains(event.target) && !navToggle.contains(event.target)) {
      setMenuOpen(false);
    }
  });

  // Close the mobile panel if the viewport grows past the mobile breakpoint.
  window.matchMedia("(min-width: 48rem)").addEventListener("change", (event) => {
    if (event.matches) setMenuOpen(false);
  });

  // Solid header once the page has scrolled; dark variant over the dark contact finale.
  const darkStart = $("#contact");
  const updateHeader = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
    header.classList.toggle("is-dark", darkStart.getBoundingClientRect().top <= header.offsetHeight);
  };
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  // Highlight the nav link for the section in the middle of the viewport.
  if ("IntersectionObserver" in window) {
    const tracked = ["home", ...navLinks.map((link) => link.hash.slice(1))]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const visible = new Set();

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        });
        const current = tracked.find((section) => visible.has(section.id));
        navLinks.forEach((link) => {
          if (current && link.hash === "#" + current.id) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );

    tracked.forEach((section) => sectionObserver.observe(section));
  }

  /* ---------- In-page links ---------- */
  // With Lenis active, in-page links are scrolled by Lenis; focus still moves to the
  // target so keyboard and screen-reader users land in the right place.
  const focusTarget = (target) => {
    if (!target.matches("a, button, input, textarea, select, [tabindex]")) {
      target.setAttribute("tabindex", "-1");
    }
    target.focus({ preventScroll: true });
  };

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || !lenis || event.defaultPrevented) return;

    const hash = link.getAttribute("href");
    const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
    if (!target) return;

    event.preventDefault();
    lenis.scrollTo(hash === "#home" || hash === "#main-content" ? 0 : target, {
      duration: 1.2,
      easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    });
    history.pushState(null, "", hash);
    focusTarget(hash === "#home" ? $("#hero-title") : target);
  });

  /* ---------- Local time (Bremen) ---------- */
  const clocks = $$(".js-clock");
  if (clocks.length && window.Intl) {
    const timeFormat = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const zoneFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", timeZoneName: "short" });

    const renderClock = () => {
      const now = new Date();
      const zone = zoneFormat.formatToParts(now).find((part) => part.type === "timeZoneName");
      const label = `${timeFormat.format(now)}${zone ? " " + zone.value : ""}`;
      clocks.forEach((clock) => {
        clock.textContent = label;
        clock.dateTime = now.toISOString();
      });
    };

    renderClock();
    setInterval(renderClock, 15000);
  }

  /* ---------- Copy email ---------- */
  const copyStatus = $("#copyStatus");
  $$("[data-copy]").forEach((button) => {
    const label = $(".copy-label", button);
    let resetTimer;

    button.addEventListener("click", async () => {
      const value = button.dataset.copy;
      try {
        await navigator.clipboard.writeText(value);
        button.dataset.state = "copied";
        label.textContent = "Copied";
        copyStatus.textContent = "Email address copied to clipboard.";
      } catch {
        button.dataset.state = "error";
        label.textContent = "Copy failed";
        copyStatus.textContent = `Could not copy automatically. The address is ${value}.`;
      }
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        delete button.dataset.state;
        label.textContent = "Copy";
        copyStatus.textContent = "";
      }, 2400);
    });
  });

  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ==========================================================================
     Motion
     ========================================================================== */
  const { gsap, ScrollTrigger, SplitText, Lenis } = window;

  if (!gsap || !ScrollTrigger || !SplitText) {
    root.classList.remove("has-motion");
    return;
  }

  window.__motionReady = true;
  gsap.registerPlugin(ScrollTrigger, SplitText);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const EASE = "expo.out";
  const REVEAL = { y: 28, duration: 0.9, stagger: 0.08 };

  /* Port of React Bits <DecryptedText> (sequential mode, revealDirection "start"),
     rewritten for vanilla DOM. The real text stays available to assistive tech. */
  const DECRYPT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const decryptText = (el, { speed = 32 } = {}) => {
    const text = el.dataset.text;
    const output = $(".decrypt-output", el);
    let revealed = 0;
    const scramble = () =>
      [...text]
        .map((char, i) => {
          if (i < revealed || !/[A-Za-z0-9]/.test(char)) return char;
          return DECRYPT_CHARS[Math.floor(Math.random() * DECRYPT_CHARS.length)];
        })
        .join("");

    const timer = setInterval(() => {
      revealed += 1;
      output.textContent = scramble();
      if (revealed >= text.length) clearInterval(timer);
    }, speed);
    output.textContent = scramble();
    return () => clearInterval(timer);
  };

  /* Port of React Bits <ScrollReveal>: words fade from a low base opacity to full
     as the paragraph scrolls into reading position. Inline markup (e.g. <strong>)
     is preserved by wrapping words inside each text node. Blur and rotation are
     omitted to keep it cheap and legible. */
  const wrapWords = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
        } else {
          const span = document.createElement("span");
          span.className = "word";
          span.textContent = part;
          fragment.appendChild(span);
        }
      });
      node.replaceWith(fragment);
    });
    return $$(".word", el);
  };

  const fontsReady = Promise.race([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 900)),
  ]);

  fontsReady.then(() => {
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      root.classList.add("has-motion");
      const cleanups = [];

      /* ---- Smooth scrolling: Lenis driven by GSAP's ticker (single RAF loop) ---- */
      if (Lenis) {
        lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 1, autoRaf: false });
        lenis.on("scroll", ScrollTrigger.update);
        const raf = (time) => lenis.raf(time * 1000);
        gsap.ticker.add(raf);
        gsap.ticker.lagSmoothing(0);
        cleanups.push(() => {
          gsap.ticker.remove(raf);
          gsap.ticker.lagSmoothing(500, 33);
          lenis.destroy();
          lenis = null;
        });
      }

      /* ---- Hero introduction (port of React Bits <SplitText>, chars rising from a mask) ---- */
      const title = $(".hero-title");
      const split = SplitText.create($$(".hero-line", title), { type: "chars", charsClass: "hero-char", aria: "none" });
      title.setAttribute("aria-label", "Lend Kalemasi");
      $$(".hero-line", title).forEach((line) => line.setAttribute("aria-hidden", "true"));
      cleanups.push(() => {
        split.revert();
        title.removeAttribute("aria-label");
        $$(".hero-line", title).forEach((line) => line.removeAttribute("aria-hidden"));
      });

      gsap
        .timeline({ defaults: { ease: EASE } })
        .set(title, { visibility: "visible" })
        .from(split.chars, { yPercent: 118, duration: 1.15, stagger: 0.03 }, 0.1)
        .fromTo(
          ".hero-figure-frame",
          { clipPath: "inset(100% 0% 0% 0%)" },
          { clipPath: "inset(0% 0% 0% 0%)", duration: 1.25, ease: "expo.inOut" },
          0.15
        )
        .from(".hero-portrait", { scale: 1.18, duration: 1.7 }, 0.15)
        .fromTo("[data-hero]", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.07, clearProps: "transform" }, 0.5)
        .to(".hero-caption", { opacity: 1, duration: 0.8 }, 1.1);

      /* ---- Section entrances ---- */
      const markRevealed = (elements) => elements.forEach((el) => (el.dataset.revealed = ""));

      ScrollTrigger.batch("[data-reveal]", {
        start: "top 90%",
        once: true,
        onEnter: (elements) => {
          const pending = elements.filter((el) => !("revealed" in el.dataset));
          markRevealed(pending);
          gsap.fromTo(
            pending,
            { opacity: 0, y: REVEAL.y },
            { opacity: 1, y: 0, duration: REVEAL.duration, ease: EASE, stagger: REVEAL.stagger, overwrite: true, clearProps: "transform" }
          );
        },
      });

      // Keyboard users must never focus something that is still invisible:
      // reveal the containing block immediately when focus lands inside it.
      const revealOnFocus = (event) => {
        const block = event.target.closest && event.target.closest("[data-reveal]");
        if (!block || "revealed" in block.dataset) return;
        markRevealed([block]);
        gsap.to(block, { opacity: 1, y: 0, duration: 0.25, overwrite: true, clearProps: "transform" });
      };
      document.addEventListener("focusin", revealOnFocus);
      cleanups.push(() => {
        document.removeEventListener("focusin", revealOnFocus);
        $$("[data-revealed]").forEach((el) => delete el.dataset.revealed);
      });

      /* ---- Kicker labels decrypt once as their section arrives ---- */
      $$("[data-decrypt]").forEach((el) => {
        const text = el.textContent.trim();
        el.dataset.text = text;
        el.innerHTML = "";
        const srText = document.createElement("span");
        srText.className = "visually-hidden";
        srText.textContent = text;
        const output = document.createElement("span");
        output.className = "decrypt-output";
        output.setAttribute("aria-hidden", "true");
        output.textContent = text;
        el.append(srText, output);

        let stop = null;
        ScrollTrigger.create({
          trigger: el,
          start: "top 92%",
          once: true,
          onEnter: () => (stop = decryptText(el)),
        });
        cleanups.push(() => {
          if (stop) stop();
          el.textContent = text;
        });
      });

      /* ---- About statement: scroll-linked word reveal ---- */
      const statement = $("[data-scroll-reveal]");
      if (statement) {
        const original = statement.innerHTML;
        const words = wrapWords(statement);
        gsap.fromTo(
          words,
          { opacity: 0.16 },
          {
            opacity: 1,
            ease: "none",
            stagger: 0.05,
            scrollTrigger: { trigger: statement, start: "top 85%", end: "bottom 55%", scrub: 0.6 },
          }
        );
        cleanups.push(() => (statement.innerHTML = original));
      }

      /* ---- Experience: the rail fills as the timeline is read ---- */
      gsap.fromTo(
        ".timeline-progress",
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: { trigger: ".timeline", start: "top 70%", end: "bottom 70%", scrub: 0.4 },
        }
      );

      return () => {
        cleanups.forEach((fn) => fn());
        root.classList.remove("has-motion");
      };
    });

    /* ---- Desktop-only depth: the portrait drifts slightly slower than the page ---- */
    mm.add("(prefers-reduced-motion: no-preference) and (min-width: 64.01rem) and (pointer: fine)", () => {
      gsap.to(".hero-figure", {
        y: -56,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
      });
    });

    if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
  });
})();
