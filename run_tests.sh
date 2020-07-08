#!/bin/bash
check() {
	if [ ! -f node_modules/mocha/bin/mocha ]; then
		echo "Please install mocha. Run 'sudo npm install'"
		exit 1
	fi

	if [ ! -f node_modules/.bin/nyc ]; then
		echo "Please install nyc. Run 'sudo npm install'"
		exit 1
	fi
}
check
echo "run tests"
node_modules/.bin/nyc --reporter=text-summary --reporter=lcov node_modules/.bin/mocha --recursive --exit
exit $EXIT_CODE