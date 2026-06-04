#!/usr/bin/env bash
# Split test runner — isolates mock.module tests from the rest to avoid
# a Node.js 24.x test runner IPC deserialization issue that can make
# tests flaky when --experimental-test-module-mocks is active globally.
# See: https://github.com/nodejs/node/issues (test_runner IPC clone)

EXIT=0

# When COVERAGE=true, Group 1 runs with --experimental-test-coverage flags.
# packages/tools/eval 排除在涵蓋率測量之外：該工具已明確標示為 refactoring 範圍外。
# 其他工具由 test/tools/ 測試檔案驗證，測試涵蓋率直接反映在總覽數字中。
GROUP1_FLAGS=""
if [ "${COVERAGE:-}" = "true" ]; then
  GROUP1_FLAGS="--experimental-test-coverage --test-coverage-lines=65 --test-coverage-branches=60 --test-coverage-functions=65 --test-coverage-exclude=packages/tools/eval/**"
fi

run_test_group() {
  local label="$1"
  shift
  echo ""
  echo "==> $label"
  if "$@"; then
    echo "    PASS"
  else
    echo "    FAIL"
    EXIT=1
  fi
}

# Group 1: stable non-mock tests (test/)
run_test_group "Stable tests (test/)" \
  node $GROUP1_FLAGS --test 'test/**/*.test.js'

# Group 2: package .test.js files that do NOT need mock.module
EXCLUDE='(cmd-init|cmd-list-apis|cmd-survey)'
PACKAGE_TEST_FILES=$(find packages -name '*.test.js' -not -path '*/node_modules/*' | grep -v -E "$EXCLUDE" | sort | tr '\n' ' ')
run_test_group "Package tests (no mock.module)" \
  node $GROUP1_FLAGS --test $PACKAGE_TEST_FILES

# Group 3: mock-dependent tests — isolated with --experimental-test-module-mocks
run_test_group "Package tests (mock.module)" \
  node --experimental-test-module-mocks --test \
    'packages/tools/codegraph/dist/lib/cmd-init.test.js' \
    'packages/tools/codegraph/dist/lib/cmd-list-apis.test.js' \
    'packages/tools/codegraph/dist/lib/cmd-survey.test.js'

exit $EXIT
