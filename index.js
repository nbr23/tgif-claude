(function () {
	['tgif-claude-marker', 'tgif-claude-label'].forEach(function (id) {
		var el = document.getElementById(id);
		if (el) el.remove();
	});

	var weeklyH2 = Array.from(document.querySelectorAll('h2')).find(function (h2) {
		return h2.textContent.trim() === 'Weekly limits';
	});
	if (!weeklyH2) {
		alert('tgif-claude: "Weekly limits" heading not found');
		return;
	}

	var section = weeklyH2.parentElement.parentElement;
	var ABSOLUTE_RE = /^Resets \w{3} \d{1,2}:\d{2} [AP]M$/;
	var RELATIVE_RE = /^Resets in /;

	var resetEl = Array.from(section.querySelectorAll('p')).find(function (p) {
		var t = p.textContent.trim();
		return ABSOLUTE_RE.test(t) || RELATIVE_RE.test(t);
	});
	if (!resetEl) {
		alert('tgif-claude: weekly reset text not found');
		return;
	}

	var row = resetEl.parentElement.parentElement;

	var barContainer = row.querySelector('.bg-bg-000');
	var fillEl = barContainer && barContainer.querySelector('.bg-accent-secondary-200');
	if (!fillEl) {
		alert('tgif-claude: progress bar elements not found');
		return;
	}

	var lastUpdatedEl = Array.from(document.querySelectorAll('p')).find(function (p) {
		return p.textContent.trim().startsWith('Last updated:');
	});
	var refreshBtn = document.querySelector('button[aria-label="Refresh usage limits"]');

	var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
	var DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

	function parseMsLeft() {
		var text = resetEl.textContent.trim();

		var abs = text.match(/Resets (\w+) (\d+):(\d+) ([AP]M)/);
		if (abs) {
			var targetDay = DAY_MAP[abs[1]];
			var hour = parseInt(abs[2], 10);
			var minute = parseInt(abs[3], 10);
			if (abs[4] === 'PM' && hour !== 12) hour += 12;
			if (abs[4] === 'AM' && hour === 12) hour = 0;

			var now = new Date();
			var reset = new Date(now);
			reset.setHours(hour, minute, 0, 0);
			var daysUntil = (targetDay - now.getDay() + 7) % 7;
			if (daysUntil === 0 && reset <= now) daysUntil = 7;
			reset.setDate(reset.getDate() + daysUntil);
			return reset - now;
		}

		var rel = text.match(/Resets in (?:(\d+)\s*d\s*)?(?:(\d+)\s*hr?\s*)?(?:(\d+)\s*min)?/);
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
			label.textContent = 'tgif-claude: could not parse reset time';
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
		var statusText = overPace ? 'over pace' : 'under pace';

		console.log('[tgif-claude] usage=' + usagePct + '% elapsed=' + timeElapsedPct.toFixed(1) + '% delta=' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%');

		marker.style.left = timeElapsedPct.toFixed(2) + '%';
		label.innerHTML =
			'Time elapsed: <b>' + timeElapsedPct.toFixed(1) + '%</b>' +
			' | Resets in: <b>' + remainingStr + '</b>' +
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

})();
