# Module Boundary Adjustment (T3) — Patterns

Changes that affect a module's public API, data contract, or cross-module coupling.
Requires dedicated test coverage — define test strategy in CHECKLIST.md before implementing.

## Extract Module from God Module

A large module containing >2 distinct responsibilities is split along ownership or lifecycle boundaries.

```yaml
Before:
  module: "order-service"
  responsibilities: [payment, fulfillment, notification, audit]

After:
  module: "order-service"
    responsibilities: [order lifecycle, payment orchestration]
  module: "fulfillment-service"
    responsibilities: [inventory check, shipping, tracking]
  module: "notification-service"
    responsibilities: [email, SMS, push for order events]
```

**Verification**:

- Integration tests confirm cross-module interactions still produce the same business outcomes
- Each new module has independent test coverage for its internal logic
- Contracts between modules (events, data types) are versioned or explicit

## Change to Cross-Module Data Contract

Modifying the shape of data passed between modules — a field added, renamed, removed, or changed type.

```typescript
// Contract: events/order-fulfilled.ts
// Before:
interface OrderFulfilled {
  orderId: string;
  trackingNumber: string;
  carrier: string;
}

// After:
interface OrderFulfilled {
  orderId: string;
  trackingNumber: string;
  carrier: 'fedex' | 'ups' | 'usps'; // narrowed from string
  estimatedDelivery?: string; // added optional field
}
```

**Test obligations**:

- Producer publishes all required fields
- Consumer handles the new optional field gracefully (absence = backward compatible)
- Consumer reject messages for invalid carrier values

## Remodeling Invariant Enforcement

An invariant previously enforced at the database or UI layer must move to the application module boundary.

| Scenario                            | Approach                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------- |
| DB constraint moved to application  | Add validation in service layer; dual-run until migration verified        |
| UI-only validation promoted to API  | Add middleware guard; test both valid and invalid input                   |
| Soft enforcement → hard enforcement | Roll out with logging first, then error-throwing after observation period |

## Public API Signature Change

A module's exported function, class, or type changes in a way that requires all callers to update.

```typescript
// Before:
export function createUser(name: string, email: string, role: string): User;

// After:
export function createUser(params: CreateUserParams): User;
// where CreateUserParams = { name: string; email: string; role: Role };
```

**Migration strategy** (choose one and document):

1. **Deprecate-and-copy**: Old function marked `@deprecated` → new function added → callers migrate one by one → old function removed after N cycles
2. **Shim layer**: A thin adapter maps new interface to old, or old to new, during a transition window
3. **Flag gate**: Both implementations coexist behind a feature flag; toggle after callers are confirmed updated

## Module-to-Event Boundary

A direct RPC call between two modules migrates to event-driven communication.

```typescript
// Before: synchronous RPC
// fulfillment.ts
const notification = new NotificationService();
notification.sendEmail(order.userEmail, 'Shipped');

// After: event-driven
// fulfillment.ts
events.publish({ type: 'order.shipped', data: { orderId, userEmail } });
// notification service subscribes to 'order.shipped' independently
```

**Test obligations**:

- Integration test: publish event → assert subscriber executes expected side-effect
- Contract test: event schema is agreed between publisher and subscriber
- Resilience test: subscriber failure does not affect publisher health

## Interface Extraction

A class's public methods become an explicit interface to decouple callers from implementation.

```typescript
// Before:
export class PaymentGateway {
  async charge(amount: number, token: string) { ... }
}

// After:
export interface PaymentProvider {
  charge(amount: number, token: string): Promise<PaymentResult>;
}
export class StripeGateway implements PaymentProvider { ... }
export class FakeGateway implements PaymentProvider { ... }  // for tests
```

**Verification**:

- Unit tests pass against `FakeGateway`
- Integration tests cover `StripeGateway` against sandbox
- Existing callers are updated to depend on the interface, not the class
