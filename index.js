(function () {
	// Idempotent: remove any previous injection before re-running
	['tgif-claude-marker', 'tgif-claude-label'].forEach(function (id) {
		var el = document.getElementById(id);
		if (el) el.remove();
	});

	// Find the weekly reset paragraph: "Resets Sun 10:00 AM"
	// Session resets have "Resets in X hr Y min" — excluded by the regex below.
	var resetEl = Array.from(document.querySelectorAll('p')).find(function (p) {
		return /^Resets \w{3} \d{1,2}:\d{2} [AP]M$/.test(p.textContent.trim());
	});
	if (!resetEl) {
		alert('tgif-claude: weekly reset text not found');
		return;
	}

	// DOM path from the reset <p>:
	//   p → div.flex-col (label column) → div.flex-row (the usage row)
	var row = resetEl.parentElement.parentElement;

	// Bar container (.bg-bg-000) and fill (.bg-accent-secondary-200) live inside the row
	var barContainer = row.querySelector('.bg-bg-000');
	var fillEl = barContainer && barContainer.querySelector('.bg-accent-secondary-200');
	if (!fillEl) {
		alert('tgif-claude: progress bar elements not found');
		return;
	}

	// "Last updated: 1 minute ago" paragraph and refresh button, just below the weekly section
	var lastUpdatedEl = Array.from(document.querySelectorAll('p')).find(function (p) {
		return p.textContent.trim().startsWith('Last updated:');
	});
	var refreshBtn = document.querySelector('button[aria-label="Refresh usage limits"]');

	// Parse "Resets Sun 10:00 AM" → reset time components (constant for the lifetime of the page)
	var m = resetEl.textContent.trim().match(/Resets (\w+) (\d+):(\d+) ([AP]M)/);
	var DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	var targetDay = DAY_MAP[m[1]];
	var hour = parseInt(m[2], 10);
	var minute = parseInt(m[3], 10);
	if (m[4] === 'PM' && hour !== 12) hour += 12;
	if (m[4] === 'AM' && hour === 12) hour = 0;

	var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

	// Create marker and label once; update() mutates them on every refresh
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

		var now = new Date();
		var reset = new Date(now);
		reset.setHours(hour, minute, 0, 0);

		// Advance to the next occurrence of targetDay
		var daysUntil = (targetDay - now.getDay() + 7) % 7;
		if (daysUntil === 0 && reset <= now) daysUntil = 7; // same day but time already passed
		reset.setDate(reset.getDate() + daysUntil);

		var elapsed = WEEK_MS - (reset - now);
		var timeElapsedPct = Math.max(0, Math.min(100, (elapsed / WEEK_MS) * 100));

		var msLeft = reset - now;
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

	// Initial render
	update('init');

	// Observe the "Last updated: ..." text — it changes when fresh data arrives (periodic or manual)
	if (lastUpdatedEl) {
		var observer = new MutationObserver(function () {
			update('lastUpdated mutation');
		});
		observer.observe(lastUpdatedEl, { childList: true, subtree: true, characterData: true });
	}

})();
