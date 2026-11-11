# Recorded Deployment Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline work and parallel isolated export work where assigned.

**Goal:** Deploy the integration frontend as a usable saved-data demonstration without a backend.

**Architecture:** Python offline Result exports plus a static read-only demo API selected only by a Vite build flag. The existing dashboard and WebGL renderer consume the same Result contract as normal backend mode.

**Tech Stack:** React, Vite, Vercel, Python archipelago module.

**Spec:** docs/superpowers/specs/2026-11-05-recorded-deployment-design.md

## Constraints and review focus

No frontend scientific computation, synthetic execution, raw-log publication, main changes or backend PR changes. Keep original viewer and technical copy. Verify absent/corrupt recordings, unknown IDs, direct links and refresh, real-mode regression safety, and private-file exclusion.

## Tasks

- [x] Export both saved runs with Python module; validate Results and whitelisted metadata, retain source provenance, publish only derived artifacts.
- [x] Test then implement static demo adapter, fixed recording library, recorded configuration and honest navigation/copy; real mode unchanged.
- [x] Add deployment routing/exclusions and documentation, run full tests/build and independent review.
- [ ] Push integration branch, configure recorded mode and production source, deploy, verify live controls/pages and artifacts.

Verification before deployment: 203 JavaScript tests, 11 lineage tests and 5 exporter tests pass. Both normal and recorded builds pass. Published files validate against Python Result and frontend graph contracts; both recording workflows cover all tabs in mounted components. Independent review's unknown-ID crash and timestamp mutation were fixed with regression coverage. Upload dry run contains three recorded-result/index files and zero private source-data/environment files.

Vercel project production flag set to true. Git connection attempt was rejected by Vercel repository access, so use the existing explicit CLI deployment workflow with integration-branch provenance; do not claim automatic Git deployment is configured.
