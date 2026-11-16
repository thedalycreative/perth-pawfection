/* ==========================================================================
   Perth Paws — shared motion layer (no dependencies)
   Loaded with `defer` on every page. Behaviour is opt-in via attributes:

     data-reveal="up|left|right|zoom|pop|tilt"   animate in when scrolled into view
     data-stagger="up|pop|…"  (on a parent)      reveal each child in turn
     data-split                                  headline words bounce in
     data-count="10000" data-suffix="+"          count up when visible
     data-decimals="1"                           …with decimals
     data-tilt                                   3D tilt toward the pointer
     data-magnetic                               button drifts toward the pointer
     data-parallax="0.15"                        drifts at a different scroll speed
     data-boop                                   paw/heart burst on click
     .pp-marquee > .pp-marquee-track             infinite scrolling band
     data-copy="#5A7D3D"                         copy text to clipboard + toast

   Plus, automatically: intro curtain, page-to-page transition, paw-print
   cursor trail (mouse only) and a back-to-top button with progress ring.
   Everything is skipped when the visitor prefers reduced motion.
   ========================================================================== */
(function () {
	'use strict';

	var root = document.documentElement;
	var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

	var PAW =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15.5c-2.2 0-4 1.3-4 3s1.8 3 4 3 4-1.3 4-3-1.8-3-4-3zm-4.5-3a2 2 0 100-4 2 2 0 000 4zm3-4.5a2 2 0 100-4 2 2 0 000 4zm6 4.5a2 2 0 100-4 2 2 0 000 4zm-3-4.5a2 2 0 100-4 2 2 0 000 4z"/></svg>';
	var HEART =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"/></svg>';

	function store(method, key, value) {
		try {
			return window.sessionStorage[method](key, value);
		} catch (e) {
			return null;
		}
	}

	function each(selector, fn, scope) {
		Array.prototype.forEach.call((scope || document).querySelectorAll(selector), fn);
	}

	/* ------------------------------------------------------------------
	   Intro curtain + page transitions
	   ------------------------------------------------------------------ */
	var curtain = null;

	function makeCurtain() {
		curtain = document.createElement('div');
		curtain.className = 'pp-curtain';
		curtain.setAttribute('aria-hidden', 'true');
		curtain.innerHTML =
			'<div class="pp-stamps">' +
			'<span class="pp-stamp">' + PAW + '</span>' +
			'<span class="pp-stamp">' + PAW + '</span>' +
			'<span class="pp-stamp">' + PAW + '</span>' +
			'<span class="pp-stamp">' + PAW + '</span>' +
			'</div>';
		document.body.appendChild(curtain);
	}

	function liftCurtain(delay) {
		if (!curtain) return;
		setTimeout(function () {
			curtain.classList.add('is-up');
			root.classList.remove('pp-cover');
			document.dispatchEvent(new CustomEvent('pp:ready'));
		}, delay);
	}

	function initCurtain() {
		if (reduced) {
			root.classList.remove('pp-cover');
			return;
		}
		var covered = root.classList.contains('pp-cover');
		makeCurtain();
		if (covered) {
			var fromNav = store('getItem', 'pp-nav');
			store('setItem', 'pp-seen', '1');
			store('removeItem', 'pp-nav');
			// First visit gets the full stamp sequence; page-to-page is quicker.
			liftCurtain(fromNav ? 250 : 750);
		} else {
			curtain.classList.add('is-up');
			document.dispatchEvent(new CustomEvent('pp:ready'));
		}

		document.addEventListener('click', function (e) {
			var a = e.target.closest && e.target.closest('a[href]');
			if (!a || e.defaultPrevented || e.button !== 0) return;
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
			if (a.target && a.target !== '_self') return;
			if (a.hasAttribute('download')) return;
			var url = new URL(a.href, location.href);
			if (url.origin !== location.origin) return;
			if (url.pathname === location.pathname) return; // same page / hash link
			e.preventDefault();
			store('setItem', 'pp-nav', '1');
			curtain.classList.remove('is-up');
			curtain.classList.add('is-down-start');
			void curtain.offsetWidth; // restart the transition from the bottom
			curtain.classList.remove('is-down-start');
			setTimeout(function () {
				location.href = url.href;
			}, 560);
		});

		// Coming back via the browser's back button restores a frozen page.
		window.addEventListener('pageshow', function (e) {
			if (e.persisted && curtain) curtain.classList.add('is-up');
		});
	}

	/* ------------------------------------------------------------------
	   Split headlines into animated words
	   ------------------------------------------------------------------ */
	function splitWords(el) {
		var i = 0;
		(function walk(node) {
			Array.prototype.slice.call(node.childNodes).forEach(function (child) {
				if (child.nodeType === 3) {
					var parts = child.textContent.split(/(\s+)/);
					var frag = document.createDocumentFragment();
					parts.forEach(function (part) {
						if (!part) return;
						if (/^\s+$/.test(part)) {
							frag.appendChild(document.createTextNode(part));
							return;
						}
						var outer = document.createElement('span');
						outer.className = 'pp-word';
						var inner = document.createElement('span');
						inner.style.setProperty('--i', i++);
						inner.textContent = part;
						outer.appendChild(inner);
						frag.appendChild(outer);
					});
					node.replaceChild(frag, child);
				} else if (child.nodeType === 1 && child.tagName !== 'BR') {
					walk(child);
				}
			});
		})(el);
	}

	/* ------------------------------------------------------------------
	   Count-up numbers
	   ------------------------------------------------------------------ */
	function countUp(el) {
		var target = parseFloat(el.getAttribute('data-count'));
		var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
		var suffix = el.getAttribute('data-suffix') || '';
		var prefix = el.getAttribute('data-prefix') || '';
		var duration = 1800;
		var start = null;
		function fmt(v) {
			return prefix + v.toLocaleString('en-AU', {
				minimumFractionDigits: decimals,
				maximumFractionDigits: decimals
			}) + suffix;
		}
		if (reduced) {
			el.textContent = fmt(target);
			return;
		}
		function frame(t) {
			if (!start) start = t;
			var p = Math.min((t - start) / duration, 1);
			var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); // ease-out expo
			el.textContent = fmt(target * eased);
			if (p < 1) requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);
	}

	/* ------------------------------------------------------------------
	   Reveal-on-scroll (also drives split headlines and counters)
	   ------------------------------------------------------------------ */
	function initReveals() {
		each('[data-stagger]', function (parent) {
			var kind = parent.getAttribute('data-stagger') || 'up';
			var step = parseInt(parent.getAttribute('data-stagger-step') || '90', 10);
			Array.prototype.forEach.call(parent.children, function (child, i) {
				if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', kind);
				child.style.setProperty('--pp-delay', i * step + 'ms');
			});
		});

		each('[data-split]', splitWords);

		var targets = document.querySelectorAll('[data-reveal], [data-split], [data-count], .reveal');

		function show(el) {
			el.classList.add('is-in', 'active', 'show'); // active/show = legacy .reveal classes
			if (el.hasAttribute('data-count') && !el.__counted) {
				el.__counted = true;
				countUp(el);
			}
		}

		if (!('IntersectionObserver' in window)) {
			Array.prototype.forEach.call(targets, show);
			return;
		}

		var io = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					if (entry.isIntersecting) {
						show(entry.target);
						io.unobserve(entry.target);
					}
				});
			},
			{ threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
		);

		function observeAll() {
			Array.prototype.forEach.call(targets, function (el) {
				io.observe(el);
			});
		}

		// Wait until the intro curtain lifts so hero animations are actually seen.
		if (curtain && !curtain.classList.contains('is-up')) {
			document.addEventListener('pp:ready', observeAll, { once: true });
		} else {
			observeAll();
		}
	}

	/* ------------------------------------------------------------------
	   Pointer effects: tilt, magnetic, cursor trail
	   ------------------------------------------------------------------ */
	function initTilt() {
		each('[data-tilt]', function (card) {
			var max = parseFloat(card.getAttribute('data-tilt') || '8') || 8;
			var glare = document.createElement('span');
			glare.className = 'pp-glare';
			card.appendChild(glare);
			card.addEventListener('pointermove', function (e) {
				var r = card.getBoundingClientRect();
				var x = (e.clientX - r.left) / r.width;
				var y = (e.clientY - r.top) / r.height;
				card.classList.add('is-tilting');
				card.style.setProperty('--ry', ((x - 0.5) * 2 * max).toFixed(2) + 'deg');
				card.style.setProperty('--rx', ((0.5 - y) * 2 * max).toFixed(2) + 'deg');
				card.style.setProperty('--gx', x * 100 + '%');
				card.style.setProperty('--gy', y * 100 + '%');
			});
			card.addEventListener('pointerleave', function () {
				card.classList.remove('is-tilting');
				card.style.setProperty('--rx', '0deg');
				card.style.setProperty('--ry', '0deg');
			});
		});
	}

	function initMagnetic() {
		each('[data-magnetic]', function (el) {
			var strength = parseFloat(el.getAttribute('data-magnetic') || '0.35') || 0.35;
			el.addEventListener('pointermove', function (e) {
				var r = el.getBoundingClientRect();
				var dx = e.clientX - (r.left + r.width / 2);
				var dy = e.clientY - (r.top + r.height / 2);
				el.classList.add('is-pulling');
				el.style.translate = (dx * strength).toFixed(1) + 'px ' + (dy * strength).toFixed(1) + 'px';
			});
			el.addEventListener('pointerleave', function () {
				el.classList.remove('is-pulling');
				el.style.translate = '';
			});
		});
	}

	function initTrail() {
		if (document.body.hasAttribute('data-no-trail')) return;
		var lastX = null;
		var lastY = null;
		var side = 1;
		var live = 0;
		window.addEventListener(
			'pointermove',
			function (e) {
				if (e.pointerType !== 'mouse') return;
				if (lastX === null) {
					lastX = e.clientX;
					lastY = e.clientY;
					return;
				}
				var dx = e.clientX - lastX;
				var dy = e.clientY - lastY;
				var dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < 42 || live > 14) return;
				var angle = Math.atan2(dy, dx);
				// Alternate left / right paws either side of the walking line.
				var ox = Math.cos(angle + Math.PI / 2) * 7 * side;
				var oy = Math.sin(angle + Math.PI / 2) * 7 * side;
				side *= -1;
				var paw = document.createElement('span');
				paw.className = 'pp-trail';
				paw.innerHTML = PAW;
				paw.style.left = e.clientX + ox + 'px';
				paw.style.top = e.clientY + oy + 'px';
				paw.style.setProperty('--a', (angle * 180) / Math.PI + 90 + 'deg');
				document.body.appendChild(paw);
				live++;
				paw.addEventListener('animationend', function () {
					paw.remove();
					live--;
				});
				lastX = e.clientX;
				lastY = e.clientY;
			},
			{ passive: true }
		);
	}

	/* ------------------------------------------------------------------
	   Boop burst on click
	   ------------------------------------------------------------------ */
	function boop(x, y, colors) {
		for (var i = 0; i < 9; i++) {
			var p = document.createElement('span');
			p.className = 'pp-boop';
			p.innerHTML = i % 3 === 0 ? HEART : PAW;
			var a = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
			var d = 50 + Math.random() * 45;
			p.style.left = x + 'px';
			p.style.top = y + 'px';
			p.style.setProperty('--dx', Math.cos(a) * d + 'px');
			p.style.setProperty('--dy', Math.sin(a) * d - 20 + 'px');
			p.style.setProperty('--rot', (Math.random() * 120 - 60).toFixed(0) + 'deg');
			if (colors && colors.length) p.style.setProperty('--c', colors[i % colors.length]);
			document.body.appendChild(p);
			p.addEventListener('animationend', function () {
				this.remove();
			});
		}
	}

	function initBoop() {
		document.addEventListener('click', function (e) {
			var el = e.target.closest && e.target.closest('[data-boop]');
			if (!el) return;
			var colors = (el.getAttribute('data-boop') || '').split(',').filter(Boolean);
			var x = e.clientX;
			var y = e.clientY;
			if (!x && !y) {
				// keyboard activation: burst from the element's centre
				var r = el.getBoundingClientRect();
				x = r.left + r.width / 2;
				y = r.top + r.height / 2;
			}
			boop(x, y, colors);
		});
	}

	/* ------------------------------------------------------------------
	   Scroll-linked: parallax + back-to-top progress ring
	   ------------------------------------------------------------------ */
	function initScroll() {
		var parallax = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));

		var btn = document.createElement('button');
		btn.className = 'pp-top';
		btn.type = 'button';
		btn.setAttribute('aria-label', 'Back to top');
		btn.innerHTML =
			'<svg class="pp-ring" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="26"/></svg>' +
			PAW.replace('<svg ', '<svg class="pp-top-paw" ');
		btn.addEventListener('click', function () {
			window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
		});
		document.body.appendChild(btn);

		var ticking = false;
		function update() {
			ticking = false;
			var max = document.documentElement.scrollHeight - window.innerHeight;
			var y = window.scrollY;
			btn.style.setProperty('--pp-progress', max > 0 ? Math.min(y / max, 1) : 0);
			btn.classList.toggle('is-visible', y > 600);
			if (reduced) return;
			var vh = window.innerHeight;
			parallax.forEach(function (el) {
				var speed = parseFloat(el.getAttribute('data-parallax')) || 0.1;
				var r = el.getBoundingClientRect();
				if (r.bottom < -200 || r.top > vh + 200) return;
				var offset = (r.top + r.height / 2 - vh / 2) * -speed;
				el.style.translate = '0 ' + offset.toFixed(1) + 'px';
			});
		}
		window.addEventListener(
			'scroll',
			function () {
				if (!ticking) {
					ticking = true;
					requestAnimationFrame(update);
				}
			},
			{ passive: true }
		);
		window.addEventListener('resize', update);
		update();
	}

	/* ------------------------------------------------------------------
	   Marquee
	   ------------------------------------------------------------------ */
	function initMarquee() {
		each('.pp-marquee', function (m) {
			var track = m.querySelector('.pp-marquee-track');
			if (!track) return;
			var items = Array.prototype.slice.call(track.children);
			items.forEach(function (item) {
				var clone = item.cloneNode(true);
				clone.setAttribute('aria-hidden', 'true');
				track.appendChild(clone);
			});
			var speed = parseFloat(m.getAttribute('data-speed') || '30');
			m.style.setProperty('--pp-marquee-duration', speed + 's');
		});
	}

	/* ------------------------------------------------------------------
	   Copy to clipboard + toast
	   ------------------------------------------------------------------ */
	var toastEl = null;
	var toastTimer = null;
	function toast(msg) {
		if (!toastEl) {
			toastEl = document.createElement('div');
			toastEl.className = 'pp-toast';
			toastEl.setAttribute('role', 'status');
			toastEl.setAttribute('aria-live', 'polite');
			document.body.appendChild(toastEl);
		}
		toastEl.textContent = msg;
		requestAnimationFrame(function () {
			toastEl.classList.add('is-visible');
		});
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () {
			toastEl.classList.remove('is-visible');
		}, 1800);
	}

	function initCopy() {
		// Non-button elements with role="button" need Enter / Space to work too.
		document.addEventListener('keydown', function (e) {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			var el = e.target.closest && e.target.closest('[data-copy][role="button"]');
			if (!el) return;
			e.preventDefault();
			el.click();
		});
		document.addEventListener('click', function (e) {
			var el = e.target.closest && e.target.closest('[data-copy]');
			if (!el) return;
			var text = el.getAttribute('data-copy');
			var done = function () {
				toast('Copied ' + text);
			};
			if (navigator.clipboard && window.isSecureContext) {
				navigator.clipboard.writeText(text).then(done, function () {
					toast(text);
				});
			} else {
				toast(text);
			}
		});
	}

	/* ------------------------------------------------------------------
	   Boot
	   ------------------------------------------------------------------ */
	function boot() {
		initCurtain();
		initMarquee();
		initReveals();
		initScroll();
		initBoop();
		initCopy();
		if (!reduced && finePointer) {
			initTilt();
			initMagnetic();
			initTrail();
		}
	}

	window.PerthPaws = { toast: toast, boop: boop };

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
