# Changelog

## [1.10.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.9.0...modus-v1.10.0) (2026-03-30)


### ✨ Features

* **bot,web:** use modal for poll creation and hide ticket metadata from footer text ([25197a9](https://github.com/MyndPhreak/MODUS/commit/25197a9d86cc2ff647f1fac19e26e71e21a1cb62))


### 🐛 Bug Fixes

* **bot:** improve web search error handling and surface actionable messages ([19c2c0e](https://github.com/MyndPhreak/MODUS/commit/19c2c0ebb2e5a0bd06d46d716045c25a90a3db80))

## [1.9.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.8.0...modus-v1.9.0) (2026-03-24)


### ✨ Features

* **bot:** add web search tool to AI module via SearXNG ([53dffae](https://github.com/MyndPhreak/MODUS/commit/53dffaeeafe1ad0c6a06f008df71a1c0804c72bb))


### 🐛 Bug Fixes

* **bot:** call toJSON() on recording command builder ([d007ce5](https://github.com/MyndPhreak/MODUS/commit/d007ce514f649a9536f48d6d7ffbec1237da3646))
* **bot:** prefer flat key lookup in webhook placeholder resolution ([fd9ed0d](https://github.com/MyndPhreak/MODUS/commit/fd9ed0d082eeff48eac8544c81482c104ee8d25a))
* **bot:** reorder required poll options before optional ones in command builder ([c8243a2](https://github.com/MyndPhreak/MODUS/commit/c8243a2b89abb58a2224651990dc281f313f1e66))
* **web:** use #shared alias for fonts import to fix Nitro server bundle resolution ([9613ae9](https://github.com/MyndPhreak/MODUS/commit/9613ae92b3f145415b4d9edeaf536134ba3f6fb1))


### ♻️ Refactors

* **bot:** simplify defer reply logic in ModuleManager ([eb12eb7](https://github.com/MyndPhreak/MODUS/commit/eb12eb700ec8d8411f9d85d3a367fef7e775a4c5))

## [1.8.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.7.2...modus-v1.8.0) (2026-03-24)


### ✨ Features

* **bot:** add anti-raid module with join velocity detection ([2bf0104](https://github.com/MyndPhreak/MODUS/commit/2bf01040231399518420be1979cf592ec50a07dc))
* **bot:** add multi-type ticketing system with transcripts ([2cdaa14](https://github.com/MyndPhreak/MODUS/commit/2cdaa14531695875bac666461b5d889c9b0edf33))
* **bot:** add polls module with Discord native polls ([caa37b7](https://github.com/MyndPhreak/MODUS/commit/caa37b728b36ed8730501836b13bcb0a538fdb88))
* **bot:** add reaction roles module with button and dropdown panels ([587751c](https://github.com/MyndPhreak/MODUS/commit/587751ce5d6555ad14624863f40e248b5c2a7e81))
* **bot:** add server events module for scheduled events ([91cc54c](https://github.com/MyndPhreak/MODUS/commit/91cc54ca0c51810ec529e1037026002ea5ed5cc4))
* **bot:** add shared discord utilities library ([2713cc4](https://github.com/MyndPhreak/MODUS/commit/2713cc4dd520940f48108ffc107858ef9063232d))
* **bot:** add social alerts module with Twitch EventSub integration ([1cd6d9e](https://github.com/MyndPhreak/MODUS/commit/1cd6d9e06089b966989ecdbe27bbd9733dde9b6b))
* **bot:** add verification module with customizable gate ([06f1abe](https://github.com/MyndPhreak/MODUS/commit/06f1abe6c9a8546a751b575cce49760b5024b7ce))
* **bot:** extend module manager with dynamic registration and schemas ([cc53662](https://github.com/MyndPhreak/MODUS/commit/cc53662b65fd677424b5ee1d7646aa72912e06b2))
* **bot:** offload welcome image rendering to dashboard API ([185b198](https://github.com/MyndPhreak/MODUS/commit/185b19896cb5f8bb3ebd887eec6ce97e378b913a))
* **web:** add Google Fonts picker and UX improvements to welcome editor ([09347d2](https://github.com/MyndPhreak/MODUS/commit/09347d222f21dcea2529bb8c91615765bc524778))
* **web:** add server-side welcome image render API with Google Fonts ([06e0bcb](https://github.com/MyndPhreak/MODUS/commit/06e0bcb9942f2a42e84987284f0cd68d09f401fb))
* **web:** add webhook trigger proxy route and botWebhookUrl runtime config ([2e17c14](https://github.com/MyndPhreak/MODUS/commit/2e17c142dd8ca741fce22a29f5c095a7807a1d09))
* **webhooks:** Improve embeds for github webhooks ([2046afe](https://github.com/MyndPhreak/MODUS/commit/2046afe9ffefca90f847cc5027b7af30b551ed94))
* **web:** move dashboard pages under /dashboard/ route ([640337c](https://github.com/MyndPhreak/MODUS/commit/640337c8bc5f65ad8a914109fe6a47586424de22))
* **web:** redesign landing page with hero, features, and stats sections ([97e7f0b](https://github.com/MyndPhreak/MODUS/commit/97e7f0b57ce8bd33cc774ada11ca55e2e4912d2e))


### 🐛 Bug Fixes

* **bot:** improve webhook trigger handler with split not-found and disabled guards ([bb94aa8](https://github.com/MyndPhreak/MODUS/commit/bb94aa8da1e4c3430937e53dfbca09804bd8beee))
* **music:** resolve bass-heavy audio ducking via FFmpeg reconnect flags and Opus format ([9c8f0ad](https://github.com/MyndPhreak/MODUS/commit/9c8f0ade8d19923f6998928e40fb3203da800637))


### ♻️ Refactors

* **bot:** improve existing modules with schema validation and consistency ([0b51c39](https://github.com/MyndPhreak/MODUS/commit/0b51c391fce2285f2c49b300563dac6a8149844c))
* **web:** update module dashboard pages with UFormField consistency ([f891992](https://github.com/MyndPhreak/MODUS/commit/f8919928fca0446dfc8789529cc34fb59fd08343))


### 📖 Documentation

* **web:** update privacy policy and terms of service ([68493bb](https://github.com/MyndPhreak/MODUS/commit/68493bba992b70c9ff9fe94c25e4524d6ecf023f))

## [1.7.2](https://github.com/MyndPhreak/MODUS/compare/modus-v1.7.1...modus-v1.7.2) (2026-03-05)


### 🐛 Bug Fixes

* **docker:** copy built node_modules from builder to preserve youtubei.js dist ([e4b88c9](https://github.com/MyndPhreak/MODUS/commit/e4b88c95597bcc8771dcb37c26ecdffdc74ac4e4))

## [1.7.1](https://github.com/MyndPhreak/MODUS/compare/modus-v1.7.0...modus-v1.7.1) (2026-03-05)


### 🐛 Bug Fixes

* **docker:** copy patches directory alongside manifest before running pnpm install ([538d33d](https://github.com/MyndPhreak/MODUS/commit/538d33d6f83902d46fc2abd69e418410c8e28c25))

## [1.7.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.6.2...modus-v1.7.0) (2026-03-05)


### ✨ Features

* **bot:** add button interaction support to ModuleManager ([300b167](https://github.com/MyndPhreak/MODUS/commit/300b1679fdc71f731fa7048290bf501c403e7a3c))
* **bot:** add multitrack recording with premium gating ([e635144](https://github.com/MyndPhreak/MODUS/commit/e6351440379332543b1d2fe7569560698fde3f4d))
* **bot:** add music playback buttons, clear effects, and Spotify improvements ([359eaf6](https://github.com/MyndPhreak/MODUS/commit/359eaf62c2087ac5ce3936a126504e7764a14da6))
* **bot:** add triggers module with webhook router, slash commands, and Appwrite schema ([cc81f66](https://github.com/MyndPhreak/MODUS/commit/cc81f66267da8042067e91e23c5ff080dd01ccfc))
* **bot:** add Zod settings validation with schemas for all modules ([85df870](https://github.com/MyndPhreak/MODUS/commit/85df87089e1b4fcd3d0d8d410da7ff5d559233e1))
* **web:** add triggers dashboard page with CRUD API routes ([39b5363](https://github.com/MyndPhreak/MODUS/commit/39b53637fb2c24fb4502506040af70e69fc8291d))


### ♻️ Refactors

* **bot:** migrate all modules to Zod-validated settings ([251e2a6](https://github.com/MyndPhreak/MODUS/commit/251e2a6d9f70e44e816650071a2d82001fcfac05))

## [1.6.2](https://github.com/MyndPhreak/MODUS/compare/modus-v1.6.1...modus-v1.6.2) (2026-03-05)


### 🐛 Bug Fixes

* **bot:** resolve Spotify playback hangs via yt-dlp bridge and discord-player update ([1646953](https://github.com/MyndPhreak/MODUS/commit/164695317c70981f0f67bb0f5a54eb5c05e74c47))

## [1.6.1](https://github.com/MyndPhreak/MODUS/compare/modus-v1.6.0...modus-v1.6.1) (2026-02-22)


### 🐛 Bug Fixes

* **auth:** add handler to properly fetch user providerAccessToken ([b2dc586](https://github.com/MyndPhreak/MODUS/commit/b2dc586bcbb520b82c8668b9c10335ebbb934065))

## [1.6.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.5.0...modus-v1.6.0) (2026-02-22)


### ✨ Features

* **bot:** add temporary voice channels module with join-to-create lobbies ([ae7cf2a](https://github.com/MyndPhreak/MODUS/commit/ae7cf2ac7b5727a20e901364a64319c43ca67722))
* **web:** add server admin join flow with Discord permission validation ([2d2b4f3](https://github.com/MyndPhreak/MODUS/commit/2d2b4f3df350602e03ed46ede23af246807c635b))
* **web:** add zero-flash auth gate to prevent dashboard flash on load ([6d50e09](https://github.com/MyndPhreak/MODUS/commit/6d50e09f55317ba8ed49b758db05ea6cd8587ede))


### 🐛 Bug Fixes

* **auth:** get discord guilds ([1a07b4b](https://github.com/MyndPhreak/MODUS/commit/1a07b4be35318a819debbfa9792a3920eba4498c))
* **web:** fix Discord OAuth token persistence and identity fallback in auth callback ([0231b7c](https://github.com/MyndPhreak/MODUS/commit/0231b7c3896bcd275df27f1f65a60f6dc3970183))
* **web:** harden Discord /me and /guilds API endpoints with identity store fallback ([f9b2e14](https://github.com/MyndPhreak/MODUS/commit/f9b2e14305554b796144932b16320fe71a2feb84))


### ♻️ Refactors

* **web:** deduplicate concurrent fetchUserSession calls to prevent Discord 429s ([f78a33e](https://github.com/MyndPhreak/MODUS/commit/f78a33e06920a5ca5a37b9c3da1c9863f03a9776))

## [1.5.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.4.1...modus-v1.5.0) (2026-02-21)


### ✨ Features

* **bot:** add speech segment tracking and start offset to recordings ([38ff116](https://github.com/MyndPhreak/MODUS/commit/38ff116b12b9ebc1dca5ea48688d935394349e80))
* **web:** add segment-aware waveform rendering and timeline-based playback ([6ce7ef5](https://github.com/MyndPhreak/MODUS/commit/6ce7ef5cf0b5b770e2eba64715987da3202cdf0c))


### 🐛 Bug Fixes

* **web:** fix server visibility query and cookie cleanup on logout ([855459c](https://github.com/MyndPhreak/MODUS/commit/855459ccd8a5ff4569edb736f2a48f3cd83db966))

## [1.4.1](https://github.com/MyndPhreak/MODUS/compare/modus-v1.4.0...modus-v1.4.1) (2026-02-21)


### 🐛 Bug Fixes

* harden server queries and add backfill for legacy ownerId field ([6a4fe90](https://github.com/MyndPhreak/MODUS/commit/6a4fe90c15970591c78cc3b12584c83850a42093))

## [1.4.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.3.0...modus-v1.4.0) (2026-02-21)


### ✨ Features

* **bot:** add admin_user_ids field and indexes to servers collection ([b85d3cb](https://github.com/MyndPhreak/MODUS/commit/b85d3cbd2bf229ebb62c7088bf964c1f9a009efb))
* **web:** support multi-admin server management with owner and admin queries ([3b2da88](https://github.com/MyndPhreak/MODUS/commit/3b2da8847f987a850ba126276ac417b13ef1cf02))


### 🐛 Bug Fixes

* **api:** remove bot-token guild fallback to prevent cross-user data leakage ([b7f198b](https://github.com/MyndPhreak/MODUS/commit/b7f198b894d6495f6194e6f770f81793b5b6d073))

## [1.3.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.2.0...modus-v1.3.0) (2026-02-20)


### ✨ Features

* **bot:** add tags, audit logging, AI context memory, and settings cache ([0b6b77d](https://github.com/MyndPhreak/MODUS/commit/0b6b77d530fcefe6147011bcb068c7b5a7cec1dd))

## [1.2.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.1.1...modus-v1.2.0) (2026-02-20)


### ✨ Features

* add AI and automod modules with web dashboard integration ([39e718a](https://github.com/MyndPhreak/MODUS/commit/39e718aaded86266bfb8e16985468882ed29becc))

## [1.1.1](https://github.com/MyndPhreak/MODUS/compare/modus-v1.1.0...modus-v1.1.1) (2026-02-19)


### 🐛 Bug Fixes

* **bot:** update version number on restart ([7b794cb](https://github.com/MyndPhreak/MODUS/commit/7b794cbb6ed14c0093d37d16d1bf27344b9b045a))

## [1.1.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.0.0...modus-v1.1.0) (2026-02-19)


### ✨ Features

* add milestones module, music WebSocket API, recording UI overhaul, and auth improvements ([f67c588](https://github.com/MyndPhreak/MODUS/commit/f67c588aa38ebba27e1e6322e9f9573c61df16f9))
* add moderation ([61720b1](https://github.com/MyndPhreak/MODUS/commit/61720b1902da910e5579e480ecc74ff6c52ba84f))
* add settings page for each module ([61720b1](https://github.com/MyndPhreak/MODUS/commit/61720b1902da910e5579e480ecc74ff6c52ba84f))
* initial commit ([28a5b57](https://github.com/MyndPhreak/MODUS/commit/28a5b576ccd3e0c4a238655e2c2b7ae7cbdd2e2c))
* more music effects ([1ab217e](https://github.com/MyndPhreak/MODUS/commit/1ab217eb2129156d3f01f2b4e8be14f0ab2cf692))
* pre-queue storage migration, recording announce clips, music improvements, and legal pages ([b32f583](https://github.com/MyndPhreak/MODUS/commit/b32f5832bd794f64b1913cf8df0959e742b18708))
* **recording:** add voice channel recording module ([6390ff7](https://github.com/MyndPhreak/MODUS/commit/6390ff73c06b5e98bf63362abfc6c9791a08d6ce))


### 🐛 Bug Fixes

* add --ignore-scripts to prod install (youtubei.js postinstall needs npm) ([5eb1305](https://github.com/MyndPhreak/MODUS/commit/5eb1305945659ac5605df47bb4c1bf57d026a5f1))
* include guild_id in server status update payload ([b0f3de0](https://github.com/MyndPhreak/MODUS/commit/b0f3de0870663fd32f7c367ff23ddc9223c6014a))
