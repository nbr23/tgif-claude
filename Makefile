SHELL := /bin/bash

build:
	@url=$$(node build.js); \
	echo "$$url"; \
	if command -v pbcopy > /dev/null 2>&1; then \
		printf '%s' "$$url" | pbcopy; \
		echo "(copied to clipboard)"; \
	elif command -v xclip > /dev/null 2>&1 && [ -n "$$DISPLAY" ]; then \
		printf '%s' "$$url" | xclip -selection clipboard; \
		echo "(copied to clipboard)"; \
	fi

dist:
	node build.js > bookmarklet.js
