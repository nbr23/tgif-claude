(function () {
	function run() {
	['tgif-claude-marker', 'tgif-claude-label'].forEach(function (id) {
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
			ampm:          true,
			startsText:    'Starts when a message is sent',
			lastUpdated:   'Last updated:',
			refreshLabel:  'Refresh usage limits',
			timeElapsed:   'Time elapsed:',
			resetsIn:      'Resets in:',
			overPace:      'over pace',
			underPace:     'under pace',
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
			ampm:          false,
			startsText:    'Commence quand un message est envoyé',
			lastUpdated:   'Dernière mise à jour :',
			refreshLabel:  'Actualiser les limites d\'utilisation',
			timeElapsed:   'Temps \u00e9coul\u00e9\u00a0:',
			resetsIn:      'R\u00e9initialisation dans\u00a0:',
			overPace:      'en avance',
			underPace:     'en retard',
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

		console.log('[tgif-claude] usage=' + usagePct + '% elapsed=' + timeElapsedPct.toFixed(1) + '% delta=' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%');

		marker.style.left = timeElapsedPct.toFixed(2) + '%';
		label.innerHTML =
			lang.timeElapsed + ' <b>' + timeElapsedPct.toFixed(1) + '%</b>' +
			' | ' + lang.resetsIn + ' <b>' + remainingStr + '</b>' +
			' | Delta: <b style="color:' + statusColor + '">' +
			(delta >= 0 ? '+' : '') + delta.toFixed(1) + '% (' + statusText + ')</b>';
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
