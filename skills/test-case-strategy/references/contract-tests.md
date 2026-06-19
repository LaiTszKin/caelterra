# Contract Tests

## Purpose

- Verify that two modules or services communicate correctly at their boundary.
- Catch integration issues at the interface level before full-system testing.
- Detect breaking changes in API contracts (REST, GraphQL, gRPC, or internal module boundaries).

## Required when

- Multiple modules or services interact through defined interfaces.
- Parallel development is happening — different agents or teams own different sides of a boundary.
- External API contracts are involved.
- The cost of full integration or E2E testing is disproportionate to the risk being verified.

## Not suitable when

- The boundary is entirely internal and both sides are tested together in integration tests.
- A unit test can fully observe the behavior at both sides of the boundary.
- The interface is unstable and still under active design.

## Design rules

- Use consumer-driven contracts: the consumer defines what it expects from the provider.
- Test both happy path and expected error responses at the boundary.
- Verify request format, response shape, status codes, and error payloads.
- Use schema verification (OpenAPI, GraphQL schema, protobuf) as the first line of contract enforcement.
- Contract tests should run in CI as a required gate — a failing contract test should block merge.

## Relationship to other test levels

| Layer                  | Unit Test       | Contract Test           | Integration Test                    | E2E Test    |
| ---------------------- | --------------- | ----------------------- | ----------------------------------- | ----------- |
| Scope                  | Single function | Module/service boundary | Cross-module with real dependencies | Full system |
| Speed                  | ms              | ms-s                    | s-min                               | min         |
| Confidence in boundary | Low             | High                    | Medium                              | High        |
| Cost                   | Low             | Low-Medium              | Medium                              | High        |

In parallel development scenarios, contract tests catch virtually all integration issues before full-system testing.

## Recording

- Record `CT-xx`, boundary under test (e.g., `PaymentService ↔ InvoiceService`), contract format, provider version, consumer version, and command.
- If contract tests replace an existing integration test, document the replacement explicitly.
