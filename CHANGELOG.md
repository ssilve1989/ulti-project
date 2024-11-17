# Changelog

## [1.20.1](https://github.com/ssilve1989/ulti-project/compare/v1.20.0...v1.20.1) (2024-11-17)


### Bug Fixes

* **tasks:** fix clear check cron timer ([94406bb](https://github.com/ssilve1989/ulti-project/commit/94406bb4f4461d257c1b5bb77538bc5d20279520))
* **turboprog:** implement hack to find offset of sheet values when searching spreadsheet ([0c7b3a6](https://github.com/ssilve1989/ulti-project/commit/0c7b3a624072f56bb268709f13a59a985adb888e))

## [1.20.0](https://github.com/ssilve1989/ulti-project/compare/v1.19.0...v1.20.0) (2024-11-11)


### Features

* **signups:** clear-checker cron ([#497](https://github.com/ssilve1989/ulti-project/issues/497)) ([4814608](https://github.com/ssilve1989/ulti-project/commit/4814608d598008e651e9b22de6b4341af8833af9))


### Bug Fixes

* **signups:** fix guildId for clear-checker ([5531c2f](https://github.com/ssilve1989/ulti-project/commit/5531c2ffe49fc29b4994ca2d7e300b43219367e7))

## [1.19.0](https://github.com/ssilve1989/ulti-project/compare/v1.18.2...v1.19.0) (2024-11-10)


### Features

* **lookup:** add notes field to lookup results ([#542](https://github.com/ssilve1989/ulti-project/issues/542)) ([34ee1a9](https://github.com/ssilve1989/ulti-project/commit/34ee1a908714594e4d8bcbaf43acd6b331bfcc9d))

## [1.18.2](https://github.com/ssilve1989/ulti-project/compare/v1.18.1...v1.18.2) (2024-11-04)


### Bug Fixes

* adds transform helper to createFields to assist wit null transformations ([07e222c](https://github.com/ssilve1989/ulti-project/commit/07e222c7b729e38fbab37c651fc0ff17c4c45ed5))

## [1.18.1](https://github.com/ssilve1989/ulti-project/compare/v1.18.0...v1.18.1) (2024-11-03)


### Bug Fixes

* **signups:** fixes prog proof link markdown ([40df444](https://github.com/ssilve1989/ulti-project/commit/40df4447b844ab81b7cb61717878d5a1f242a835))

## [1.18.0](https://github.com/ssilve1989/ulti-project/compare/v1.17.5...v1.18.0) (2024-11-02)


### Features

* **blacklist:** add lodestone-id field ([#533](https://github.com/ssilve1989/ulti-project/issues/533)) ([895167a](https://github.com/ssilve1989/ulti-project/commit/895167a6a80fb565bde454331e0a6350bf59fa1a))
* **signups:** adds a Notes field for additional signup information ([#531](https://github.com/ssilve1989/ulti-project/issues/531)) ([40f2e91](https://github.com/ssilve1989/ulti-project/commit/40f2e910685b12f396d28d6da48c9d148aae255a))

## [1.17.5](https://github.com/ssilve1989/ulti-project/compare/v1.17.4...v1.17.5) (2024-10-30)


### Bug Fixes

* fix coercion of env values ([686ec29](https://github.com/ssilve1989/ulti-project/commit/686ec29dfbb965386079262e309256bd3c15f330))

## [1.17.4](https://github.com/ssilve1989/ulti-project/compare/v1.17.3...v1.17.4) (2024-10-30)


### Miscellaneous Chores

* release v1.17.4 ([e042168](https://github.com/ssilve1989/ulti-project/commit/e0421682d2f65d228ecc887437cab4d9ae70767c))

## [1.17.3](https://github.com/ssilve1989/ulti-project/compare/v1.17.2...v1.17.3) (2024-10-26)


### Bug Fixes

* fixes env var injection ([977e037](https://github.com/ssilve1989/ulti-project/commit/977e037abd34839366c8e2fda5a4327c5a055354))
* **sheets:** fix handling of deleted spreadsheets when requesting metadata ([#513](https://github.com/ssilve1989/ulti-project/issues/513)) ([333e2b3](https://github.com/ssilve1989/ulti-project/commit/333e2b376996b4a2c3347d161c9f4ebe074aa664))

## [1.17.2](https://github.com/ssilve1989/ulti-project/compare/v1.17.1...v1.17.2) (2024-10-17)


### Bug Fixes

* **remove-signup:** find document by props instead of discordId ([#512](https://github.com/ssilve1989/ulti-project/issues/512)) ([4a19268](https://github.com/ssilve1989/ulti-project/commit/4a19268c3a827a71a8a01d2f8c6c838a5f3f41bb)), closes [#509](https://github.com/ssilve1989/ulti-project/issues/509)
* **remove-signup:** handle UPDATE_PENDING as valid status for sheet removal ([#510](https://github.com/ssilve1989/ulti-project/issues/510)) ([93ad9d4](https://github.com/ssilve1989/ulti-project/commit/93ad9d4b354640d661f5425754a4e96de47021a5)), closes [#508](https://github.com/ssilve1989/ulti-project/issues/508)

## [1.17.1](https://github.com/ssilve1989/ulti-project/compare/v1.17.0...v1.17.1) (2024-10-01)


### Miscellaneous Chores

* release v1.17.1 ([e343685](https://github.com/ssilve1989/ulti-project/commit/e343685cb557643c59a1a6ddbf8249c0ac8fe447))

## [1.17.0](https://github.com/ssilve1989/ulti-project/compare/v1.16.1...v1.17.0) (2024-09-24)


### Features

* support application mode configuration for encounters ([#479](https://github.com/ssilve1989/ulti-project/issues/479)) ([af8cc34](https://github.com/ssilve1989/ulti-project/commit/af8cc34046dbef2a32eef3119b22f24b2eb7e9dc))

## [1.16.1](https://github.com/ssilve1989/ulti-project/compare/v1.16.0...v1.16.1) (2024-09-13)


### Bug Fixes

* **blacklist:** fixes an issue where incorrect entries were being updated ([#462](https://github.com/ssilve1989/ulti-project/issues/462)) ([13243a3](https://github.com/ssilve1989/ulti-project/commit/13243a31d863eb2fb81e649da91d1bff997e3f75))

## [1.16.0](https://github.com/ssilve1989/ulti-project/compare/v1.15.1...v1.16.0) (2024-09-10)


### Features

* **blacklist:** adds the ability to maintain a list of suspicious players ([#459](https://github.com/ssilve1989/ulti-project/issues/459)) ([800396f](https://github.com/ssilve1989/ulti-project/commit/800396fca07250499d422da0d049687775eced64))
* **settings:** moderation channel setting ([#458](https://github.com/ssilve1989/ulti-project/issues/458)) ([14cc49f](https://github.com/ssilve1989/ulti-project/commit/14cc49f8863d4b13b188304904af487927a191e7))
* **signups:** publishes alerts on blacklisted signups ([#460](https://github.com/ssilve1989/ulti-project/issues/460)) ([14366de](https://github.com/ssilve1989/ulti-project/commit/14366dee430e98f5b6036efa3ccef8a27cd795a9))


### Bug Fixes

* **settings:** fix cache value setting ([#457](https://github.com/ssilve1989/ulti-project/issues/457)) ([418b47e](https://github.com/ssilve1989/ulti-project/commit/418b47eb3e3aae00b69020bc183250f92bac481a))


### Performance Improvements

* **settings:** cache settings document ([#455](https://github.com/ssilve1989/ulti-project/issues/455)) ([4bedda1](https://github.com/ssilve1989/ulti-project/commit/4bedda13553e75f802071027a2808e060fae122f))

## [1.15.1](https://github.com/ssilve1989/ulti-project/compare/v1.15.0...v1.15.1) (2024-09-10)


### Bug Fixes

* **signups:** fix info channel ref for declined signups ([#452](https://github.com/ssilve1989/ulti-project/issues/452)) ([d928d4a](https://github.com/ssilve1989/ulti-project/commit/d928d4a7fc2771e679402ae2434920842d99ca22))

## [1.15.0](https://github.com/ssilve1989/ulti-project/compare/v1.14.1...v1.15.0) (2024-08-08)


### Features

* **signups:** support Arcadion savage ([#415](https://github.com/ssilve1989/ulti-project/issues/415)) ([b1b3fd7](https://github.com/ssilve1989/ulti-project/commit/b1b3fd734aeaf97313a4ee5c64b12661a38c27a6))

## [1.14.1](https://github.com/ssilve1989/ulti-project/compare/v1.14.0...v1.14.1) (2024-07-24)


### Performance Improvements

* **discord:** cap concurrency for remove-role command ([#397](https://github.com/ssilve1989/ulti-project/issues/397)) ([0b3ae56](https://github.com/ssilve1989/ulti-project/commit/0b3ae56c0cbdc95bda29e33bb3d9d291ec90c6c2))

## [1.14.0](https://github.com/ssilve1989/ulti-project/compare/v1.13.0...v1.14.0) (2024-07-22)


### Features

* add command metrics ([#396](https://github.com/ssilve1989/ulti-project/issues/396)) ([514cc7b](https://github.com/ssilve1989/ulti-project/commit/514cc7b6a8b2d5deb39f8c3885688dc51b50bca3))
* **clean-roles:** remove all prog/clear roles from members and settings ([#388](https://github.com/ssilve1989/ulti-project/issues/388)) ([c7a7f3b](https://github.com/ssilve1989/ulti-project/commit/c7a7f3b6ef4a4736a48db2d1d938339f420cf05a))
* introduce Sentry tracing observability ([#395](https://github.com/ssilve1989/ulti-project/issues/395)) ([b11a007](https://github.com/ssilve1989/ulti-project/commit/b11a007a92adc6aed665d46862b9c618f683ed60))

## [1.13.0](https://github.com/ssilve1989/ulti-project/compare/v1.12.1...v1.13.0) (2024-06-21)


### Features

* add NA world validation ([#360](https://github.com/ssilve1989/ulti-project/issues/360)) ([55c46b3](https://github.com/ssilve1989/ulti-project/commit/55c46b3437623fd64253ca4851365e2d450c56c8))
* **signups:** include member tag when declining signups ([#358](https://github.com/ssilve1989/ulti-project/issues/358)) ([92ef646](https://github.com/ssilve1989/ulti-project/commit/92ef646efb8b95604520e9c2fc68026cd96ea4cc))

## [1.12.1](https://github.com/ssilve1989/ulti-project/compare/v1.12.0...v1.12.1) (2024-06-08)


### Bug Fixes

* **remove-signups:** fix query on finding existing signup ([#341](https://github.com/ssilve1989/ulti-project/issues/341)) ([a52e05f](https://github.com/ssilve1989/ulti-project/commit/a52e05f5ee0091361811541f2fdf550fe5380307))

## [1.12.0](https://github.com/ssilve1989/ulti-project/compare/v1.11.0...v1.12.0) (2024-06-03)


### Features

* check turbo-prog sheet when using remove-signup command ([#332](https://github.com/ssilve1989/ulti-project/issues/332)) ([a682308](https://github.com/ssilve1989/ulti-project/commit/a6823089e3db4497fdca3efbd4fb054dd80f3763))

## [1.11.0](https://github.com/ssilve1989/ulti-project/compare/v1.10.0...v1.11.0) (2024-06-02)


### Features

* removes given roles on signup being marked cleared ([#330](https://github.com/ssilve1989/ulti-project/issues/330)) ([0248726](https://github.com/ssilve1989/ulti-project/commit/0248726f68c1556bfc1a76abe7a570f2d0d7b7f0))

## [1.10.0](https://github.com/ssilve1989/ulti-project/compare/v1.9.7...v1.10.0) (2024-06-02)


### Features

* support clear-ready roles ([#325](https://github.com/ssilve1989/ulti-project/issues/325)) ([1da163c](https://github.com/ssilve1989/ulti-project/commit/1da163c92051e7afbbce84bef9da79695bc4d310))

## [1.9.7](https://github.com/ssilve1989/ulti-project/compare/v1.9.6...v1.9.7) (2024-05-25)


### Miscellaneous Chores

* release 1.9.7 ([e760af5](https://github.com/ssilve1989/ulti-project/commit/e760af5894e59fd7643cb6f5d8891e6b023004d1))

## [1.9.6](https://github.com/ssilve1989/ulti-project/compare/v1.9.5...v1.9.6) (2024-05-24)


### Miscellaneous Chores

* release 1.9.6 ([14234de](https://github.com/ssilve1989/ulti-project/commit/14234de000a615f36c3746664ec6f479e2eb72fe))

## [1.9.5](https://github.com/ssilve1989/ulti-project/compare/v1.9.4...v1.9.5) (2024-05-23)


### Reverts

* undo gateway intent addition ([47ffdb8](https://github.com/ssilve1989/ulti-project/commit/47ffdb8a063d54d6d1f22969b12100a904385b77))

## [1.9.4](https://github.com/ssilve1989/ulti-project/compare/v1.9.3...v1.9.4) (2024-05-21)


### Bug Fixes

* exhaust all possible cases for turbo prog signups ([#300](https://github.com/ssilve1989/ulti-project/issues/300)) ([0696d48](https://github.com/ssilve1989/ulti-project/commit/0696d48ccf1fe371c31b7f4356fbd6a612f04b3c))
* **signups:** handle doc not found for reactions ([#304](https://github.com/ssilve1989/ulti-project/issues/304)) ([4797efc](https://github.com/ssilve1989/ulti-project/commit/4797efcf5c1d158b8c521ae42cabc948b907eb67))

## [1.9.3](https://github.com/ssilve1989/ulti-project/compare/v1.9.2...v1.9.3) (2024-05-20)


### Bug Fixes

* account for pending signups that may be on the sheet ([240e760](https://github.com/ssilve1989/ulti-project/commit/240e760462e30fb9b21d901a0f664eb0b322a428))

## [1.9.2](https://github.com/ssilve1989/ulti-project/compare/v1.9.1...v1.9.2) (2024-05-20)


### Bug Fixes

* include legacy partyType in check for turbo prog ([a70e840](https://github.com/ssilve1989/ulti-project/commit/a70e8401895c38e376cb48ec6b53d8beaa081ed7))

## [1.9.1](https://github.com/ssilve1989/ulti-project/compare/v1.9.0...v1.9.1) (2024-05-20)


### Bug Fixes

* fix member id in string ([bb75677](https://github.com/ssilve1989/ulti-project/commit/bb75677e1b30c4354fb0da1c572484a71b52cd8c))

## [1.9.0](https://github.com/ssilve1989/ulti-project/compare/v1.8.0...v1.9.0) (2024-05-20)


### Features

* **signups:** adding tag and avatar to embed ([#294](https://github.com/ssilve1989/ulti-project/issues/294)) ([0851b83](https://github.com/ssilve1989/ulti-project/commit/0851b834cc9608a4f63fb5cab2d6b04fd46fe8ae))


### Bug Fixes

* **settings:** prevent prog roles from being overridden ([#288](https://github.com/ssilve1989/ulti-project/issues/288)) ([b0fb768](https://github.com/ssilve1989/ulti-project/commit/b0fb768101df4ce1860b8473e8fd52a1b0a825f1))

## [1.8.0](https://github.com/ssilve1989/ulti-project/compare/v1.7.1...v1.8.0) (2024-05-19)


### Features

* **turbo-prog:** add turbo prog command ([#286](https://github.com/ssilve1989/ulti-project/issues/286)) ([908f854](https://github.com/ssilve1989/ulti-project/commit/908f85488f2919db863d4978794d417753f47ab9))

## [1.7.1](https://github.com/ssilve1989/ulti-project/compare/v1.7.0...v1.7.1) (2024-05-19)


### Bug Fixes

* fixes an issue with remove-signup where multiple rows were modified ([#284](https://github.com/ssilve1989/ulti-project/issues/284)) ([cd9af41](https://github.com/ssilve1989/ulti-project/commit/cd9af411e76a6e7a726907890752e779ecc6e758))

## [1.7.0](https://github.com/ssilve1989/ulti-project/compare/v1.6.1...v1.7.0) (2024-05-18)


### Features

* **signups:** now removes prior message  when a new one is submitted ([#280](https://github.com/ssilve1989/ulti-project/issues/280)) ([47c0837](https://github.com/ssilve1989/ulti-project/commit/47c0837debc7cbb7a9a1f440754feb244c094684))
* **signups:** remove-signup  now removes unhandled approval messages ([#282](https://github.com/ssilve1989/ulti-project/issues/282)) ([fd145ea](https://github.com/ssilve1989/ulti-project/commit/fd145ea97df6b78d33cf154f1c3986a3f7232247))
* **signups:** support cleared signups ([#283](https://github.com/ssilve1989/ulti-project/issues/283)) ([417294d](https://github.com/ssilve1989/ulti-project/commit/417294d833b156a285b6acc661a80c89d329b1ce))

## [1.6.1](https://github.com/ssilve1989/ulti-project/compare/v1.6.0...v1.6.1) (2024-05-17)


### Miscellaneous Chores

* release 1.6.1 ([47e4a15](https://github.com/ssilve1989/ulti-project/commit/47e4a158e9078d4e8f79be1c554bfd3a950000ab))

## [1.6.0](https://github.com/ssilve1989/ulti-project/compare/v1.5.0...v1.6.0) (2024-05-16)


### Features

* **signups:** embed now displays coordinator selected prog point ([#273](https://github.com/ssilve1989/ulti-project/issues/273)) ([9bbd5b7](https://github.com/ssilve1989/ulti-project/commit/9bbd5b7013fdd5441d12a4ec159d163cef192793))


### Bug Fixes

* adjusts labels for certain encounters ([#274](https://github.com/ssilve1989/ulti-project/issues/274)) ([af49fc3](https://github.com/ssilve1989/ulti-project/commit/af49fc356e541007a815e45e9e84c086b8212e2d))
* assign correct sentry scoping ([#272](https://github.com/ssilve1989/ulti-project/issues/272)) ([f38d1e1](https://github.com/ssilve1989/ulti-project/commit/f38d1e18cdbf334c5bcf807829186d6e55a9bf04))
* fixes lost punctiation in display formatting ([#270](https://github.com/ssilve1989/ulti-project/issues/270)) ([9eb9ac7](https://github.com/ssilve1989/ulti-project/commit/9eb9ac7a5d73e58e1776b5faabdbd979cf624f77)), closes [#266](https://github.com/ssilve1989/ulti-project/issues/266)
* revert typo for time duration ([8ce8ef9](https://github.com/ssilve1989/ulti-project/commit/8ce8ef98903384d0895105e6636ca2b46de6ad96))
* **signups:** ensure prog links are validated when screenshots are provided ([#275](https://github.com/ssilve1989/ulti-project/issues/275)) ([c365021](https://github.com/ssilve1989/ulti-project/commit/c36502118622a4a182c656b838769f17ba1ebc73))

## [1.5.0](https://github.com/ssilve1989/ulti-project/compare/v1.4.1...v1.5.0) (2024-05-15)


### Features

* **signups:** add prog point to embed ([#261](https://github.com/ssilve1989/ulti-project/issues/261)) ([9fc2aae](https://github.com/ssilve1989/ulti-project/commit/9fc2aaea8dc6274dd981915c526f16cb33b93e38))


### Bug Fixes

* fix typo in label ([6ad7193](https://github.com/ssilve1989/ulti-project/commit/6ad71932f16a3ce833ad5acd97e3032626076889))
* **signups:** fixes an issue with casing on remove signups ([#262](https://github.com/ssilve1989/ulti-project/issues/262)) ([bd6bbfb](https://github.com/ssilve1989/ulti-project/commit/bd6bbfbf2945c1c1d65774416bbfd29b04b5606c))

## [1.4.1](https://github.com/ssilve1989/ulti-project/compare/v1.4.0...v1.4.1) (2024-05-08)


### Miscellaneous Chores

* release 1.4.1 ([6901c52](https://github.com/ssilve1989/ulti-project/commit/6901c522efde2d10f0912fa4a19bca83f0040a78))

## [1.4.0](https://github.com/ssilve1989/ulti-project/compare/v1.3.0...v1.4.0) (2024-04-14)


### Features

* **signups:** add more allowed hosts than fflogs ([#223](https://github.com/ssilve1989/ulti-project/issues/223)) ([477cb72](https://github.com/ssilve1989/ulti-project/commit/477cb720206e3eb57d35aa6ee600e891cc9390d7))

## [1.3.0](https://github.com/ssilve1989/ulti-project/compare/v1.2.9...v1.3.0) (2024-04-14)


### Miscellaneous Chores

* release 1.3.0 ([ce6ba64](https://github.com/ssilve1989/ulti-project/commit/ce6ba647f3397d0f85b7caf939b056ec0538c4cd))

## [1.2.9](https://github.com/ssilve1989/ulti-project/compare/v1.2.8...v1.2.9) (2024-04-01)


### Bug Fixes

* disable googleapis http2 by default ([6072332](https://github.com/ssilve1989/ulti-project/commit/6072332856ffbe655122f0e0efc76009b9e23251))
* reaction error handling ([#196](https://github.com/ssilve1989/ulti-project/issues/196)) ([a7572b4](https://github.com/ssilve1989/ulti-project/commit/a7572b4dfcb7782412541e377f6e743b0678f897))

## [1.2.8](https://github.com/ssilve1989/ulti-project/compare/v1.2.7...v1.2.8) (2024-03-31)


### Bug Fixes

* make casing consistent ([#193](https://github.com/ssilve1989/ulti-project/issues/193)) ([1a5478f](https://github.com/ssilve1989/ulti-project/commit/1a5478f20bff0cb00fbe0128318ab9860c4a7514))

## [1.2.7](https://github.com/ssilve1989/ulti-project/compare/v1.2.6...v1.2.7) (2024-03-24)


### Miscellaneous Chores

* release 1.2.7 ([91d7351](https://github.com/ssilve1989/ulti-project/commit/91d73513457291e5055d8c6b021b6cf924cb9aec))

## [1.2.6](https://github.com/ssilve1989/ulti-project/compare/v1.2.5...v1.2.6) (2024-03-23)


### Bug Fixes

* **signups:** assert casing of character is Capital Case ([#179](https://github.com/ssilve1989/ulti-project/issues/179)) ([d058438](https://github.com/ssilve1989/ulti-project/commit/d058438cc72f0b9df72d996b88c13f81503c0608))

## [1.2.5](https://github.com/ssilve1989/ulti-project/compare/v1.2.4...v1.2.5) (2024-03-23)


### Miscellaneous Chores

* release 1.2.5 ([8ac1df6](https://github.com/ssilve1989/ulti-project/commit/8ac1df6753f97adf88add33b04b24c68ce0cfbb3))

## [1.2.4](https://github.com/ssilve1989/ulti-project/compare/v1.2.3...v1.2.4) (2024-03-20)


### Miscellaneous Chores

* release 1.2.4 ([b68b3c8](https://github.com/ssilve1989/ulti-project/commit/b68b3c80fc9cfa67008b74a3ea6118847138365f))

## [1.2.3](https://github.com/ssilve1989/ulti-project/compare/v1.2.2...v1.2.3) (2024-03-20)


### Miscellaneous Chores

* release 1.2.3 ([d346dc0](https://github.com/ssilve1989/ulti-project/commit/d346dc0119ad02a052ff9b6e8cc0cfd40249454b))

## [1.2.2](https://github.com/ssilve1989/ulti-project/compare/v1.2.1...v1.2.2) (2024-03-20)


### Performance Improvements

* adjust internal discord cache parameters ([#170](https://github.com/ssilve1989/ulti-project/issues/170)) ([ec36c25](https://github.com/ssilve1989/ulti-project/commit/ec36c25c9ec875d2d65096defd9ba2ca1a41d334))

## [1.2.1](https://github.com/ssilve1989/ulti-project/compare/v1.2.0...v1.2.1) (2024-03-19)


### Features

* **signups:** support early prog ([#160](https://github.com/ssilve1989/ulti-project/issues/160)) ([22b284b](https://github.com/ssilve1989/ulti-project/commit/22b284b912754f58fb25657d14ff14b4d69b86c0))


### Bug Fixes

* **signups:** handle urls missing protocol ([#159](https://github.com/ssilve1989/ulti-project/issues/159)) ([1638b53](https://github.com/ssilve1989/ulti-project/commit/1638b538196f05a0e9a5ec3320280c4b37c99b17))


### Miscellaneous Chores

* release 1.2.1 ([fef9134](https://github.com/ssilve1989/ulti-project/commit/fef91345f606ae5b73e9b20cb5c581d664c5decd))

## [1.2.0](https://github.com/ssilve1989/ulti-project/compare/v1.1.0...v1.2.0) (2024-03-13)


### Features

* **lookup:** adds /lookup command to find users availability ([#122](https://github.com/ssilve1989/ulti-project/issues/122)) ([1739ef7](https://github.com/ssilve1989/ulti-project/commit/1739ef707c4763bc67967a4802693165972dbf11))
* **signups:** allow users to remove their own signups ([#73](https://github.com/ssilve1989/ulti-project/issues/73)) ([a6e3455](https://github.com/ssilve1989/ulti-project/commit/a6e3455fed2d3c95bb4ca27b6623456cce27d2eb))
* **signups:** require prog point confirmation upon review ([d5c7f74](https://github.com/ssilve1989/ulti-project/commit/d5c7f74aea6663ae075d9bee176f5aabdc32512a))


### Bug Fixes

* **encounters:** fixes typos and ordering of prog points ([#112](https://github.com/ssilve1989/ulti-project/issues/112)) ([34d6a42](https://github.com/ssilve1989/ulti-project/commit/34d6a4222d8993e19d7e41cd1fd0dd3f19c59218))
* fix summary display bug ([45ead89](https://github.com/ssilve1989/ulti-project/commit/45ead8935a88a95fb27b37097a95bd5a73d8d164))
* **lookup:** make reply ephemeral ([#133](https://github.com/ssilve1989/ulti-project/issues/133)) ([61151cb](https://github.com/ssilve1989/ulti-project/commit/61151cb293bb39042adcb6431e905e3ea851e3a6))
* **settings:** fixes handling undefined progRoles in settings ([#132](https://github.com/ssilve1989/ulti-project/issues/132)) ([3d687a8](https://github.com/ssilve1989/ulti-project/commit/3d687a8e3f7ffca4abbb759852d66ba585ea16d9))
* **sheets:** fixes error in prog party removal indicies ([0b0137d](https://github.com/ssilve1989/ulti-project/commit/0b0137dc5c82157c880f991cc3b1d99628b9c590))
* **signups:** message the signup user not the coordinator on decline ([#115](https://github.com/ssilve1989/ulti-project/issues/115)) ([59768ff](https://github.com/ssilve1989/ulti-project/commit/59768ff6a2785b0d9c2dbaf1d177ca8f74a4cb37))
* **signups:** upgrade prog-party signup to clear party ([f1ceb06](https://github.com/ssilve1989/ulti-project/commit/f1ceb0605318a8809ae6c8a21800ba37338cc31f))

## [1.1.0](https://github.com/ssilve1989/ulti-project/compare/v1.0.0...v1.1.0) (2024-02-05)


### Features

* **signups:** implement remove-signup command ([da949f1](https://github.com/ssilve1989/ulti-project/commit/da949f16dabb6843330e5c85dc63b02800c89318))

## 1.0.0 (2024-01-28)


### Features

* **settings:** implements `/settings` command ([7df51a6](https://github.com/ssilve1989/ulti-project/commit/7df51a6b17878fb7edcd024af833c59fa7464a47))
* **signups:** add firebase integration ([4ccd8a9](https://github.com/ssilve1989/ulti-project/commit/4ccd8a9707373dd140924f7d28a5d1fe44c57b2d))
* **signups:** implement signup review process ([a1d9a7d](https://github.com/ssilve1989/ulti-project/commit/a1d9a7d7fa4b783d18d917cf8c9fbcb2426a8855))
* **signups:** integrate google sheets signup tracking ([ff2314e](https://github.com/ssilve1989/ulti-project/commit/ff2314e278dfd7d5421e91edd35c0a4c1b1b3dea))
* **status-command:** adds `/status` as a slash command ([b896157](https://github.com/ssilve1989/ulti-project/commit/b8961570b89ac3ffb0a092c0f8bb3fca32bf4576))


### Bug Fixes

* fix totem emoji identifiers ([d6e23ee](https://github.com/ssilve1989/ulti-project/commit/d6e23ee01db0cd16fd8851f62d01a04d3f6c7af5))
* fix unhandled exception logging ([5404d03](https://github.com/ssilve1989/ulti-project/commit/5404d03b47059ebefec7b279cc90e2230b1a2f89))
* handle invalid signup reaction request ([060985c](https://github.com/ssilve1989/ulti-project/commit/060985c14b6b5f3e6df6a7ff03902a271fe6ba65))
* **signups:** fix isMe check in shouldHandleReaction ([ce5d9de](https://github.com/ssilve1989/ulti-project/commit/ce5d9de75b74fdb5edf33af1f0e005b8315e63ad))
* **signups:** reset status when updating a signup ([15dd03f](https://github.com/ssilve1989/ulti-project/commit/15dd03ff7167bdc3afa6be0157cc5c3e597f684b))
* **status:** fixes incorrect usage of reply ([052514b](https://github.com/ssilve1989/ulti-project/commit/052514bb713f4d56aae86b3d646fbbb71c817682))
