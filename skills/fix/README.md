# Solve Issues Found During Review

Fix issues discovered during a review pass, proceeding from the highest-severity finding down to the lowest, until all confirmed issues are resolved.

## Usage

```
$fix
```

Provide a review report (from `review-change-set`, `review`, `review-codebases`, `discover-edge-cases`, `discover-security-issues`, or any structured review) and this skill will:

1. Read and prioritize all findings by severity
2. Fix each finding from Critical down to Low
3. Validate each fix before proceeding
4. Re-validate the full scope when all fixes are complete
