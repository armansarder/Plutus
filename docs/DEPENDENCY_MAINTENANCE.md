# V2 dependency maintenance

Production-only npm audit originally found Vite/Zod high advisories and 18 moderate
Photon dependency findings. Updated Vite to 8.1.6 and Zod to 4.6.7, and migrated
the shared JSON client's generic type to Zod 4. Existing strict schema/regression
tests were retained. Photon keeps its existing SDK version (now explicitly pinned
12.15.0) and uses `@opentelemetry/core=2.12.0` via a narrow override rather than
npm's suggested major downgrade. SDK imports and TypeScript pass without calling
Spectrum initialization, enrolling anyone, or sending a message.

Both `npm audit --omit=dev --json` runs returned zero vulnerabilities afterward.
This is point-in-time package advisory coverage, not a complete security guarantee,
not a development-dependency audit, and not evidence of working live delivery.

References: [Vite advisory and patched releases](https://github.com/advisories/GHSA-587h-7wmj-h5pm),
[Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[Zod migration guide](https://zod.dev/v4/changelog),
[OpenTelemetry remediation](https://github.com/open-telemetry/opentelemetry-js/security/advisories/GHSA-8988-4f7v-96qf).
