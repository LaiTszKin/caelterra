## Features (Functional Modules)

Features are user-facing functional modules, e.g.:

- Login feature
- Registration feature
- Invitation code feature

Features are realized through the cooperation and interaction of submodules.

Features correspond to the **Container** level of the C4 model: high-level functional boundaries representing independently deployable or identifiable system capabilities.

## Submodules

Submodules are the key building blocks of a feature. Their boundaries are defined by the code's implementation boundaries.

Submodules correspond to the **Component** level of the C4 model: internal implementation units within a feature (e.g., controllers, services, repositories).

## C4 Model Level Mapping

| C4 Level       | Corresponding Concept            | Purpose                                          |
| -------------- | -------------------------------- | ------------------------------------------------ |
| System Context | Overall system + external actors | Define system boundary and external dependencies |
| Container      | Feature (functional module)      | High-level functional boundary                   |
| Component      | Submodule (implementation unit)  | Internal implementation units                    |
| Code           | Function level                   | Function-level details (selective)               |
