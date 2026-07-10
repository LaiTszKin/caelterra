# Deprecated Packages

This repository was formerly the `@laitszkin/apollo-toolkit` npm package (v0.2.0 - v5.3.2).

It has been **repurposed** into the **Caelterra** Hermes plugin for team standardisation.

## Deprecation Instructions

If you have access to publish to the `@laitszkin/apollo-toolkit` npm package, deprecate it:

```bash
npm deprecate @laitszkin/apollo-toolkit \
  "This package has been deprecated. The repository is now Caelterra — a Hermes plugin for team standardisation. See https://github.com/LaiTszKin/caelterra"
```

To deprecate specific versions:

```bash
npm deprecate @laitszkin/apollo-toolkit@"<6.0.0" \
  "Apollo Toolkit has been replaced by Caelterra Hermes plugin. See https://github.com/LaiTszKin/caelterra"
```
