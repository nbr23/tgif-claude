(function () {
	function run() {
	['tgif-claude-marker', 'tgif-claude-label', 'tgif-claude-session', 'tgif-claude-weekly-at'].forEach(function (id) {
		var el = document.getElementById(id);
		if (el) el.remove();
	});

	// Detect language from <html lang="..."> attribute, default to English
	var htmlLang = (document.documentElement.getAttribute('lang') || 'en').toLowerCase().split('-')[0];

	var LANGS = {
		en: {
			detect:        /^Resets \w{3} \d{1,2}:\d{2} [AP]M$/,
			parse:         /Resets (\w+) (\d+):(\d+) ([AP]M)/,
			relative:      /^Resets in /,
			relParse:      /Resets in (?:(\d+)\s*d\s*)?(?:(\d+)\s*hr?\s*)?(?:(\d+)\s*min)?/,
			days:          { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 },
			dayNames:      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
			ampm:          true,
			startsText:    'Starts when a message is sent',
			lastUpdated:   'Last updated:',
			refreshLabel:  'Refresh usage limits',
			timeElapsed:   'Elapsed:',
			resetsIn:      'Resets in',
			overPace:      'over pace',
			underPace:     'under pace',
			ahead:         'ahead',
			behind:        'behind',
			parseError:    'tgif-claude: could not parse reset time',
			notFound:      'tgif-claude: weekly reset text not found',
			weeklyHeading: 'Weekly limits',
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
			lastUpdated:   'Dernière mise à jour :',
			refreshLabel:  'Actualiser les limites d\'utilisation',
			timeElapsed:   '\u00c9coul\u00e9\u00a0:',
			resetsIn:      'R\u00e9init. dans',
			overPace:      'en avance',
			underPace:     'en retard',
			ahead:         'd\'avance',
			behind:        'de retard',
			parseError:    'tgif-claude : impossible de lire l\u2019heure de réinitialisation',
			notFound:      'tgif-claude : texte de réinitialisation hebdomadaire introuvable',
			weeklyHeading: 'Limites hebdomadaires',
		},
	};

	var lang = LANGS[htmlLang] || LANGS.en;

	// Find the "Weekly limits" heading, then scope all searches to its container
	var weeklyHeading = Array.from(document.querySelectorAll('h2')).find(function (h) {
		return h.textContent.trim() === lang.weeklyHeading;
	});
	var weeklySection = weeklyHeading && weeklyHeading.closest('.space-y-6');
	if (!weeklySection) weeklySection = weeklyHeading && weeklyHeading.parentElement && weeklyHeading.parentElement.parentElement;
	if (!weeklySection) { alert(lang.notFound); return; }

	var weeklyPs = Array.from(weeklySection.querySelectorAll('p'));

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
			var waitObserver = new MutationObserver(function () {
				waitObserver.disconnect();
				run();
			});
			waitObserver.observe(weeklySection, { childList: true, subtree: true, characterData: true });
			return;
		}
		alert(lang.notFound);
		return;
	}

	var row = resetEl.parentElement.parentElement;

	var barContainer = row.querySelector('.bg-bg-000');
	var fillEl = barContainer && barContainer.querySelector('.bg-accent-200');
	if (!fillEl) return;

	var lastUpdatedEl = Array.from(document.querySelectorAll('p')).find(function (p) {
		return p.textContent.trim().startsWith(lang.lastUpdated);
	});
	var refreshBtn = document.querySelector('button[aria-label="' + lang.refreshLabel + '"]');

	var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

	function updateSession() {
		var existing = document.getElementById('tgif-claude-session');
		if (existing) existing.remove();
		var lel = Array.from(document.querySelectorAll('p')).find(function (p) {
			return p.textContent.trim() === 'Current session';
		});
		var sel = lel && Array.from(
			lel.parentElement.parentElement.querySelectorAll('p')
		).find(function (p) {
			return lang.relative.test(p.textContent.trim());
		});
		if (!sel) return;
		var m = sel.textContent.trim().match(lang.relParse);
		if (!m) return;
		var sd = parseInt(m[1], 10) || 0;
		var sh = parseInt(m[2], 10) || 0;
		var sm = parseInt(m[3], 10) || 0;
		var ms = ((sd * 24 + sh) * 60 + sm) * 60 * 1000;
		var resetAt = new Date(Date.now() + ms);
		resetAt.setMinutes(Math.round(resetAt.getMinutes() / 10) * 10, 0, 0);
		var rh = resetAt.getHours();
		var rmm = resetAt.getMinutes();
		var rampm = rh >= 12 ? 'PM' : 'AM';
		rh = rh % 12 || 12;
		var rmmStr = (rmm < 10 ? '0' : '') + rmm;
		var span = document.createElement('span');
		span.id = 'tgif-claude-session';
		span.textContent = ' (at ' + rh + ':' + rmmStr + ' ' + rampm + ')';
		sel.appendChild(span);
	}

	function updateWeeklyAt(msLeft) {
		var existing = document.getElementById('tgif-claude-weekly-at');
		if (existing) existing.remove();
		if (!lang.relative.test(resetEl.textContent.trim())) return;
		var resetAt = new Date(Date.now() + msLeft);
		if (resetAt.getMinutes() >= 30) resetAt.setHours(resetAt.getHours() + 1);
		resetAt.setMinutes(0, 0, 0);
		var day = lang.dayNames[resetAt.getDay()];
		var rh = resetAt.getHours();
		var mm = '00';
		var timeStr;
		if (lang.ampm) {
			var rampm = rh >= 12 ? 'PM' : 'AM';
			rh = rh % 12 || 12;
			timeStr = day + ' ' + rh + ':' + mm + ' ' + rampm;
		} else {
			timeStr = day + ' ' + rh + ':' + mm;
		}
		var span = document.createElement('span');
		span.id = 'tgif-claude-weekly-at';
		span.textContent = ' (at ' + timeStr + ')';
		resetEl.appendChild(span);
	}

	function parseMsLeft() {
		var text = resetEl.textContent.trim();

		var abs = text.match(lang.parse);
		if (abs) {
			var targetDay = lang.days[abs[1]];
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

		var rel = text.match(lang.relParse);
		if (rel) {
			var d = parseInt(rel[1], 10) || 0;
			var h = parseInt(rel[2], 10) || 0;
			var m = parseInt(rel[3], 10) || 0;
			return ((d * 24 + h) * 60 + m) * 60 * 1000;
		}

		return null;
	}

	barContainer.style.position = 'relative';

	var marker = document.createElement('div');
	marker.id = 'tgif-claude-marker';
	marker.style.cssText =
		'position:absolute;top:0;height:100%;width:3px;' +
		'background:#f97316;pointer-events:none;border-radius:1px;';
	barContainer.appendChild(marker);

	var tooltip = document.createElement('div');
	tooltip.style.cssText =
		'position:fixed;display:none;pointer-events:none;' +
		'background:#1e1e2e;color:#fff;font-size:11px;padding:3px 7px;' +
		'border-radius:4px;white-space:nowrap;z-index:9999;';
	var tooltipText = document.createElement('span');
	tooltip.appendChild(tooltipText);
	var tooltipArrow = document.createElement('div');
	tooltipArrow.style.cssText =
		'position:absolute;left:50%;transform:translateX(-50%);top:100%;' +
		'border:5px solid transparent;border-top-color:#fff;';
	tooltip.appendChild(tooltipArrow);
	document.body.appendChild(tooltip);

	var weekStartMs = 0;

	function formatTooltipTime(date) {
		var day = lang.dayNames[date.getDay()];
		var h = date.getHours();
		var m = date.getMinutes();
		var mm = (m < 10 ? '0' : '') + m;
		if (lang.ampm) {
			var suffix = h >= 12 ? ' PM' : ' AM';
			h = h % 12 || 12;
			return day + ' ' + h + ':' + mm + suffix;
		}
		return day + ' ' + h + ':' + mm;
	}

	barContainer.addEventListener('mousemove', function (e) {
		if (!weekStartMs) return;
		var rect = barContainer.getBoundingClientRect();
		var x = e.clientX - rect.left;
		var pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
		var time = new Date(weekStartMs + (pct / 100) * WEEK_MS);
		tooltipText.textContent = formatTooltipTime(time);
		tooltip.style.display = 'block';
		var ttLeft = e.clientX - (tooltip.offsetWidth / 2);
		tooltip.style.left = ttLeft + 'px';
		tooltip.style.top = (rect.top - tooltip.offsetHeight - 8) + 'px';
	});

	barContainer.addEventListener('mouseleave', function () {
		tooltip.style.display = 'none';
	});

	var label = document.createElement('div');
	label.id = 'tgif-claude-label';
	label.className = resetEl.className;
	label.style.marginTop = '4px';
	row.insertAdjacentElement('afterend', label);

	function update(reason) {
		var usagePct = parseFloat(fillEl.style.width) || 0;

		var msLeft = parseMsLeft();
		if (msLeft === null) {
			label.textContent = lang.parseError;
			return;
		}

		weekStartMs = Date.now() + msLeft - WEEK_MS;

		var timeElapsedPct = Math.max(0, Math.min(100, ((WEEK_MS - msLeft) / WEEK_MS) * 100));

		var daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));
		var hoursLeft = Math.floor((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
		var minsLeft = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
		var remainingParts = [];
		if (daysLeft > 0) remainingParts.push(daysLeft + 'd');
		if (hoursLeft > 0 || daysLeft > 0) remainingParts.push(hoursLeft + 'h');
		remainingParts.push(minsLeft + 'm');
		var remainingStr = remainingParts.join(' ');

		var delta = usagePct - timeElapsedPct;
		var overPace = delta > 0;
		var statusColor = overPace ? '#dc2626' : '#16a34a';
		var statusText = overPace ? lang.overPace : lang.underPace;

		var usageTime = formatTooltipTime(new Date(weekStartMs + (usagePct / 100) * WEEK_MS));
		var deltaMs = Math.abs(delta) / 100 * WEEK_MS;
		var deltaDays = Math.floor(deltaMs / (24 * 60 * 60 * 1000));
		var deltaHours = Math.floor((deltaMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
		var deltaMins = Math.floor((deltaMs % (60 * 60 * 1000)) / (60 * 1000));
		var deltaParts = [];
		if (deltaDays > 0) deltaParts.push(deltaDays + 'd');
		if (deltaHours > 0 || deltaDays > 0) deltaParts.push(deltaHours + 'h');
		deltaParts.push(deltaMins + 'm');
		var deltaTimeStr = deltaParts.join(' ') + ' ' + (overPace ? lang.ahead : lang.behind);

		console.log('[tgif-claude] usage=' + usagePct + '% elapsed=' + timeElapsedPct.toFixed(1) + '% delta=' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%');

		updateSession();
		updateWeeklyAt(msLeft);
		marker.style.left = timeElapsedPct.toFixed(2) + '%';
		label.innerHTML =
			lang.timeElapsed + ' <b>' + timeElapsedPct.toFixed(1) + '%</b>' +
			' | ' + lang.resetsIn + ' <b>' + remainingStr + '</b>' +
			'<br>' +
			'Delta: <b style="color:' + statusColor + '">' +
			(delta >= 0 ? '+' : '') + delta.toFixed(1) + '% \u2014 ' + deltaTimeStr + '</b>' +
			' <span style="opacity:0.7">(\u2248 ' + usageTime + ')</span>';
	}

	update('init');

	if (lastUpdatedEl) {
		var observer = new MutationObserver(function () {
			update('lastUpdated mutation');
		});
		observer.observe(lastUpdatedEl, { childList: true, subtree: true, characterData: true });
	}

	} run();
})();
