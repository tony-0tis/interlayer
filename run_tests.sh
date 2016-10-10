#!/bin/bash
check() {
	if [ ! -f node_modules/.bin/mocha ]; then
		echo "Please install  mocha. Run 'sudo npm install'"
		exit 1
	fi
}
check
TESTS=`find ./ -type f -name "test_*.js" | sort -r`
echo "run tests $TESTS"
node_modules/.bin/mocha  --bail --timeout 60000 $TESTS
exit $EXIT_CODE