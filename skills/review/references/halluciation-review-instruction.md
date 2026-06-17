# Hallucinated Code — Detection Patterns

Optional reference for the "Hallucinated code" review dimension. Use as a checklist, not as required reading.

## Internal Patterns

| Pattern                               | Description                                              | How to Check                                          |
| ------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| Wrong method name                     | Similar but non-existent method used                     | Compare against source or type definitions            |
| Misordered parameters                 | Parameter order mismatches function signature            | Check function definition's parameter list            |
| Stale import path                     | Import not updated after refactoring                     | Verify the target path exists                         |
| Hallucinated mock                     | Mock references a non-existent dependency                | Verify the mocked object/method actually exists       |
| References to deleted/renamed symbols | References to functions/variables that no longer exist   | grep for call sites, compare with current definitions |
| Imports of non-exported symbols       | Imports of symbols never exported from the target module | Check the source module's exports                     |

## External Patterns

| Pattern                          | Description                                                      | How to Check                                            |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| Non-existent API methods         | Calls to methods that don't exist in the external library        | Compare against official docs for the installed version |
| Deprecated/removed APIs          | Usage of APIs removed in the current version                     | Check the library's changelog or migration guide        |
| Signature mismatch               | Call signatures not matching official documentation              | Compare parameter count and types against docs          |
| Assumed response structure       | Assumes specific fields in API response that differ from reality | Compare against actual API docs or type definitions     |
| Wrong config key names           | Configuration key names or formats inconsistent with tool docs   | Check external tool/platform documentation              |
| Compile-time constant assumption | Assumes specific enum values or constants exist                  | Check the enum definition or constants table            |
