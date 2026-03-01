# Strudel CLI 사용 가이드

## 설치 확인
```bash
strudel --version   # 1.0.0 출력되면 OK. 데이터: ~/.strudel-cli/songs.json
```

## 명령어

| 명령어 | 설명 | 예시 |
|--------|------|------|
| `make` | 곡 만들기 | `strudel make my-beat -c '...'` |
| `play` | 재생 | `strudel play my-beat` / `--ver 1` |
| `stop` / `pause` | 정지 / 일시정지 | `strudel stop` |
| `current` | 현재 상태 확인 | `strudel current` |
| `update` | 곡 수정 (자동 재생) | `strudel update ambient --from "lpf(800)" --to "lpf(1500)"` |
| `detail` | 곡 코드 보기 | `strudel detail ambient --ver 1` |
| `version-change` | 이전 버전으로 전환 | `strudel version-change 1` |
| `sequence` | 버전 시퀀스 자동 전환 | `strudel sequence my-song --versions '[[1,8],[3,12],[2,6]]'` |
| `delete` | 곡 삭제 | `strudel delete my-beat` |
| `rename` | 이름 변경 | `strudel rename my-beat my-groove` |
| `list` | 저장된 곡 목록 | `strudel list` |

```bash
# make 예시: 드럼
strudel make my-beat -c 'setcpm(30) $: s("bd sd [~ bd] sd, hh*8").bank("RolandTR909")'
# make 예시: 멜로디 + 베이스
strudel make ambient -c 'setcpm(18) $: note("<[c3,eb3,g3] [ab2,c3,eb3]>/2").sound("sawtooth").lpf(800).room(.8) $: note("c1").sound("sine").lpf(200).gain(.7)'
# update: 동일 문자열 여러 개일 때 --index 지정 (0부터)
strudel update ambient --from ".room(.8)" --to ".room(.3)" --index 0
# sequence: v1→8초→v3→12초→v2
strudel sequence my-song --versions '[[1,8],[3,12],[2,6]]'
```

> `update`는 수정 후 자동 재생. `version-change`는 재생 중단 없이 이전 버전 코드를 새 버전으로 승격 후 전환.

## 워크플로우
```bash
strudel make lofi -c 'setcpm(22) $: s("bd [~ bd] sd ~").bank("RolandTR808") $: n("<[0,2,4] [1,3,5]>").scale("D:dorian").sound("piano").lpf(1500).room(.4)'
strudel play lofi
strudel update lofi --from "lpf(1500)" --to "lpf(2500)"
strudel detail lofi
strudel play lofi --ver 1    # 이전 버전 복원
strudel stop
```

## 곡 코드 작성 시 주의사항

### 괄호 짝 맞추기
`[ ]` 서브시퀀스 · `< >` 번갈아 재생 · `( )` 유클리드 리듬 — **열었으면 같은 종류로 닫기!**

### 미니노테이션
| 문법 | 의미 | 예시 |
|------|------|------|
| 공백 | 시퀀스 | `"bd sd hh"` |
| `*N` / `/N` | 빠르게 / 느리게 | `"hh*8"` `"[c d e f]/2"` |
| `< >` / `[ ]` | 번갈아 / 그룹 | `"<bd sd>"` `"bd [hh hh] sd"` |
| `,` / `~` | 동시 재생 / 쉼표 | `"bd sd, hh*4"` `"bd ~ sd ~"` |
| `:N` / `@N` / `!N` | 샘플번호 / 길게 / 복제 | `"hh:2"` `"c@3 e"` |

### 노트 이름
소문자 + 옥타브: `c3` `eb3` `f#4` `bb2`. 생략 시 옥타브 3. MIDI 번호 가능: `note("60 64 67")`

### 잘못된 함수명
`.reverb()`→`.room()` · `.lowpass()`→`.lpf()` · `.bpm(120)`→`setcpm(30)` · `.volume()`→`.gain()` · `.synth("saw")`→`.sound("sawtooth")`

### 사운드 선택 우선순위 (권장)

1. **GM 악기 우선 사용** (`gm_*`) — 가장 안정적이고 음색이 풍부함
2. 드럼/드럼머신 (`bd`, `sd`, `.bank("RolandTR909")`) — 리듬용
3. 기본 파형 신스 (`sine`, `triangle`, `sawtooth`, `square`) — 즉시 반응 필요할 때
4. 기타 샘플 악기 (`piano`, `casio`, `jazz` 등) — 스타일용

> 💡 멜로디/화성 파트는 가능하면 `gm_*`로 먼저 작성하고, 이후 필요하면 다른 음색으로 바꾸는 걸 권장합니다.

### 사용 가능한 사운드 목록

**드럼 (내장):** `bd` `sd` `hh` `oh` `cp` `rim` `cr` `rd` `lt` `mt` `ht` `cb`

**드럼 머신** (`.bank()` 사용): `RolandTR808` `RolandTR909` `RolandTR707` `RolandTR505` `AkaiLinn` `RhythmAce` `CasioRZ1` `ViscoSpaceDrum`

**신스 (파형):** `sine` `sawtooth` `square` `triangle` — 네트워크 불필요, 즉시 재생

**샘플 악기 (네트워크 필요):** `piano` `casio` `jazz` `metal` `east` `crow` `space` `wind` `insect` `numbers`

**GM 사운드 (네트워크 필요):** `gm_acoustic_bass` `gm_electric_guitar_muted` `gm_synth_strings_1` `gm_synth_bass_1` `gm_voice_oohs` `gm_blown_bottle` `gm_xylophone` `gm_accordion` `gm_epiano1`

**SoundFonts GM 악기 (추가 — `@strudel/soundfonts`)**

General MIDI 규격의 다양한 악기를 soundfont로 사용할 수 있습니다.

| 분류 | 이름 예시 |
|------|-----------|
| 현악기 | `gm_violin` `gm_cello` `gm_synth_strings_1` |
| 관악기 | `gm_trumpet` `gm_flute` `gm_clarinet` `gm_french_horn` `gm_oboe` |
| 건반 | `gm_acoustic_piano` `gm_epiano1` `gm_harpsichord` |
| 신스/패드 | `gm_pad_warm` `gm_lead_2_sawtooth` |
| 베이스 | `gm_acoustic_bass` `gm_synth_bass_1` |

```bash
# 바이올린 아르페지오
strudel make violin-arp -c 'setcpm(28) $: note("<c4 e4 g4 c5>/2").sound("gm_violin").room(.5).gain(.8)'
# 트럼펫 + 첼로 앙상블
strudel make brass-duo -c 'setcpm(24) $: note("<g4 a4 bb4 c5>").sound("gm_trumpet").gain(.7) $: note("<c3 eb3 g3>").sound("gm_cello").room(.6)'
```

> ⚠️ SoundFont 악기는 **첫 사용 시 sf2 파일을 다운로드/로드**하므로 초기 2~5초 지연이 발생할 수 있습니다. 이후 재생은 즉시 시작됩니다.

### CLI 환경 제약사항
- **AudioWorklet 미지원** — `.shape()` `.crush()` `.coarse()` 등 브라우저 전용 이펙트 사용 불가
- **FM 합성** — `.fm()` 값 8 이상 시 노이즈 심함. CLI에서는 `.fm(1~4)` 권장

## 주의사항 & 팁
- `--code` 값은 **작은따옴표(`'`)**로 감싸기 (큰따옴표는 셸이 해석)
- `--from` 여러 번 매칭 시 에러 → `--index`로 지정하거나 더 구체적인 문자열 사용
- 버전은 자동 관리 — `update`마다 새 버전 생성, `--ver`로 이전 버전 접근
- 데몬 자동 시작/종료 — `play` 시 시작, 30분 비활동 시 종료
- `$:` = 병렬 레이어, `setcpm(N)` = BPM ÷ 4 (예: 120 BPM → `setcpm(30)`)
