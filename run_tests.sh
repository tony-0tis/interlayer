#!/bin/bash
check() {
	if [ ! -x node_modules/.bin/mocha ]; then
		echo "Please install mocha. Run 'npm install'"
		exit 1
	fi

	if [ ! -f node_modules/.bin/nyc ]; then
		echo "Please install nyc. Run 'sudo npm install'"
		exit 1
	fi
}
check
echo "run tests"
node_modules/.bin/nyc --reporter=text-summary --reporter=lcov node_modules/.bin/mocha --exit 'test/**/test_*.js'
exit $?