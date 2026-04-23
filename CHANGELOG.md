# Changelog

## [1.13.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.12.0...modus-v1.13.0) (2026-04-23)


### ✨ Features

* **bot:** resolve user/role/channel mentions when snapshotting tickets ([4c37a98](https://github.com/MyndPhreak/MODUS/commit/4c37a984a0740809bcba399d2920aedf9946d65a))
* **db:** add mentions lookup column to ticket_transcripts ([50cd7f1](https://github.com/MyndPhreak/MODUS/commit/50cd7f11b994be2e0d2f55c59aad3642acb40de8))
* **web:** render resolved names in ticket transcripts ([7ae705c](https://github.com/MyndPhreak/MODUS/commit/7ae705cc59a64d6c37a7c93d98565802486d8f82))


### 🐛 Bug Fixes

* **bot:** avoid blocking on Postgres for skipDefer enablement check ([d78e4c8](https://github.com/MyndPhreak/MODUS/commit/d78e4c8172a80492d32e38d9f5a79f091f4c09f9))
* **bot:** fix routing for module commands ([71c9b50](https://github.com/MyndPhreak/MODUS/commit/71c9b50ec68921b9af0e22c4529eceed2a14086e))
* **bot:** resolve modal submission error for /poll create command ([c6ca8ee](https://github.com/MyndPhreak/MODUS/commit/c6ca8eeb6a84987b2390fccbe9e94f0c9c9de231))


### 📖 Documentation

* replace Appwrite references with Postgres/R2/Redis stack ([6cf2f49](https://github.com/MyndPhreak/MODUS/commit/6cf2f4926f4adf53811ff0cdf45ac12b2d31f06a))

## [1.12.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.11.0...modus-v1.12.0) (2026-04-23)


### ✨ Features

* **api:** accept is_template and description on tag create/update ([b357e52](https://github.com/MyndPhreak/MODUS/commit/b357e52361d1368bcd4bacde48777a91eda993ad))
* **api:** add server endpoints backing the client-side decommission ([c9f3d34](https://github.com/MyndPhreak/MODUS/commit/c9f3d3454d49dac6df84ca7f7957ae5a2eb32613))
* **api:** add voice preview endpoint for recording TTS picker ([cffd569](https://github.com/MyndPhreak/MODUS/commit/cffd569af1cdea0f2e46a7def1e701b50c949fcc))
* **api:** gated ticket transcript read endpoint ([3f74909](https://github.com/MyndPhreak/MODUS/commit/3f74909b236ac742ecabac60906569bb4bc2d040))
* **api:** list recent ticket transcripts for guild admins ([f875855](https://github.com/MyndPhreak/MODUS/commit/f875855950293cf304603badc85170cb3a62c34e))
* **api:** migrate welcome image backgrounds to R2 ([d4fd325](https://github.com/MyndPhreak/MODUS/commit/d4fd325d16a02303c658cabe68f90dbd079dc0e2))
* **api:** native Discord OAuth endpoints behind NUXT_USE_NATIVE_AUTH ([1e41636](https://github.com/MyndPhreak/MODUS/commit/1e41636bbda697c80a8ddfa0df2b8c4db30d06d7))
* **api:** Nitro SSE bridge for dashboard realtime ([0e64d79](https://github.com/MyndPhreak/MODUS/commit/0e64d7974df6e01cd5a35bde600c760badbda05b))
* **api:** route discord + servers endpoints through native session ([0cbe74c](https://github.com/MyndPhreak/MODUS/commit/0cbe74c68f154c8e3ba966303d3c0803105b8233))
* **api:** route servers endpoints through Postgres ([f7f73a6](https://github.com/MyndPhreak/MODUS/commit/f7f73a6d8086b79d20e71169fee483a84bb573cb))
* **api:** route tags, triggers, AI usage, and stats through Postgres ([bb7f2af](https://github.com/MyndPhreak/MODUS/commit/bb7f2af7b57ed547366470917476f42071724eb3))
* **api:** route web recording endpoints through Postgres when enabled ([80587fb](https://github.com/MyndPhreak/MODUS/commit/80587fbc69dbd7e9234cdbde0a2e31e5207b9827))
* **api:** serve recordings via presigned R2 URLs when enabled ([2b9e911](https://github.com/MyndPhreak/MODUS/commit/2b9e91196246dcfb44621504b1f8662c54134d7c))
* **api:** session helpers for native Discord OAuth + auth guards ([a41324e](https://github.com/MyndPhreak/MODUS/commit/a41324e260266075f3865867d1ade8881c2b1d31))
* **api:** unified repo accessor for Nitro endpoints ([b87af18](https://github.com/MyndPhreak/MODUS/commit/b87af18f2979a7e88812c0962787ed1e126b0548))
* **bot:** add Kokoro TTS library and /say command ([af6e58b](https://github.com/MyndPhreak/MODUS/commit/af6e58b0868ab3aab3a67402c80972593720c1f9))
* **bot:** add nightly recording retention worker ([c3b6f5f](https://github.com/MyndPhreak/MODUS/commit/c3b6f5fe18cbb0f4af0416492f2559c87673971d))
* **bot:** add R2 storage backend for recordings with streaming uploads ([dbc2b39](https://github.com/MyndPhreak/MODUS/commit/dbc2b391e964f76d60feb9f82fd7765f72606c29))
* **bot:** add Redis client factory and EventBus pub/sub wrapper ([377cc34](https://github.com/MyndPhreak/MODUS/commit/377cc3472526ca4a15b01858af00894acb6c0eff))
* **bot:** add ticket-transcript R2 helpers to StorageService ([b601ee6](https://github.com/MyndPhreak/MODUS/commit/b601ee6dd12a3049ec74bdfd887b081406458342))
* **bot:** add voice TTS announcement mode to recordings ([d5b435b](https://github.com/MyndPhreak/MODUS/commit/d5b435b2143f0667bf5487ee61d32ce3cde83011))
* **bot:** add webTranscripts settings to tickets module ([968e2ec](https://github.com/MyndPhreak/MODUS/commit/968e2ecb5c9d0f33771fddb472b2600574bb13da))
* **bot:** cross-shard cache invalidation via Redis pub/sub ([11e4381](https://github.com/MyndPhreak/MODUS/commit/11e4381a42a239a057574f4eeba7b6a44ac57896))
* **bot:** leader-gated transcript retention worker ([9f3fe67](https://github.com/MyndPhreak/MODUS/commit/9f3fe6714939d26edba1cbfb95424393657867ba))
* **bot:** lease-based leader election for background workers ([2e30e2f](https://github.com/MyndPhreak/MODUS/commit/2e30e2f156d1f78d199382c2f65036cb0a407504))
* **bot:** publish realtime events on Redis + drop Appwrite Realtime ([0da2749](https://github.com/MyndPhreak/MODUS/commit/0da2749d96a6fe120892f9ecdf15f7d2570ba6f9))
* **bot:** publish web transcript URL on ticket close ([0924241](https://github.com/MyndPhreak/MODUS/commit/09242416c7de820f3185b423b01fbe3f1754b141))
* **bot:** route all CRUD through Postgres when USE_POSTGRES is on ([6150306](https://github.com/MyndPhreak/MODUS/commit/61503063a02c4a02ca97ea052079ca4f087335d3))
* **bot:** route recording CRUD through Postgres when enabled ([81cc0b7](https://github.com/MyndPhreak/MODUS/commit/81cc0b76e4fec892bf6eedf9b4e2ffe2eeca0aa0))
* **bot:** snapshot ticket threads into postgres + R2 on close ([37ffd68](https://github.com/MyndPhreak/MODUS/commit/37ffd685be2f5ae0b1fc1f249b4bdbd8908c5a39))
* **bot:** surface transcript repository on DatabaseService ([d78aa7d](https://github.com/MyndPhreak/MODUS/commit/d78aa7d8d84641493eab358f24f01fe50d787a36))
* **db,api:** add repo helpers and auth guards for client decommission ([4c33bb5](https://github.com/MyndPhreak/MODUS/commit/4c33bb56e95dfa5d68d8e89f8f17e512d2962722))
* **db:** add 0002 migration for remaining tables ([4519765](https://github.com/MyndPhreak/MODUS/commit/451976587501e8d0e7a8c5e69fc2de5c8addaaeb))
* **db:** add Appwrite to Postgres migration script for recordings ([88aecea](https://github.com/MyndPhreak/MODUS/commit/88aecea708f60e591d960c1866eced9eea496163))
* **db:** add Drizzle schema, client, and repository for recordings ([d864697](https://github.com/MyndPhreak/MODUS/commit/d864697ec88e2761d22c7ee658f2d11f278e0773))
* **db:** add is_template and description fields to tags ([607abb6](https://github.com/MyndPhreak/MODUS/commit/607abb678faa1080c548bc4d8ea0706bb4233d3c))
* **db:** add repositories for 11 remaining domains ([42c4bf3](https://github.com/MyndPhreak/MODUS/commit/42c4bf37f1afb4831d8ba53e6c9937402f2b8407))
* **db:** add SQL migration runner with initial recordings migration ([2ec2373](https://github.com/MyndPhreak/MODUS/commit/2ec23730d6f97b5d7cb5f32a09ae8f86861a4dbf))
* **db:** add ticket_transcripts and ticket_messages tables ([2326ac7](https://github.com/MyndPhreak/MODUS/commit/2326ac7b137d4c55cbf5c33d36ac482b6e761328))
* **db:** add TranscriptRepository ([7bc71c2](https://github.com/MyndPhreak/MODUS/commit/7bc71c2814f59ddbaf91136e52dc282f8bb0073b))
* **db:** extend schema to cover remaining Appwrite collections ([61ac8d2](https://github.com/MyndPhreak/MODUS/commit/61ac8d2727ae2b227c3379424a33062137d61bcf))
* **db:** extend server + bot-status repositories for dashboard endpoints ([18f5ccc](https://github.com/MyndPhreak/MODUS/commit/18f5cccc39175098894d499e69d583ea4c74772b))
* **db:** full Appwrite to Postgres migration script ([1e36863](https://github.com/MyndPhreak/MODUS/commit/1e3686320334db8461e6877ef8d1a89b7f4fcc25))
* **docs:** migration guide for appwrite installs ([c9b8fcc](https://github.com/MyndPhreak/MODUS/commit/c9b8fcc0583a9545644950dbec8c4cedbd5d95ac))
* **infra:** add optional Postgres service to docker-compose ([c299a59](https://github.com/MyndPhreak/MODUS/commit/c299a59ce753caad9a53f25a99c6b6276d35adcc))
* **infra:** add optional Redis service to docker-compose ([9b68a7f](https://github.com/MyndPhreak/MODUS/commit/9b68a7f90b662324c815e3c0207bd43e338e2bef))
* **web:** add reusable embed editor, preview, and markdown toolbar ([b37f287](https://github.com/MyndPhreak/MODUS/commit/b37f2876e72e7cf33ed846f28ef34a9eaeafe6bb))
* **web:** add TTS announcement controls to recording dashboard ([a8ef132](https://github.com/MyndPhreak/MODUS/commit/a8ef1326e20f5c0178b7cb073e3337be5b28c0fd))
* **web:** add web transcripts panel to tickets dashboard ([2984bee](https://github.com/MyndPhreak/MODUS/commit/2984bee43334185b56a89f4f710fef40628bd68e))
* **web:** discord-style ticket transcript page ([73e59b1](https://github.com/MyndPhreak/MODUS/commit/73e59b1c630cfe535593f3847073f1a8134a24c2))
* **web:** group server sidebar modules into labeled categories ([8c22de3](https://github.com/MyndPhreak/MODUS/commit/8c22de376a2f604cba830853d6ef5bfc9504eb30))
* **web:** Pinia user store handles both auth backends ([08613ed](https://github.com/MyndPhreak/MODUS/commit/08613ed56fe46ccd749a4029b395aed6cacc590b))


### 🐛 Bug Fixes

* **api:** return 404 (not 401) for unauthenticated transcript fetches ([884a281](https://github.com/MyndPhreak/MODUS/commit/884a281c91af1595801e2a30729c30860290b775))
* **bot:** fix tts voice id ([ffe07e2](https://github.com/MyndPhreak/MODUS/commit/ffe07e2a697b5ceae697d57e761badecc456794e))
* **bot:** post /tag output to channel, keep admin replies ephemeral ([7cbe7dd](https://github.com/MyndPhreak/MODUS/commit/7cbe7dd945754cf94bf31e1f6e8a65832b97f99e))
* **db:** ticket_messages.id matches BIGSERIAL column type ([459c015](https://github.com/MyndPhreak/MODUS/commit/459c0151c485b2f12841b8446cf6fad7e897ec35))
* **docker:** make builds workspace-aware with root lockfile ([e327c81](https://github.com/MyndPhreak/MODUS/commit/e327c811989a1a72e099b9aa639c79739f401978))
* **web:** use log.timestamp for server log dates ([53ad9e6](https://github.com/MyndPhreak/MODUS/commit/53ad9e6fb0affe1f67a1d2ee66b1bcac3d61f415))


### ♻️ Refactors

* **api:** drop Appwrite fallbacks from every data endpoint ([31fef2c](https://github.com/MyndPhreak/MODUS/commit/31fef2c11adc0c58a30c6ca5c116ee566c510128))
* **api:** drop Appwrite OAuth fallbacks from auth + discord endpoints ([17142dc](https://github.com/MyndPhreak/MODUS/commit/17142dc9a14e3f8104479976c4908264b0141680))
* **bot:** consumer call-site rename to DatabaseService ([73af7d3](https://github.com/MyndPhreak/MODUS/commit/73af7d3367fc3d0997410f02b1a71996eb8d7700))
* **bot:** rename AppwriteService to DatabaseService; drop fallbacks ([e26314a](https://github.com/MyndPhreak/MODUS/commit/e26314aa4e5b9d0740db5d8ca6977397631dfee1))
* **db:** compile @modus/db to dist/ so production node can consume it ([e4f547e](https://github.com/MyndPhreak/MODUS/commit/e4f547e1e0020154cfc8ca779a478ae654b0c128))
* **web:** drop Appwrite client SDK from every dashboard page ([ee2c556](https://github.com/MyndPhreak/MODUS/commit/ee2c556b3100145425695597a8edb3ab2e29373a))
* **web:** drop node-appwrite + simplify Pinia user store ([1761183](https://github.com/MyndPhreak/MODUS/commit/1761183a85cbefbc6d0eca6488e389f0d42411a4))
* **web:** rebuild embed builder on shared EmbedEditor ([7de096c](https://github.com/MyndPhreak/MODUS/commit/7de096cff805679e69ae44c30053c39c1c1a7b35))
* **web:** rebuild tags dashboard on shared EmbedEditor ([2b8a824](https://github.com/MyndPhreak/MODUS/commit/2b8a8244184d7b178cb70743b248a1bc2cf71209))


### 📖 Documentation

* add backend migration plan off Appwrite ([cc24b26](https://github.com/MyndPhreak/MODUS/commit/cc24b2608f370a1a302e6e37abaf86396e81fc12))
* rewrite CLAUDE.md for post-Appwrite architecture ([f0a7244](https://github.com/MyndPhreak/MODUS/commit/f0a724467c18226752e9f5f5b457c44349fa1a35))
* spec for server sidebar category organization ([8da4a8f](https://github.com/MyndPhreak/MODUS/commit/8da4a8f6d461e8127028329b175e026aaba70062))

## [1.11.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.10.0...modus-v1.11.0) (2026-04-21)


### ✨ Features

* **api:** add role-based dashboard access endpoints ([22baa09](https://github.com/MyndPhreak/MODUS/commit/22baa092f00d60633f6ce66325dd4c71f4222334))
* **bot:** add dashboard_role_ids field to servers collection schema ([11e20c2](https://github.com/MyndPhreak/MODUS/commit/11e20c2dc1e62c199907710ea4dbb52ee62678eb))
* **bot:** edit Now Playing embed in-place for playlist tracks ([a25411c](https://github.com/MyndPhreak/MODUS/commit/a25411c08040a850f8281db070e3968edc8ea5c1))
* **web:** add granular role-based dashboard access control ([7e356dc](https://github.com/MyndPhreak/MODUS/commit/7e356dc791be01698326b34b3b2f62e1822ca967))


### 🐛 Bug Fixes

* **music:** remove skip messages ([028542a](https://github.com/MyndPhreak/MODUS/commit/028542ad09d3e7ee68671c502ee9cdb989a4ac46))
* **welcome:** add more descriptive error messages ([8ee377a](https://github.com/MyndPhreak/MODUS/commit/8ee377a1bf59aae61bcec758966764e5c33f58ba))


### 📖 Documentation

* add comprehensive CLAUDE.md for AI assistant guidance ([f513cfb](https://github.com/MyndPhreak/MODUS/commit/f513cfb9c5da7fb75ed58a3d1fe261a05946ac65))
* add project README with features, setup, and tech overview ([d8bed15](https://github.com/MyndPhreak/MODUS/commit/d8bed15996b76e19276756d277fa19e8c81e1f1a))

## [1.10.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.9.0...modus-v1.10.0) (2026-04-05)


### ✨ Features

* **bot,web:** use modal for poll creation and hide ticket metadata from footer text ([25197a9](https://github.com/MyndPhreak/MODUS/commit/25197a9d86cc2ff647f1fac19e26e71e21a1cb62))


### 🐛 Bug Fixes

* **bot:** add missing youtube-dl-exec dependency required by discord-player-youtubei 2.0.0 ([c412a0d](https://github.com/MyndPhreak/MODUS/commit/c412a0d4ea8e6a1fa579d17c9979fd65943410ce))
* **bot:** defer interaction reply in music module to fix missing embeds and error responses ([c013c72](https://github.com/MyndPhreak/MODUS/commit/c013c720f10c754c5f608a8ada71258ebc0f9e01))
* **bot:** disable default PCM compressor in discord-player causing audio squashing ([c28663a](https://github.com/MyndPhreak/MODUS/commit/c28663adf27ee118c285d6748185084a8a9d1dee))
* **bot:** fix Docker build failure from youtube-dl-exec missing Python ([9751069](https://github.com/MyndPhreak/MODUS/commit/9751069435cfdded08e59fa834926985f6c87145))
* **bot:** improve web search error handling and surface actionable messages ([19c2c0e](https://github.com/MyndPhreak/MODUS/commit/19c2c0ebb2e5a0bd06d46d716045c25a90a3db80))


### 📖 Documentation

* add project README ([2bda2ce](https://github.com/MyndPhreak/MODUS/commit/2bda2ceb950f7b8077dea7e3a9b85da047f6a61a))

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
