# Changelog

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
