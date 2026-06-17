# gh pr Command Cheatsheet

## Listing and Selecting PRs

| Command                                                                                                        | Purpose                                 | Used in workflow |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------- |
| `gh pr list --limit 20 --json number,title,headRefName,baseRefName,author,createdAt,state,additions,deletions` | List open PRs with branch relationships | Step 1           |
| `gh pr view <number> --json number,title,headRefName,baseRefName,state,author,additions,deletions`             | Confirm a specific PR                   | Step 1           |

## Fetching Full Context

| Command                                                                                                                              | Purpose                            | Used in workflow |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------- |
| `gh pr view <number> --json title,body,headRefName,baseRefName,state,mergeable,additions,deletions,files,author,labels,projectItems` | Full PR details                    | Step 2           |
| `gh pr diff <number>`                                                                                                                | Get the full diff                  | Step 2           |
| `gh pr view <number> --comments`                                                                                                     | View PR with all existing comments | Step 2           |
| `gh pr view <number> --json comments`                                                                                                | Comments as structured JSON        | Step 2           |

## Posting Comments

| Command                                  | Purpose                          | Used in workflow |
| ---------------------------------------- | -------------------------------- | ---------------- |
| `gh pr comment <number> --body "<text>"` | Post one finding as a PR comment | Step 5           |

## Optional

| Command                                              | Purpose                       |
| ---------------------------------------------------- | ----------------------------- |
| `gh pr view <number> --json statusCheckRollup`       | View CI check statuses        |
| `gh pr view <number> --json reviewRequests,reviews`  | View review state             |
| `gh pr checks <number>`                              | View current CI check results |
| `gh repo view --json nameWithOwner,defaultBranchRef` | Confirm current repo context  |
| `gh auth status`                                     | Verify authentication         |
