# Changelog

## [1.18.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.17.0...modus-v1.18.0) (2026-08-13)


### ✨ Features

* **api:** add dashboard poll-send route ([544f591](https://github.com/MyndPhreak/MODUS/commit/544f59157cae667a5c3493c63872f4691b412d8d))
* **api:** add poll template CRUD routes ([82a449d](https://github.com/MyndPhreak/MODUS/commit/82a449dc151b50760ac18b164ea63a9b5309b995))
* **api:** add running-polls list route with live tallies ([eeb2195](https://github.com/MyndPhreak/MODUS/commit/eeb21958bc0f6e89aca28c23a0bde424fa743b35))
* **api:** add scheduled event create+announce route ([636044a](https://github.com/MyndPhreak/MODUS/commit/636044a1668317ec12d7ac33997fe7a00d9c993d))
* **api:** add scheduled event delete route ([05b8448](https://github.com/MyndPhreak/MODUS/commit/05b84485d9fd2fa4826b14f01f0b43b5b07de186))
* **api:** add scheduled event edit route ([50a700d](https://github.com/MyndPhreak/MODUS/commit/50a700db1012057ddd2ffcfdc4f6dd2eeaad0900))
* **api:** add scheduled events list route ([299a569](https://github.com/MyndPhreak/MODUS/commit/299a569edb2c3c69c46d1be029ac31ea0c7fb693))
* **bot:** add GuildMessagePolls intent and poll-votes EventBus channel ([9d7e9f2](https://github.com/MyndPhreak/MODUS/commit/9d7e9f2ad741dc5939adcf106a529d0d74ed6d51))
* **bot:** add GuildScheduledEvents gateway intent ([c3ab295](https://github.com/MyndPhreak/MODUS/commit/c3ab295451ebeaa46f43825d235b849ee2a44e75))
* **bot:** add R2 orphan-sweep maintenance script ([15fdb99](https://github.com/MyndPhreak/MODUS/commit/15fdb99908fea9db032fd0594941e01ac47503cf))
* **bot:** declare dashboard display metadata on every user-facing module ([677ae96](https://github.com/MyndPhreak/MODUS/commit/677ae962011e5873da420e48a64f03b745ecf04e))
* **bot:** expose EventAnnouncementRepository on DatabaseService ([552b118](https://github.com/MyndPhreak/MODUS/commit/552b1186bab1f3c82a6217da44ce18e5f2564a06))
* **bot:** expose poll repositories and vote publisher on DatabaseService ([e1edd76](https://github.com/MyndPhreak/MODUS/commit/e1edd7674769ee31730edc75df6da8d43916f480))
* **bot:** let modules declare dashboard display metadata ([50a62a5](https://github.com/MyndPhreak/MODUS/commit/50a62a544fe05651fe785e5ad7d535b29bbc982f))
* **bot:** persist poll rows and publish vote events ([0d83e2b](https://github.com/MyndPhreak/MODUS/commit/0d83e2ba81d06873bbd2a5789c55e5149b3b2489))
* **bot:** post channel announcement on /event create ([d3b8d52](https://github.com/MyndPhreak/MODUS/commit/d3b8d521e8b002924458aefee41b28de522210eb))
* **bot:** sync interest count and live status to the event announcement ([7ccdff1](https://github.com/MyndPhreak/MODUS/commit/7ccdff119dbb53f5c79161abb8efebf6cf127613))
* **db:** add dashboard display metadata columns to modules table ([681031e](https://github.com/MyndPhreak/MODUS/commit/681031e3c369b70b007339344cbdb74a2026ddcd))
* **db:** add event_announcements table ([5e5180d](https://github.com/MyndPhreak/MODUS/commit/5e5180daa03d584d1481b6b2f62322dfb96765a9))
* **db:** add EventAnnouncementRepository ([9c16fcc](https://github.com/MyndPhreak/MODUS/commit/9c16fcc766ef14f63af796663f0c18bf813d9a1e))
* **db:** add lean maintenance-query helpers for orphan sweeps ([0461b2a](https://github.com/MyndPhreak/MODUS/commit/0461b2a253a05dd7976c4483575333793c95dc03))
* **db:** add poll_templates and polls tables ([868e02c](https://github.com/MyndPhreak/MODUS/commit/868e02c70dc5a0c928772ab2581f75d4bb99e27f))
* **db:** add PollTemplateRepository and PollRepository ([062f3ad](https://github.com/MyndPhreak/MODUS/commit/062f3adcbc61ca9813ac86f5f988defa9a135200))
* **db:** upsert module metadata on every registration instead of insert-once ([ea3a962](https://github.com/MyndPhreak/MODUS/commit/ea3a962346c64d86e123272f020d6c554f650129))
* reusable poll templates, dashboard send, and live running-polls view ([e9d3322](https://github.com/MyndPhreak/MODUS/commit/e9d3322e5fda09e8e7b75aa025a1e4314f19f164))
* **web:** add create/edit/delete modal to the events calendar ([f5814b2](https://github.com/MyndPhreak/MODUS/commit/f5814b28f9f8556ebd099c4eb6557a30901d68ad))
* **web:** add End Poll control to the dashboard ([4c5cabc](https://github.com/MyndPhreak/MODUS/commit/4c5cabc20422631802d3b1ce252e791ee3161994))
* **web:** add FontPicker component with lazy per-row font preview ([24d5291](https://github.com/MyndPhreak/MODUS/commit/24d52912668bcb880c900c16b19b09f2fd5d5334))
* **web:** add GradientPicker component for welcome editor ([f507bd1](https://github.com/MyndPhreak/MODUS/commit/f507bd170d35edec47999fee58ea9b73fd740540))
* **web:** add line/arrow shape to welcome editor ([d2ac7d8](https://github.com/MyndPhreak/MODUS/commit/d2ac7d8fd7aa966b8078a1177e78847d8f9ad11e))
* **web:** add scroll-to-zoom to welcome editor canvas ([edec344](https://github.com/MyndPhreak/MODUS/commit/edec344fb149d5e042d5cdea0d30869e9bd94906))
* **web:** add spacebar-drag-to-pan to welcome editor canvas ([344a142](https://github.com/MyndPhreak/MODUS/commit/344a142f23bc60c300b42072bccc9684342d88e4))
* **web:** add triangle and star shapes to welcome editor ([bf5c1c0](https://github.com/MyndPhreak/MODUS/commit/bf5c1c0d8e5266aef168890520c83fdabadf5ef4))
* **web:** add useEvents composable ([2ade6d2](https://github.com/MyndPhreak/MODUS/commit/2ade6d297c1fa79a91f76f9f41a74a62147d6bfd))
* **web:** add usePolls composable ([580fe20](https://github.com/MyndPhreak/MODUS/commit/580fe20de91f6cf56ceed664fc18a989adb3e976))
* **web:** combine welcome editor background color and image into one popover ([82a9c43](https://github.com/MyndPhreak/MODUS/commit/82a9c43440cf81e404295618a46d84820d4d772b))
* **web:** consolidate welcome editor canvas width/height into one popover ([2086b99](https://github.com/MyndPhreak/MODUS/commit/2086b99962d83efa6f06cf3075f25c072b86f8c1))
* **web:** fix gradient rendering to respect angle and work on all shapes ([c4ea58a](https://github.com/MyndPhreak/MODUS/commit/c4ea58a69a13116d326b83a04419bd837a5f9290))
* **web:** make circle resizable via canvas transformer ([dce4560](https://github.com/MyndPhreak/MODUS/commit/dce4560d1937a75ef9e273fb4d350b9b345219c0))
* **web:** redesign server modules dashboard with categorized cards ([276a16d](https://github.com/MyndPhreak/MODUS/commit/276a16dc9ca87f7813f4cb6c48c9b432c35d1275))
* **web:** register poll-votes SSE channel ([0320298](https://github.com/MyndPhreak/MODUS/commit/0320298a7a4e38816808e87377aebd0ca84e62a2))
* **web:** rewrite events page with calendar view and settings ([8b23225](https://github.com/MyndPhreak/MODUS/commit/8b23225969a563cb9df78d42ed371ba6859a2d2c))
* **web:** rewrite polls dashboard page with templates, send, and live running-polls view ([66ae752](https://github.com/MyndPhreak/MODUS/commit/66ae75265fb1979e565b3d12ebc2b5b3ecb6023a))
* **web:** wire EventAnnouncementRepository into getRepos() ([d62f564](https://github.com/MyndPhreak/MODUS/commit/d62f564c751c71a3a54351f8a63d1a6bf94c9c46))
* **web:** wire GradientPicker into fill and stroke property panels ([4e2e248](https://github.com/MyndPhreak/MODUS/commit/4e2e2483b9285ad8337aeeeeb29afdaa0cce7031))
* **web:** wire poll repositories into getRepos() ([7be9885](https://github.com/MyndPhreak/MODUS/commit/7be98850b611d8c8ee55077c3617f58adef5bc5a))


### 🐛 Bug Fixes

* **api:** read poll vote counts from the correct Discord response field ([6c85784](https://github.com/MyndPhreak/MODUS/commit/6c857844c7b508112c37cf26eb4f4e1f6e472d10))
* **api:** scope poll routes to guild managers, not any authenticated user ([ea9fe86](https://github.com/MyndPhreak/MODUS/commit/ea9fe86a3dd157f3c318f38980e6c3e60e5dcb46))
* **api:** surface field-specific Discord poll rejection errors ([b3dbc8d](https://github.com/MyndPhreak/MODUS/commit/b3dbc8dbdaee7bb2319de56dbe1f6eaaf6dcfe14))
* **api:** validate poll template question/option length at save time ([0d6b916](https://github.com/MyndPhreak/MODUS/commit/0d6b916cfac8e3c0798ee75651a31543af607039))
* **bot,web:** close events-calendar review findings from final fix wave ([36b5221](https://github.com/MyndPhreak/MODUS/commit/36b52218770f92077c68cec7f118374cf13cf037))
* **bot,web:** extend welcome template schema and renderer for new shape types ([b8bb2c3](https://github.com/MyndPhreak/MODUS/commit/b8bb2c3bc3d467cb29f67118ad28aeac9dc6c1f9))
* **bot:** delete recording R2 objects before the DB row, not after ([88f295d](https://github.com/MyndPhreak/MODUS/commit/88f295d3d6913d54f0e4395613714294f3c947fd))
* **bot:** fall back to general web search when news search is empty ([f15626b](https://github.com/MyndPhreak/MODUS/commit/f15626b5a4f06cb1dff7f5021e499cc85ecda2b1))
* **bot:** pin nanoid &gt;=3.3.18 for CVE-2026-67213 (GHSA-2v37-7h3g-55p8) ([9e7c37d](https://github.com/MyndPhreak/MODUS/commit/9e7c37d4267d0e3519b73a99a1b05840b4900127))
* **bot:** register Poll and PollAnswer partials so live vote events fire after restart ([ebd6056](https://github.com/MyndPhreak/MODUS/commit/ebd6056a4c7394764bd5f79430038552e5382a97))
* **bot:** retry weather geocoding without comma ([383f747](https://github.com/MyndPhreak/MODUS/commit/383f7477dcf59c990b00e67ebf6332ac54db6960))
* **bot:** send welcome images to announcement channels ([43eeb68](https://github.com/MyndPhreak/MODUS/commit/43eeb68901959dedbfd28e985a7e5cec4c470c48)), closes [#50](https://github.com/MyndPhreak/MODUS/issues/50)
* **db:** commit drizzle metadata for the 0004 migration ([82ba950](https://github.com/MyndPhreak/MODUS/commit/82ba950b5c7a8e3eebc2d32df929a14fa6109db0))
* **db:** type-enforce module color and category across bot/web boundary ([d83ac14](https://github.com/MyndPhreak/MODUS/commit/d83ac14c830d7d12d8be79f6cffa69a565c95470))
* **web:** add accessible names to welcome editor icon buttons and fix disabled-button tooltips ([5431501](https://github.com/MyndPhreak/MODUS/commit/54315015792e590c59cb3e6c9687f57baebff89b))
* **web:** add delete button to welcome editor layers list ([5130856](https://github.com/MyndPhreak/MODUS/commit/5130856b9c1f78cf7a2aa1b26caed56c61c38ea4))
* **web:** add empty-state hint to welcome editor canvas ([90988ca](https://github.com/MyndPhreak/MODUS/commit/90988ca6582fe5e9fdbef6414c46e70db859a401))
* **web:** align FontPicker dropdown theming with welcome editor glass tokens ([a52f34e](https://github.com/MyndPhreak/MODUS/commit/a52f34e74abd11e662b29b3806df38c9070a3f0e))
* **web:** allow deleting announce clips via delete-file ([8ce0605](https://github.com/MyndPhreak/MODUS/commit/8ce0605e6d078b719fc94e9b1506bcc8c2ce08b4))
* **web:** always show welcome editor layer action buttons, disabled when nothing selected ([7d1dc62](https://github.com/MyndPhreak/MODUS/commit/7d1dc6261158b9a15de37c9a53817f79711263b2))
* **web:** apply glass panel styling and larger text to welcome editor chrome ([5cdfb3e](https://github.com/MyndPhreak/MODUS/commit/5cdfb3e05cb59e7be6322373fdeb7a8faa1ce8db))
* **web:** apply gradient rendering to all shapes and fix stroke gradients server-side ([ddcf8af](https://github.com/MyndPhreak/MODUS/commit/ddcf8afc498be52dfb364e90c66c47b2081a0231))
* **web:** convert welcome editor tool grid to a labeled list ([977c34c](https://github.com/MyndPhreak/MODUS/commit/977c34cfc1a0999525f9c5f80e751b60a058b2ef))
* **web:** delete identity avatar and welcome background on guild un-register ([a3130df](https://github.com/MyndPhreak/MODUS/commit/a3130df8398496a6f535f1367dc6574c08a3dd6b))
* **web:** delete previous bot avatar from R2 on identity change ([668f795](https://github.com/MyndPhreak/MODUS/commit/668f795b4b03ed9530cfbd4dbc6afc4f2a6fac42))
* **web:** delete previous welcome background from R2 on change ([ef81895](https://github.com/MyndPhreak/MODUS/commit/ef818955a2b7124a3f4b2c4f5327ec0c6dd9ed28))
* **web:** delete recording R2 objects before the DB row, not after ([590affb](https://github.com/MyndPhreak/MODUS/commit/590affb2fbb1010dfa16d8f8c8d4ae769cf36ba9))
* **web:** deselect welcome editor element when clicking canvas backdrop ([c3f1d2d](https://github.com/MyndPhreak/MODUS/commit/c3f1d2d9d01d3056b3cc1eb3d6618b1e69c3db75))
* **web:** distinguish missing module metadata from empty search results ([d532cb4](https://github.com/MyndPhreak/MODUS/commit/d532cb4d4d450eab1f4563f5cf8121b762720c77))
* **web:** eliminate layout shift in welcome editor layers list selection highlight ([99223cb](https://github.com/MyndPhreak/MODUS/commit/99223cb5ec83dadccd6f1e4932144ae77fa70fbf))
* **web:** enlarge welcome editor layers-list action buttons ([ee5a490](https://github.com/MyndPhreak/MODUS/commit/ee5a49099423dc8d1e5105f5026220bd7098517a))
* **web:** fix UFileUpload dropzone styling and add missing accessible names ([0dfe1dd](https://github.com/MyndPhreak/MODUS/commit/0dfe1dd219d55e61e4a2abbd1a7b3236db29f345))
* **web:** fix zoom/pan edge cases found in final review ([05e2bab](https://github.com/MyndPhreak/MODUS/commit/05e2babea6964e5e2766f12c8fdbfc0e6a30c746))
* **web:** highlight canvas shape on welcome editor layers list row hover ([5c0c499](https://github.com/MyndPhreak/MODUS/commit/5c0c499ce4573cb4ec1ea9ed8e89b1b71e81d090))
* **web:** improve FontPicker dropdown readability and match editor theme ([85b2e51](https://github.com/MyndPhreak/MODUS/commit/85b2e51b8770c145e214e367ea4d22231f057fb4))
* **web:** let welcome editor page opt out of dashboard panel padding ([988e36c](https://github.com/MyndPhreak/MODUS/commit/988e36c3a627885b5db308f1c54fe4330337c642))
* **web:** make Google Font loading awaitable via Font Loading API ([cea697a](https://github.com/MyndPhreak/MODUS/commit/cea697a6b888ad10f0b9cc0ee3538e375819d316))
* **web:** make welcome editor background non-interactive so clicking it deselects ([10294e0](https://github.com/MyndPhreak/MODUS/commit/10294e04972e422eecc79012c2127d609831611a))
* **web:** make welcome editor canvas selection outline bolder ([4227acb](https://github.com/MyndPhreak/MODUS/commit/4227acb8c730d10f853e3bc32a21d45a12243385))
* **web:** match welcome editor textarea font size to other inputs ([b53eaee](https://github.com/MyndPhreak/MODUS/commit/b53eaee47c5637377a25c626d3b77529c822c794))
* **web:** move welcome editor placeholders to text field with click-to-insert ([40ac073](https://github.com/MyndPhreak/MODUS/commit/40ac07353c6eb7e8949f757b7f128b3b761c8bff))
* **web:** normalize icon container sizing across module pages ([3990b5f](https://github.com/MyndPhreak/MODUS/commit/3990b5f0887d6691f67bad5391e6559dcc6b4b4a))
* **web:** prevent transformer from attaching to line/arrow elements ([7f61924](https://github.com/MyndPhreak/MODUS/commit/7f61924e000e691bb320328d2b2edf557d71395f))
* **web:** register sidebar once module data has loaded, not before ([c50e5ec](https://github.com/MyndPhreak/MODUS/commit/c50e5ecd7c3d103dc2e2bcf62d4766cd21d1b656))
* **web:** repaint welcome editor canvas once selected font finishes loading ([377a4ab](https://github.com/MyndPhreak/MODUS/commit/377a4abeb389e3c6ec89c2239c391a2bbcb829b6))
* **web:** replace welcome editor BG color chip with UColorPicker popover ([f76f2ee](https://github.com/MyndPhreak/MODUS/commit/f76f2ee621ec5f8e656900dfa9588388ea14b06e))
* **web:** replace welcome editor BG image upload with UFileUpload ([68df0de](https://github.com/MyndPhreak/MODUS/commit/68df0de74d364ef930ced87a3f9ec287abf3711d))
* **web:** replace welcome editor canvas size inputs with UInputNumber ([c23934a](https://github.com/MyndPhreak/MODUS/commit/c23934a698bb78beb6c6a2bf2b6413d2bcc346c6))
* **web:** replace welcome editor layer action and delete tooltips with UTooltip ([27d3856](https://github.com/MyndPhreak/MODUS/commit/27d385699ae34e240d4c4cf2f54b0ecd193e86d1))
* **web:** replace welcome editor opacity control with USlider ([ff726a8](https://github.com/MyndPhreak/MODUS/commit/ff726a8c679a92c3fb47fbba4e316967ee1f59d9))
* **web:** replace welcome editor reset/save buttons with UButton ([da90f55](https://github.com/MyndPhreak/MODUS/commit/da90f557f464522d26948ee2f4e6e9ac25704312))
* **web:** replace welcome editor toolbar/presets/tools tooltips with UTooltip ([018a646](https://github.com/MyndPhreak/MODUS/commit/018a646411fec0112f6db9eb1c362bdfcdfeb4c8))
* **web:** reset pan state on window blur to prevent stuck stage ([f6be28a](https://github.com/MyndPhreak/MODUS/commit/f6be28ae45db7a25d3546084aa4cf6a8ac59e405))
* **web:** restore text resize snap-back behavior ([ee06985](https://github.com/MyndPhreak/MODUS/commit/ee0698510c80c73ee06c43cbc5f71c3e4c226d1f))
* **web:** restrict gradient picker to shapes/properties both renderers support ([f90a301](https://github.com/MyndPhreak/MODUS/commit/f90a301176c267210106f705f371b1f88748da32))
* **web:** restyle server logs to match the admin terminal look ([05e53f2](https://github.com/MyndPhreak/MODUS/commit/05e53f2602ab8f1661d68fdb3b445d34e9bd8944))
* **web:** scale konva stage canvas dimensions with zoom level ([79cd599](https://github.com/MyndPhreak/MODUS/commit/79cd5996cad54cfd15e286804b2afc172f67c3be))
* **web:** show selected element's actual content in welcome editor property panel header ([c712ef7](https://github.com/MyndPhreak/MODUS/commit/c712ef7518cb48007e9a249b926ef8e6ecfdc172))
* **web:** show visible labels on welcome editor add-element tools ([327cfe7](https://github.com/MyndPhreak/MODUS/commit/327cfe78e32808b131e208585405f7f1082d4af6))
* **web:** stack welcome editor property panel rows and enlarge inputs ([321a744](https://github.com/MyndPhreak/MODUS/commit/321a7443d559fb63f9764bf06cd22c70065ef58d))
* **web:** strengthen welcome editor layers list active-row highlight ([213e113](https://github.com/MyndPhreak/MODUS/commit/213e113f2f8a9ca0c6b3dd8a4809916f6d249b4c))
* **web:** swallow re-thrown errors in polls dashboard action handlers ([d78683b](https://github.com/MyndPhreak/MODUS/commit/d78683b5eb4a28e7f7bbaf1f99f47c38ede860ef))
* **web:** use a "Page | MODUS" title template instead of one static title ([4092d4f](https://github.com/MyndPhreak/MODUS/commit/4092d4f4bf651428175f989277399cb71addffce))
* **web:** widen welcome editor side panels ([5ba3cff](https://github.com/MyndPhreak/MODUS/commit/5ba3cffa78a6eb9bff90a7b5dcc18b09ceb1ea41))


### ♻️ Refactors

* **web:** derive module display metadata from the DB instead of a static lookup ([199af28](https://github.com/MyndPhreak/MODUS/commit/199af28e0c40882e254aca654365dd5790c9e182))
* **web:** generate the server sidebar from module data instead of a hardcoded list ([2956198](https://github.com/MyndPhreak/MODUS/commit/29561987d632e5e87bcbc7c49692fcd4a7985ef4))
* **web:** read module display metadata from the DB in the admin modules page ([e23431c](https://github.com/MyndPhreak/MODUS/commit/e23431c0c8482f74624301534dc5cd8a519f2bcf))
* **web:** read module display metadata from the DB in the modules grid ([16584c7](https://github.com/MyndPhreak/MODUS/commit/16584c73467aa99597712c12e445d78daa342615))

## [1.17.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.16.0...modus-v1.17.0) (2026-08-08)


### ✨ Features

* **bot:** add LogRetentionWorker for log table cleanup ([159ce77](https://github.com/MyndPhreak/MODUS/commit/159ce773decba4c1066f7227699cd1f1ac421942))
* **bot:** expose module/command catalog via GET /api/docs ([038c564](https://github.com/MyndPhreak/MODUS/commit/038c564d0cf53071c36bd209130d23a4e040be03))
* **bot:** wire LogRetentionWorker into startup behind LOG_RETENTION_DAYS ([e85e680](https://github.com/MyndPhreak/MODUS/commit/e85e68070a6af0731afa507b9fab618b62a6b69c))
* **db:** add batched deleteOlderThan to LogRepository ([fe7064d](https://github.com/MyndPhreak/MODUS/commit/fe7064de123af60952edee47fddc1f7aa03fb628))
* **web:** add Bot Identity entry to guild dashboard sidebar ([02542ef](https://github.com/MyndPhreak/MODUS/commit/02542efc3c413ef2a5a1bda0cad740c2ac817e73))
* **web:** add bot identity settings page to guild dashboard ([e0cad4b](https://github.com/MyndPhreak/MODUS/commit/e0cad4ba31873eb553b115c344e8fb022f28894f))
* **web:** add docs nav link and fix section links off the homepage ([7fa5ad8](https://github.com/MyndPhreak/MODUS/commit/7fa5ad83443a75bd1511435f3944bcc584d4eafc))
* **web:** add per-guild bot avatar upload endpoint ([2c18a05](https://github.com/MyndPhreak/MODUS/commit/2c18a0562b7260a465b091a5efb26f5ea4c3e691))
* **web:** add public /docs module list page ([9c4504b](https://github.com/MyndPhreak/MODUS/commit/9c4504bb5c09ff564912d4217a95a4311358a786))
* **web:** add public /docs/[module] command reference page ([d093c03](https://github.com/MyndPhreak/MODUS/commit/d093c03bfa24d6750914914f7db9c80e3d62268c))
* **web:** add public proxy for the bot's module/command catalog ([3593889](https://github.com/MyndPhreak/MODUS/commit/3593889538a4f0ac36d67f8dfe9e4d563e78eb35))
* **web:** add useDocs composable for the docs pages ([ae52fa4](https://github.com/MyndPhreak/MODUS/commit/ae52fa4bd37c00eb34d2205bb5a6a432fa81eb39))
* **web:** apply per-guild bot nickname/avatar changes to Discord ([a300bd4](https://github.com/MyndPhreak/MODUS/commit/a300bd4af2a3aa09547234b3942d0023508dbfea))
* **web:** serve per-guild bot avatar images from R2 ([06b0f6d](https://github.com/MyndPhreak/MODUS/commit/06b0f6dfd58eb04233a1122e781e6c928f82cc0b))


### 🐛 Bug Fixes

* **bot:** restrict /reload to bot admins ([83e0098](https://github.com/MyndPhreak/MODUS/commit/83e00986b4fee0358c2545f23ab7c717aa0cd07b))
* **web:** add force re-apply escape hatch for drifted bot identity state ([6fec43e](https://github.com/MyndPhreak/MODUS/commit/6fec43e3a9af3302ae6618d00e4d8aebfeb8da21))
* **web:** authenticate identity avatar uploads before buffering the body ([83010e9](https://github.com/MyndPhreak/MODUS/commit/83010e99600d8f6241702c5889b0035655c5e775))
* **web:** block writes to module_name=identity via the generic guild-configs PUT ([5ac4026](https://github.com/MyndPhreak/MODUS/commit/5ac402650d6c1edd9ef60b10bc1d3959ac944c3a))
* **web:** give docs pages their own layout instead of inheriting landing padding ([5edc880](https://github.com/MyndPhreak/MODUS/commit/5edc8801e74627185e8f088415ffd1355606d14f))
* **web:** guard FileReader.onload to prevent race condition in avatar upload ([58fbfa4](https://github.com/MyndPhreak/MODUS/commit/58fbfa43978db44f835c45e9368521ac9668cefc))
* **web:** restrict identity avatar uploads to raster images, mark responses nosniff ([235ed60](https://github.com/MyndPhreak/MODUS/commit/235ed604ae2d15cc8840c12bbacec716fbd18cec))
* **web:** strictly validate identity avatar R2 keys against guild id and shape ([de9705b](https://github.com/MyndPhreak/MODUS/commit/de9705bb58e0e1d15d93799b77d81887c766e719))


### ♻️ Refactors

* **bot:** extract shared module/command catalog helper ([e793a65](https://github.com/MyndPhreak/MODUS/commit/e793a658aa238805a7f7ee24f73fc10b9ab2560e))

## [1.16.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.15.0...modus-v1.16.0) (2026-08-03)


### ✨ Features

* add Discord Components V2 layout engine and web builder ([#40](https://github.com/MyndPhreak/MODUS/issues/40)) ([cd50cb5](https://github.com/MyndPhreak/MODUS/commit/cd50cb5e1272e4a121875af6e69bbbd6f69b4e63))
* **ai:** append-model system prompt + AI dashboard reorganization ([#32](https://github.com/MyndPhreak/MODUS/issues/32)) ([5aa4f2d](https://github.com/MyndPhreak/MODUS/commit/5aa4f2d693bd77c28b691e968919441ad48441b6))
* **bot:** AI tool registry, weather tool, and intent-aware web search ([#35](https://github.com/MyndPhreak/MODUS/issues/35)) ([45ecead](https://github.com/MyndPhreak/MODUS/commit/45ecead9bd79e38a7027d47280045bf111e6c613))
* **bot:** convert /queue to Components V2 with prev/next pagination ([9e88cf0](https://github.com/MyndPhreak/MODUS/commit/9e88cf05290a417d0824cafd38c47dd08ee48c83))
* **bot:** Reminders Module ([#37](https://github.com/MyndPhreak/MODUS/issues/37)) ([#42](https://github.com/MyndPhreak/MODUS/issues/42)) ([857e4d3](https://github.com/MyndPhreak/MODUS/commit/857e4d34009d4329e8b477d544d455adbaf97393))
* **bot:** show artist name in now-playing and added-to-queue cards ([b27301e](https://github.com/MyndPhreak/MODUS/commit/b27301e9bec41d3b694695d87f82c795f82fbd8a))
* **web:** add reminders and text-to-speech to landing page module list ([15b5bea](https://github.com/MyndPhreak/MODUS/commit/15b5bea08660bf40297aa0e46d81d6f6913c5210))


### 🐛 Bug Fixes

* **api:** close broken-access-control holes + bot HTTP hardening ([#43](https://github.com/MyndPhreak/MODUS/issues/43)) ([abc8eb6](https://github.com/MyndPhreak/MODUS/commit/abc8eb651cb720e65d2a086c7f6892a90b06c75e))
* **bot:** apply the color option to V2 message containers ([2b1e771](https://github.com/MyndPhreak/MODUS/commit/2b1e77184308aceb97358f7f7e786917d360c898))
* **bot:** keep the now-playing card populated through pause/skip/stop ([c7729bf](https://github.com/MyndPhreak/MODUS/commit/c7729bfee3fbbb9e99498b28141e50c2f0ca46f8))
* **bot:** pair V2 thumbnails with their actual title/description text ([bdf5da5](https://github.com/MyndPhreak/MODUS/commit/bdf5da52c0a26ee7c557803b23d5947134354a8a))
* **bot:** render now-playing album art via media gallery instead of thumbnail ([efe141f](https://github.com/MyndPhreak/MODUS/commit/efe141fb788d20b38bf24a335713ef6e4f425005))
* **bot:** set IsComponentsV2 flag on V2 component replies ([ca71796](https://github.com/MyndPhreak/MODUS/commit/ca717965545080492fd03f84911d761fcca3453a))
* **ci:** pin pnpm action-setup to version 10, not 9 ([09f58fb](https://github.com/MyndPhreak/MODUS/commit/09f58fb5d0e461e11b70add274ea6bed068d32bf))
* enforce global module toggles across the bot fleet and dashboards ([#31](https://github.com/MyndPhreak/MODUS/issues/31)) ([48f1faf](https://github.com/MyndPhreak/MODUS/commit/48f1faf147fcc6cf8fccd7ffa50f251816dd8df7))
* **triggers:** allow editing trigger channel and configuration ([#41](https://github.com/MyndPhreak/MODUS/issues/41)) ([54a76d9](https://github.com/MyndPhreak/MODUS/commit/54a76d970cbdb7dec52819bf07915746f84bc766))
* **web:** scope auth mask to dashboard routes only ([ee239d9](https://github.com/MyndPhreak/MODUS/commit/ee239d9424231c26b338c9bde0491511064a6e2b))


### ♻️ Refactors

* **bot:** add loop field and optional progress bar to now-playing card ([f812548](https://github.com/MyndPhreak/MODUS/commit/f81254809c1eeabb0b7907d2ee565aea2866e378))
* **bot:** convert /nowplaying to the shared now-playing V2 card ([bfec0a5](https://github.com/MyndPhreak/MODUS/commit/bfec0a55df165e399860c3b00c04c6bf30ba0d46))
* **bot:** convert added-to-queue confirmation to Components V2 ([2b579eb](https://github.com/MyndPhreak/MODUS/commit/2b579ebb51e5947f6d9bcef3bf5458b7ca02b1d0))
* **bot:** convert dashboard filter-sync notice to Components V2 ([1ea93ed](https://github.com/MyndPhreak/MODUS/commit/1ea93ed680f9bf517ccea993c6188461569f61d9))
* **bot:** convert dashboard pre-queue-loaded confirmation to Components V2 ([f8a2d1e](https://github.com/MyndPhreak/MODUS/commit/f8a2d1e120830973391664d67124d9bfc7e547da))
* **bot:** convert filter status replies to Components V2 ([8f43bc1](https://github.com/MyndPhreak/MODUS/commit/8f43bc1578b9687780867628767841756985e340))
* **bot:** convert music settings summary to Components V2 ([a523160](https://github.com/MyndPhreak/MODUS/commit/a52316008e30df44c667e83ce601a5d64b46332c))
* **bot:** convert queue-finished notice to Components V2 ([8916567](https://github.com/MyndPhreak/MODUS/commit/8916567e0cf826be749f180b15eb6f4e1c1bcea3))

## [1.15.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.14.0...modus-v1.15.0) (2026-07-26)


### ✨ Features

* **api:** paginate admin servers endpoint with status and premium filters ([556b916](https://github.com/MyndPhreak/MODUS/commit/556b916c735db3c8379ffd621697d362e2bf8b72))
* **db:** add paginated server listing with status/premium filters ([e2b0e45](https://github.com/MyndPhreak/MODUS/commit/e2b0e45273d68644403605ebe2bef9f9ddae736f))
* **web:** render admin servers as paginated table with status/premium filters ([585479e](https://github.com/MyndPhreak/MODUS/commit/585479ecc1be7bd52f46298694edeb4fa0a24717))


### 🐛 Bug Fixes

* **api:** clamp explicit limit=0 to 1 instead of falling back to default ([ea22c3d](https://github.com/MyndPhreak/MODUS/commit/ea22c3d1f0b6f641880f2f2ba7e4b702e0d5f523))
* **api:** require Manage Server permission to register a server ([9258542](https://github.com/MyndPhreak/MODUS/commit/9258542143e17c6cddfc9a03324b2437f786ba3b))
* **db:** add id tie-breaker to listPage ordering for stable pagination ([71132dd](https://github.com/MyndPhreak/MODUS/commit/71132dd2acf099ece9669567cffdd1a5192537fb))
* **db:** map server doc $id to guild_id instead of the row UUID ([e24efa7](https://github.com/MyndPhreak/MODUS/commit/e24efa73c553009e3c23790d20731ee46f08f4a4))
* **web:** allow Manage Server permission to connect guilds to the dashboard ([7f5a9f4](https://github.com/MyndPhreak/MODUS/commit/7f5a9f4707831357431d357d0ccf34b17815fb82))
* **web:** snap back to page 1 when refresh lands on an out-of-range page ([9aaff0f](https://github.com/MyndPhreak/MODUS/commit/9aaff0f16d891863f7c8f09409d7cf344920be05))
* **web:** surface add-server API errors on the discover page ([25d2b55](https://github.com/MyndPhreak/MODUS/commit/25d2b55172ef169375ff2ed18c564b22e8f16c95))

## [1.14.0](https://github.com/MyndPhreak/MODUS/compare/modus-v1.13.0...modus-v1.14.0) (2026-07-06)


### ✨ Features

* add visual trigger builder with wildcard filter support ([a91776a](https://github.com/MyndPhreak/MODUS/commit/a91776aebde7b5015cd8b78570ee6d9dd1b0a17d))
* **bot:** auto-register guilds on join and reconcile presence on boot ([ae4329f](https://github.com/MyndPhreak/MODUS/commit/ae4329f1cb5d4b684faa9b34150f0c4b9412cfaa))
* **bot:** support parallel tool calls with agentic loop in AI module ([3699142](https://github.com/MyndPhreak/MODUS/commit/3699142cfe4482cd8282ce0d517235c25e32ed44))
* **db:** add upsertByGuildId + markOffline on ServerRepository ([7070af8](https://github.com/MyndPhreak/MODUS/commit/7070af88a0c69817f6226faef4126d2478b20afd))


### 🐛 Bug Fixes

* **bot:** register global slash commands from shard 0 only ([99ccddd](https://github.com/MyndPhreak/MODUS/commit/99ccddd06df96fc4a8708a5872c9447b14e4d228))
* **bot:** reply when a command arrives before modules finish loading ([721531b](https://github.com/MyndPhreak/MODUS/commit/721531b36ea78ae9fb01994f11e4a9088398766b))
* **bot:** stop Logger DB failures surfacing as unhandled rejections ([607a601](https://github.com/MyndPhreak/MODUS/commit/607a601249ba0646e22dcf6e983b62fae5c28ae1))
* **web:** stop client permission check from granting access the server won't honor ([e4971ee](https://github.com/MyndPhreak/MODUS/commit/e4971eea1ab810ba0b046b973c5fc5a301eb4451))
* **web:** update legal pages for post-Appwrite infrastructure and Groq disclosure ([afaaa59](https://github.com/MyndPhreak/MODUS/commit/afaaa59a121cb51b677b1af6efcdb6ebf6ed80d4))


### ⚡ Performance

* **bot:** batch server log writes into periodic multi-row inserts ([039f2d5](https://github.com/MyndPhreak/MODUS/commit/039f2d5f8b3305c9ee2787dd892634b7fc169085))


### ♻️ Refactors

* **bot:** auto-register module event listeners via registerEvents hook ([6dc9ec2](https://github.com/MyndPhreak/MODUS/commit/6dc9ec2925c9faa419892a74a0f9187d08eeaa1e))
* **bot:** dedupe button/select/modal dispatch in ModuleManager ([f0e148b](https://github.com/MyndPhreak/MODUS/commit/f0e148b28dc6679be654c63fe79b269a2e71b00d))
* **bot:** rename stale appwrite locals to db and fix stale comments ([ad73fe0](https://github.com/MyndPhreak/MODUS/commit/ad73fe00bc5fafcad8da58ba080165ea2a9444f1))
* **bot:** type BotModule command definitions instead of any ([f42ce13](https://github.com/MyndPhreak/MODUS/commit/f42ce13340bbc0d52621947edad20d077952415c))
* **web:** extract Discord ADMINISTRATOR bit-check into a shared util ([9ac4d85](https://github.com/MyndPhreak/MODUS/commit/9ac4d858ce60f7fd683fb72e47cf55f80a0a1f51))


### 📖 Documentation

* correct BotModule interface description in CLAUDE.md ([5841a2d](https://github.com/MyndPhreak/MODUS/commit/5841a2d0166c2e8b446842867ae13e59bcc0f14a))

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
