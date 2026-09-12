(function () {
	var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
	var SESSION_MS = 5 * 60 * 60 * 1000;
	var DAY_MS = 24 * 60 * 60 * 1000;
	var HOUR_MS = 60 * 60 * 1000;
	var MIN_MS = 60 * 1000;

	function teardown() {
		var prev = window.__tgif;
		if (prev) {
			(prev.intervals || []).forEach(clearInterval);
			(prev.observers || []).forEach(function (o) { o.disconnect(); });
		}
		window.__tgif = { intervals: [], observers: [] };
		Array.from(document.querySelectorAll('[data-tgif]')).forEach(function (el) {
			el.remove();
		});
	}

	function track(kind, value) {
		window.__tgif[kind].push(value);
		return value;
	}

	function roundToHour(date) {
		if (date.getMinutes() >= 30) date.setHours(date.getHours() + 1);
		date.setMinutes(0, 0, 0);
		return date;
	}

	function roundToTenMinutes(date) {
		date.setMinutes(Math.round(date.getMinutes() / 10) * 10, 0, 0);
		return date;
	}

	function formatClockTime(lang, date) {
		var h = date.getHours();
		var m = date.getMinutes();
		var mm = (m < 10 ? '0' : '') + m;
		if (lang.ampm) {
			return (h % 12 || 12) + ':' + mm + (h >= 12 ? ' PM' : ' AM');
		}
		return h + ':' + mm;
	}

	function formatTooltipTime(lang, date) {
		return lang.dayNames[date.getDay()] + ' ' + formatClockTime(lang, date);
	}

	function formatDuration(ms) {
		var days = Math.floor(ms / DAY_MS);
		var hours = Math.floor((ms % DAY_MS) / HOUR_MS);
		var mins = Math.floor((ms % HOUR_MS) / MIN_MS);
		var parts = [];
		if (days > 0) parts.push(days + 'd');
		if (hours > 0 || days > 0) parts.push(hours + 'h');
		parts.push(mins + 'm');
		return parts.join(' ');
	}

	function parseRelative(text, relParse) {
		var m = text.match(relParse);
		if (!m) return null;
		var d = parseInt(m[1], 10) || 0;
		var h = parseInt(m[2], 10) || 0;
		var mi = parseInt(m[3], 10) || 0;
		return ((d * 24 + h) * 60 + mi) * MIN_MS;
	}

	function textNodes(root) {
		return Array.from(root.querySelectorAll('p, span, div'));
	}

	function findByText(root, text) {
		return textNodes(root).find(function (el) {
			return el.textContent.trim() === text;
		});
	}

	function createMarker() {
		var marker = document.createElement('div');
		marker.dataset.tgif = 'marker';
		marker.style.cssText =
			'position:absolute;top:0;height:100%;width:3px;' +
			'background:#f97316;pointer-events:none;border-radius:1px;';
		return marker;
	}

	function createTooltip() {
		var tooltip = document.createElement('div');
		tooltip.dataset.tgif = 'tooltip';
		tooltip.style.cssText =
			'position:fixed;display:none;pointer-events:none;' +
			'background:#1e1e2e;color:#fff;font-size:11px;padding:3px 7px;' +
			'border-radius:4px;white-space:nowrap;z-index:9999;';
		var text = document.createElement('span');
		tooltip.appendChild(text);
		var arrow = document.createElement('div');
		arrow.style.cssText =
			'position:absolute;left:50%;transform:translateX(-50%);top:100%;' +
			'border:5px solid transparent;border-top-color:#fff;';
		tooltip.appendChild(arrow);
		document.body.appendChild(tooltip);
		return { el: tooltip, text: text };
	}

	function attachHoverTooltip(bar, getState, lang) {
		var tooltip = createTooltip();
		bar.addEventListener('mousemove', function (e) {
			var state = getState();
			if (!state) return;
			var rect = bar.getBoundingClientRect();
			var pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
			if (state.inverted) pct = 100 - pct;
			var time = new Date(state.windowStartMs + (pct / 100) * state.windowMs);
			tooltip.text.textContent = formatTooltipTime(lang, time);
			tooltip.el.style.display = 'block';
			tooltip.el.style.left = (e.clientX - (tooltip.el.offsetWidth / 2)) + 'px';
			tooltip.el.style.top = (rect.top - tooltip.el.offsetHeight - 8) + 'px';
		});
		bar.addEventListener('mouseleave', function () {
			tooltip.el.style.display = 'none';
		});
	}

	function renderPace(lang, label, opts) {
		var usagePct = opts.usagePct;
		var elapsedPct = Math.max(0, Math.min(100, ((opts.windowMs - opts.msLeft) / opts.windowMs) * 100));
		var windowStartMs = Date.now() + opts.msLeft - opts.windowMs;

		var delta = usagePct - elapsedPct;
		var overPace = delta > 0;
		var statusColor = overPace ? '#dc2626' : '#16a34a';
		var usageTime = formatTooltipTime(lang, new Date(windowStartMs + (usagePct / 100) * opts.windowMs));
		var deltaTimeStr = formatDuration(Math.abs(delta) / 100 * opts.windowMs) +
			' ' + (overPace ? lang.ahead : lang.behind);

		if (opts.marker) {
			opts.marker.style.left = (opts.inverted ? 100 - elapsedPct : elapsedPct).toFixed(2) + '%';
		}

		label.innerHTML =
			lang.timeElapsed + ' <b>' + elapsedPct.toFixed(1) + '%</b>' +
			' | ' + lang.resetsIn + ' <b>' + formatDuration(opts.msLeft) + '</b>' +
			'<br>' +
			'Delta: <b style="color:' + statusColor + '">' +
			(delta >= 0 ? '+' : '') + delta.toFixed(1) + '% — ' + deltaTimeStr + '</b>' +
			' <span style="opacity:0.7">(≈ ' + usageTime + ')</span>';

		return { windowStartMs: windowStartMs, windowMs: opts.windowMs, inverted: opts.inverted };
	}

	var CLAUDE_LANGS = {
		en: {
			detect:        /^Resets \w+ \d{1,2}:\d{2} [AP]M$/,
			parse:         /Resets (\w+) (\d+):(\d+) ([AP]M)/,
			relative:      /^Resets in /,
			relParse:      /Resets in (?:(\d+)\s*d\s*)?(?:(\d+)\s*hr?\s*)?(?:(\d+)\s*min)?/,
			days:          { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 },
			dayNames:      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
			ampm:          true,
			startsText:    'Starts when a message is sent',
			wouldEndAt:    'would end at',
			ifStartedNow:  'if started now',
			lastUpdated:   'Last updated:',
			sessionText:   'Current session',
			timeElapsed:   'Elapsed:',
			resetsIn:      'Resets in',
			overPace:      'over pace',
			underPace:     'under pace',
			ahead:         'ahead',
			behind:        'behind',
			parseError:    'tgif-claude: could not parse reset time',
			notFound:      'tgif-claude: weekly reset text not found',
			weeklyHeading: 'Weekly limits',
			weeklyText:    'This week',
		},
		fr: {
			detect:        /^Réinitialisation \w{3}\. \d{1,2}:\d{2}$/,
			parse:         /Réinitialisation (\w+)\. (\d+):(\d+)/,
			relative:      /^Réinitialisation dans /,
			relParse:      /Réinitialisation dans (?:(\d+)\s*j\s*)?(?:(\d+)\s*h\s*)?(?:(\d+)\s*min)?/,
			days:          { dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6 },
			dayNames:      ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'],
			ampm:          false,
			startsText:    'Commence quand un message est envoyé',
			wouldEndAt:    'se terminerait à',
			ifStartedNow:  'si démarrée maintenant',
			lastUpdated:   'Dernière mise à jour :',
			sessionText:   'Session actuelle',
			timeElapsed:   'Écoulé :',
			resetsIn:      'Réinit. dans',
			overPace:      'en avance',
			underPace:     'en retard',
			ahead:         'd\'avance',
			behind:        'de retard',
			parseError:    'tgif-claude : impossible de lire l’heure de réinitialisation',
			notFound:      'tgif-claude : texte de réinitialisation hebdomadaire introuvable',
			weeklyHeading: 'Limites hebdomadaires',
			weeklyText:    'Cette semaine',
		},
	};

	function runClaude() {
		var htmlLang = (document.documentElement.getAttribute('lang') || 'en').toLowerCase().split('-')[0];
		var lang = CLAUDE_LANGS[htmlLang] || CLAUDE_LANGS.en;

		var BAR_SELECTOR = '[role="meter"], [role="progressbar"]';

		// The row is whichever ancestor of the label also holds the usage bar
		function findRow(el) {
			var node = el.parentElement;
			while (node && !node.querySelector(BAR_SELECTOR)) node = node.parentElement;
			return node;
		}

		var weeklyLabel = findByText(document, lang.weeklyText);
		var weeklySection = weeklyLabel && findRow(weeklyLabel);
		if (!weeklySection) {
			var weeklyHeading = Array.from(document.querySelectorAll('h2, h3')).find(function (h) {
				return h.textContent.trim() === lang.weeklyHeading;
			});
			weeklySection = weeklyHeading && (weeklyHeading.closest('section') || weeklyHeading.closest('.space-y-6'));
			if (!weeklySection) weeklySection = weeklyHeading && weeklyHeading.parentElement && weeklyHeading.parentElement.parentElement;
		}
		if (!weeklySection) { alert(lang.notFound); return; }

		var dialog = weeklySection.closest('[role="dialog"]');
		if (dialog) {
			dialog.style.maxWidth = 'none';
			dialog.style.maxHeight = 'none';
			dialog.style.width = '100vw';
			dialog.style.height = '100vh';
			dialog.style.inset = '0';
			dialog.style.margin = '0';
			dialog.style.borderRadius = '0';
		}

		var weeklyPs = Array.from(weeklySection.querySelectorAll('p, span'));

		var resetEl = weeklyPs.find(function (p) {
			return lang.detect.test(p.textContent.trim());
		});
		if (!resetEl) {
			resetEl = weeklyPs.find(function (p) {
				return lang.relative.test(p.textContent.trim());
			});
		}
		if (!resetEl) {
			var startsEl = weeklyPs.find(function (p) {
				return p.textContent.trim() === lang.startsText;
			});
			if (startsEl) {
				var weeklyEndAt = roundToHour(new Date(Date.now() + WEEK_MS));
				var startsSpan = document.createElement('span');
				startsSpan.dataset.tgif = 'weekly-starts';
				startsSpan.textContent = ' (' + lang.wouldEndAt + ' ' + formatTooltipTime(lang, weeklyEndAt) + ' ' + lang.ifStartedNow + ')';
				startsEl.appendChild(startsSpan);
				var waitObserver = track('observers', new MutationObserver(function () {
					waitObserver.disconnect();
					runClaude();
				}));
				waitObserver.observe(weeklySection, { childList: true, subtree: true, characterData: true });
				return;
			}
			alert(lang.notFound);
			return;
		}

		var row = findRow(resetEl);
		var barContainer = row && row.querySelector(BAR_SELECTOR);
		if (!barContainer) return;

		var lastUpdatedEl = Array.from(document.querySelectorAll('p, span')).find(function (p) {
			return p.textContent.trim().startsWith(lang.lastUpdated);
		});

		function readUsagePct(bar) {
			var valueNow = bar.getAttribute('aria-valuenow');
			if (valueNow !== null && valueNow !== '') return parseFloat(valueNow) || 0;
			var fill = bar.querySelector('[style*="width"]') || bar.firstElementChild;
			return (fill && parseFloat(fill.style.width)) || 0;
		}

		function updateSession() {
			var existing = document.querySelector('[data-tgif="session"]');
			if (existing) existing.remove();
			var lel = Array.from(document.querySelectorAll('p, span')).find(function (p) {
				return p.textContent.trim() === lang.sessionText;
			});
			if (!lel) return;
			var sessionRow = findRow(lel);
			if (!sessionRow) return;
			var els = Array.from(sessionRow.querySelectorAll('p, span'));

			var span = document.createElement('span');
			span.dataset.tgif = 'session';

			var sel = els.find(function (p) {
				return lang.relative.test(p.textContent.trim());
			});
			if (sel) {
				var ms = parseRelative(sel.textContent.trim(), lang.relParse);
				if (ms === null) return;
				var resetAt = roundToTenMinutes(new Date(Date.now() + ms));
				span.textContent = ' (at ' + formatClockTime(lang, resetAt) + ')';
				sel.appendChild(span);
				return;
			}

			var startsEl = els.find(function (p) {
				return p.textContent.trim() === lang.startsText;
			});
			if (!startsEl) return;
			var endAt = roundToTenMinutes(new Date(Date.now() + SESSION_MS));
			span.textContent = ' (' + lang.wouldEndAt + ' ' + formatClockTime(lang, endAt) + ' ' + lang.ifStartedNow + ')';
			startsEl.appendChild(span);
		}

		function updateWeeklyAt(msLeft) {
			var existing = document.querySelector('[data-tgif="weekly-at"]');
			if (existing) existing.remove();
			if (!lang.relative.test(resetEl.textContent.trim())) return;
			var resetAt = roundToHour(new Date(Date.now() + msLeft));
			var span = document.createElement('span');
			span.dataset.tgif = 'weekly-at';
			span.textContent = ' (at ' + formatTooltipTime(lang, resetAt) + ')';
			resetEl.appendChild(span);
		}

		function parseMsLeft() {
			var text = resetEl.textContent.trim();

			var abs = text.match(lang.parse);
			if (abs) {
				var targetDay = lang.days[abs[1].slice(0, 3)];
				if (targetDay === undefined) return null;
				var hour = parseInt(abs[2], 10);
				var minute = parseInt(abs[3], 10);
				if (lang.ampm) {
					if (abs[4] === 'PM' && hour !== 12) hour += 12;
					if (abs[4] === 'AM' && hour === 12) hour = 0;
				}

				var now = new Date();
				var reset = new Date(now);
				reset.setHours(hour, minute, 0, 0);
				var daysUntil = (targetDay - now.getDay() + 7) % 7;
				if (daysUntil === 0 && reset <= now) daysUntil = 7;
				reset.setDate(reset.getDate() + daysUntil);
				return reset - now;
			}

			return parseRelative(text, lang.relParse);
		}

		barContainer.style.position = 'relative';

		var marker = createMarker();
		barContainer.appendChild(marker);

		var hoverState = null;
		attachHoverTooltip(barContainer, function () { return hoverState; }, lang);

		var label = document.createElement('div');
		label.dataset.tgif = 'label';
		label.className = resetEl.className;
		label.style.width = '100%';
		label.style.whiteSpace = 'normal';
		row.appendChild(label);

		function update() {
			var usagePct = readUsagePct(barContainer);

			var msLeft = parseMsLeft();
			if (msLeft === null) {
				if (resetEl.textContent.trim() === lang.startsText) {
					teardown();
					runClaude();
					return;
				}
				label.textContent = lang.parseError;
				return;
			}

			updateSession();
			updateWeeklyAt(msLeft);
			hoverState = renderPace(lang, label, {
				usagePct: usagePct,
				windowMs: WEEK_MS,
				msLeft: msLeft,
				marker: marker,
				inverted: false,
			});
		}

		update();

		if (lastUpdatedEl) {
			var observer = track('observers', new MutationObserver(update));
			observer.observe(lastUpdatedEl, { childList: true, subtree: true, characterData: true });
		}
	}

	var CHATGPT_LANG = {
		relative:     /^Resets in\b/,
		relParse:     /Resets in\s*(?:(\d+)\s*d\s*)?(?:(\d+)\s*h\s*)?(?:(\d+)\s*m)?/,
		pctLeft:      /^(\d+(?:\.\d+)?)%\s+left$/,
		dayNames:     ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
		ampm:         true,
		planLimits:   'Plan limits',
		sessionText:  '5-hour limit',
		weeklyText:   'Weekly limit',
		wouldEndAt:   'would end at',
		ifStartedNow: 'if started now',
		timeElapsed:  'Elapsed:',
		resetsIn:     'Resets in',
		ahead:        'ahead',
		behind:       'behind',
		notFound:     'tgif-claude: usage panel not found — open Settings, then Usage',
	};

	function runChatgpt() {
		var lang = CHATGPT_LANG;

		function findFill(root) {
			return Array.from(root.querySelectorAll('[style*="width"]')).find(function (el) {
				return /%$/.test((el.style.width || '').trim());
			});
		}

		function findBar(root) {
			var fill = findFill(root);
			return fill && fill.parentElement;
		}

		function findRow(el) {
			var node = el.parentElement;
			while (node && !findBar(node)) node = node.parentElement;
			return node;
		}

		function unclamp(from, upTo) {
			var node = from;
			while (node) {
				var computed = getComputedStyle(node);
				if (computed.maxWidth !== 'none') node.style.maxWidth = 'none';
				if (computed.maxHeight !== 'none') node.style.maxHeight = 'none';
				if (node === upTo) break;
				node = node.parentElement;
			}
		}

		var panel = document.querySelector('[role="tabpanel"][aria-labelledby$="trigger-Usage"]:not([hidden])');
		var planLimitsEl = findByText(panel || document, lang.planLimits);
		var sessionLabel = findByText(panel || document, lang.sessionText);
		var weeklyLabel = findByText(panel || document, lang.weeklyText);
		if (!sessionLabel && !weeklyLabel) { alert(lang.notFound); return; }

		var card = findRow(sessionLabel || weeklyLabel);
		if (card) card = card.parentElement;

		var dialog = (planLimitsEl || sessionLabel || weeklyLabel).closest('[role="dialog"]');
		if (dialog) {
			dialog.style.cssText += ';position:fixed;inset:0;margin:0;width:100vw;height:100vh;' +
				'max-width:none;max-height:none;border-radius:0;transform:none;translate:none;';
			unclamp(card || panel, dialog);
		}

		function readUsagePct(row, bar) {
			var pctEl = textNodes(row).find(function (el) {
				return lang.pctLeft.test(el.textContent.trim());
			});
			if (pctEl) return 100 - parseFloat(pctEl.textContent.trim().match(lang.pctLeft)[1]);
			var fill = bar && findFill(bar);
			return fill ? 100 - parseFloat(fill.style.width) : 0;
		}

		function readMsLeft(row) {
			var button = row.querySelector('button[aria-label]');
			var text = button && lang.relative.test(button.getAttribute('aria-label').trim())
				? button.getAttribute('aria-label').trim()
				: (textNodes(row).find(function (el) {
					return lang.relative.test(el.textContent.trim());
				}) || {}).textContent;
			return text ? parseRelative(text.trim(), lang.relParse) : null;
		}

		function setup(labelEl, windowMs, weekly) {
			var row = labelEl && findRow(labelEl);
			var bar = row && findBar(row);
			if (!bar) return null;

			bar.style.position = 'relative';
			bar.style.overflow = 'visible';

			var marker = createMarker();
			marker.style.top = '-4px';
			marker.style.height = 'calc(100% + 8px)';
			bar.appendChild(marker);

			var pctEl = textNodes(row).find(function (el) {
				return lang.pctLeft.test(el.textContent.trim());
			});
			var label = document.createElement('div');
			label.dataset.tgif = 'label';
			if (pctEl) label.className = pctEl.className;
			label.style.width = '100%';
			label.style.whiteSpace = 'normal';
			label.style.textAlign = 'start';
			row.appendChild(label);

			var ctx = {
				row: row, bar: bar, marker: marker, label: label,
				windowMs: windowMs, weekly: weekly, hoverState: null,
			};
			attachHoverTooltip(bar, function () { return ctx.hoverState; }, lang);
			return ctx;
		}

		function annotateResetAt(ctx, msLeft) {
			var button = ctx.row.querySelector('button[aria-label]');
			var anchor = button ? button.parentElement : null;
			if (!anchor) return;
			var span = document.createElement('span');
			span.dataset.tgif = 'reset-at';
			var at = ctx.weekly
				? formatTooltipTime(lang, roundToHour(new Date(Date.now() + msLeft)))
				: formatClockTime(lang, roundToTenMinutes(new Date(Date.now() + msLeft)));
			span.textContent = ' (at ' + at + ')';
			anchor.appendChild(span);
		}

		function updateCtx(ctx) {
			Array.from(ctx.row.querySelectorAll('[data-tgif="reset-at"]')).forEach(function (el) {
				el.remove();
			});

			var msLeft = readMsLeft(ctx.row);
			if (msLeft === null) {
				ctx.marker.style.display = 'none';
				ctx.hoverState = null;
				var endAt = ctx.weekly
					? formatTooltipTime(lang, roundToHour(new Date(Date.now() + ctx.windowMs)))
					: formatClockTime(lang, roundToTenMinutes(new Date(Date.now() + ctx.windowMs)));
				ctx.label.textContent = lang.wouldEndAt + ' ' + endAt + ' ' + lang.ifStartedNow;
				return;
			}

			ctx.marker.style.display = '';
			annotateResetAt(ctx, msLeft);
			ctx.hoverState = renderPace(lang, ctx.label, {
				usagePct: readUsagePct(ctx.row, ctx.bar),
				windowMs: ctx.windowMs,
				msLeft: msLeft,
				marker: ctx.marker,
				inverted: true,
			});
		}

		var contexts = [
			setup(sessionLabel, SESSION_MS, false),
			setup(weeklyLabel, WEEK_MS, true),
		].filter(Boolean);
		if (!contexts.length) { alert(lang.notFound); return; }

		var observer = null;

		function update() {
			if (observer) observer.disconnect();
			contexts.forEach(updateCtx);
			if (observer && card) {
				observer.observe(card, { childList: true, subtree: true, characterData: true });
			}
		}

		update();

		// ChatGPT exposes no "Last updated" node, so the countdown has to self-tick
		track('intervals', setInterval(update, 30000));
		if (card) {
			observer = track('observers', new MutationObserver(update));
			observer.observe(card, { childList: true, subtree: true, characterData: true });
		}
	}

	teardown();

	var host = location.hostname;
	if (/(^|\.)claude\.ai$/.test(host)) {
		runClaude();
	} else if (/(^|\.)(chatgpt\.com|openai\.com)$/.test(host)) {
		runChatgpt();
	} else if (document.getElementById('modal-settings')) {
		runChatgpt();
	} else {
		runClaude();
	}
})();
