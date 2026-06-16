#!/usr/bin/env bash
# Split test runner — isolates mock.module tests from the rest to avoid
# a Node.js 24.x test runner IPC deserialization issue that can make
# tests flaky when --experimental-test-module-mocks is active globally.
# See: https://github.com/nodejs/node/issues (test_runner IPC clone)
#
# Coverage enforcement (COVERAGE=true):
#   Per-group line/branch/function thresholds are checked immediately after
#   each group.  Combined coverage = weighted average of Groups 1+2.  Group 3
#   (codegraph mock.module tests) excluded due to Node.js incompatible flags.
#   Combined weighted coverage (Groups 1 + 2) is enforced after all groups
#   finish.
#
# Limitations:
#   - Split-process: Each group runs in a separate node process, so there is
#     no single coverage report.  The combined estimate is a file-weighted
#     average of per-group results.
#   - Group 3 (mock.module): Excluded from coverage enforcement due to
#     --experimental-test-module-mocks incompatibility with v8 coverage.
#   - Windows glob: The test/**/*.test.js glob uses forward slashes.
#     In CI (shell: bash) this works correctly via Git Bash.
#     For direct cmd.exe/PowerShell invocation, use backslash globs instead.

EXIT=0

# Coverage tracking globals (populated when COVERAGE=true)
G1_PCT=0
G1_FILES=0
G2_PCT=0
G2_FILES=0

# Use TMPDIR, TEMP, or /tmp as fallback for platforms without mktemp
RUN_TEST_LOG="${TMPDIR:-${TEMP:-/tmp}}/test-run-$$.log"

# Extract a pipe-delimited column from the "all files" coverage summary line,
# stripping whitespace and trailing '%'.
# Columns: (1) file | (2) line % | (3) branch % | (4) funcs % | (5) uncovered lines
_cov_col() {
  local col="$1" text="$2"
  echo "$text" | grep "all files" | awk -F'|' -v c="$col" '{
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $c)
    gsub(/%/, "", $c)
    print $c
  }'
}

# Count the number of individual file entries in a coverage table
# (lines with numeric coverage data before "all files", excluding the header).
_cov_file_count() {
  echo "$1" | awk -F'|' '
    /^ℹ all files/{exit}
    /^ℹ file .* line %/{next}
    $2 ~ /[0-9]/{c++}
    END{print c}
  '
}

run_test_group() {
  local label="$1"
  shift
  echo ""
  echo "==> $label"
  "$@" 2>&1 | tee -a "$RUN_TEST_LOG"
  local group_exit=${PIPESTATUS[0]}
  if [ "$group_exit" -eq 0 ]; then
    echo "    PASS"
  else
    echo "    FAIL"
    EXIT=1
  fi
}

# Like run_test_group but executes via "node --experimental-test-coverage"
# and enforces per-group threshold checks.  Stores line percentage and file
# count in the named global variables for later combined-weight computation.
# Usage: run_coverage_group label line_thr branch_thr func_thr pct_var files_var node_args...
# Note: do NOT include "node" in node_args; it is prepended automatically.
run_coverage_group() {
  local label="$1" line_thr="$2" branch_thr="$3" func_thr="$4" pct_var="$5" files_var="$6"
  shift 6

  echo ""
  echo "==> $label"

  local out
  out=$(node --experimental-test-coverage "$@" 2>&1)
  local exit_code=$?
  echo "$out"

  if [ $exit_code -ne 0 ]; then
    echo "    FAIL (tests failed)"
    EXIT=1
    return 1
  fi

  local line_pct branch_pct func_pct file_count
  line_pct=$(_cov_col 2 "$out")
  branch_pct=$(_cov_col 3 "$out")
  func_pct=$(_cov_col 4 "$out")
  file_count=$(_cov_file_count "$out")

  if [ -z "$line_pct" ]; then
    echo "    FAIL (no coverage data)"
    EXIT=1
    return 1
  fi

  # Store for combined-weight computation (even when thresholds fail)
  eval "$pct_var=\$line_pct"
  eval "$files_var=\$file_count"

  local fail=0
  [ "$(echo "$line_pct < $line_thr" | bc -l 2>/dev/null)" = "1" ] && fail=1
  [ "$(echo "$branch_pct < $branch_thr" | bc -l 2>/dev/null)" = "1" ] && fail=1
  [ "$(echo "$func_pct < $func_thr" | bc -l 2>/dev/null)" = "1" ] && fail=1

  if [ "$fail" = "1" ]; then
    echo "    FAIL (lines=${line_pct}% branches=${branch_pct}% funcs=${func_pct}%)"
    EXIT=1
    return 1
  fi

  echo "    PASS (lines=${line_pct}% branches=${branch_pct}% funcs=${func_pct}%)"
}


# Group 1 test file list (excludes mock.module-dependent tests that require
# --experimental-test-module-mocks, which are run separately in Group 3).
CLI_TEST_FILES=$(find test -name '*.test.js' -not -name 'auto-update-cli-wiring.test.js' | sort | tr '\n' ' ')

# Group 2 test file list (shared between coverage and non-coverage paths)
EXCLUDE='(cmd-init|cmd-list-apis|cmd-survey|eval)'
PACKAGE_TEST_FILES=$(find packages -name '*.test.js' -not -path '*/node_modules/*' | grep -v -E "$EXCLUDE" | sort | tr '\n' ' ')

if [ "$COVERAGE" = "true" ]; then
  # Group 1: stable non-mock tests (test/) — coverage with thresholds
  run_coverage_group "Stable tests (test/)" 75 60 65 G1_PCT G1_FILES \
    --test $CLI_TEST_FILES

  # Group 2: package tests (no mock.module) — coverage with thresholds
  run_coverage_group "Package tests (no mock.module)" 65 60 65 G2_PCT G2_FILES \
    --test $PACKAGE_TEST_FILES
else
  # Group 1: stable non-mock tests (test/)
  run_test_group "Stable tests (test/)" \
    node --test $CLI_TEST_FILES

  # Group 2: package .test.js files that do NOT need mock.module
  run_test_group "Package tests (no mock.module)" \
    node --test $PACKAGE_TEST_FILES
fi

# Group 3: mock-dependent tests — isolated with --experimental-test-module-mocks
# Always runs the same way (excluded from coverage enforcement).
run_test_group "Package tests (mock.module)" \
  node --experimental-test-module-mocks --test \
    'packages/tools/codegraph/dist/lib/cmd-init.test.js' \
    'packages/tools/codegraph/dist/lib/cmd-list-apis.test.js' \
    'packages/tools/codegraph/dist/lib/cmd-survey.test.js' \
    'test/cli/auto-update-cli-wiring.test.js'

# Combined weighted coverage enforcement (Groups 1 + 2 only)
if [ "$COVERAGE" = "true" ]; then
  total_files=$((G1_FILES + G2_FILES))
  if [ "$total_files" -gt 0 ]; then
    combined_pct=$(echo "scale=2; ($G1_PCT * $G1_FILES + $G2_PCT * $G2_FILES) / $total_files" | bc -l)
    echo ""
    echo "==> Combined coverage (G1+G2, file-weighted): ${combined_pct}%"
    if [ "$(echo "$combined_pct < 80" | bc -l)" = "1" ]; then
      echo "    FAIL (combined coverage ${combined_pct}% < 80%)"
      EXIT=1
    else
      echo "    PASS (combined coverage ${combined_pct}% >= 80%)"
    fi
  fi
fi

rm -f "$RUN_TEST_LOG"

exit $EXIT
