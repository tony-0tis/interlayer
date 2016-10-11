#!/bin/bash
check() {
	if [ ! -f node_modules/mocha/bin/mocha ]; then
		echo "Please install mocha. Run 'sudo npm install'"
		exit 1
	fi

	if [ ! -f node_modules/.bin/istanbul ]; then
		echo "Please install istanbul. Run 'sudo npm install'"
		exit 1
	fi
}
check
TESTS=`find ./ -type f -name "test_*.js" -not -path "./node_modules/*" | sort -r`
echo "run tests $TESTS"
node_modules/.bin/istanbul cover node_modules/mocha/bin/_mocha --report lcovonly -- -R spec -t 60000 $TESTS
exit $EXIT_CODE