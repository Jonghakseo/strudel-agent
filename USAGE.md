# Strudel CLI 사용 가이드

## 설치 확인

```bash
strudel --version   # 1.0.0 출력되면 OK. 데이터: ~/.strudel-cli/songs.json
```

## 명령어

### `make` — 곡 만들기

```bash
# 기본 비트
strudel make my-beat -c 'setcpm(30) $: s("bd sd [~ bd] sd, hh*8").bank("RolandTR909")'

# 멜로디 + 베이스
strudel make ambient -c 'setcpm(18) $: note("<[c3,eb3,g3] [ab2,c3,eb3]>/2").sound("sawtooth").lpf(800).room(.8) $: note("c1").sound("sine").lpf(200).gain(.7)'
```

### `play` — 재생

```bash
strudel play my-beat          # 최신 버전 재생
strudel play my-beat --ver 1  # 특정 버전 재생
```

### `stop` / `pause` — 정지 / 일시정지

```bash
strudel stop    # 완전 정지
strudel pause   # 일시정지
```

### `current` — 현재 상태 확인

```bash
strudel current   # 재생 중인 곡 이름, 버전, 코드 표시
```

### `update` — 곡 수정 (자동 재생)

```bash
# 필터 값 변경
strudel update ambient --from "lpf(800)" --to "lpf(1500)"

# 드럼 패턴 변경
strudel update my-beat --from 'hh*8' --to 'hh*16'

# 동일 문자열이 여러 개일 때 인덱스 지정 (0부터)
strudel update ambient --from ".room(.8)" --to ".room(.3)" --index 0
```

> `update`는 수정 후 자동으로 변경된 코드를 재생합니다.

### `detail` — 곡 코드 보기

```bash
strudel detail ambient          # 최신 버전
strudel detail ambient --ver 1  # v1 코드 확인
```

### `version-change` — 이전 버전으로 부드럽게 전환

```bash
# 현재 재생 중인 곡의 v1 코드를 새 버전으로 복원하고 즉시 전환
strudel version-change 1

# 특정 곡 지정
strudel version-change 2 --name ambient
```

> 재생을 멈추지 않고 이전 버전의 코드를 새 최신 버전으로 추가한 뒤 부드럽게 전환합니다.

### `sequence` — 버전 시퀀스 자동 전환

```bash
# v1 → 8초 대기 → v3 → 12초 대기 → v2 (완료)
strudel sequence my-song --versions '[[1,8],[3,12],[2,6]]'
```

- 지정한 버전들을 순서대로 새 최신 버전으로 승격하고 즉시 `evaluate` 전환 (재생 중단 없음)
- 각 단계 사이에 지정한 초만큼 대기
- 마지막 단계 적용 후 종료

### `delete` — 곡 삭제

```bash
strudel delete my-beat
```

### `rename` — 곡 이름 변경

```bash
strudel rename my-beat my-groove
```

### `list` — 저장된 곡 목록

```bash
strudel list
```

## 워크플로우 (곡 만들기 → 재생 → 수정 → 재생)

```bash
# 1. 곡 생성
strudel make lofi -c 'setcpm(22) $: s("bd [~ bd] sd ~").bank("RolandTR808").swing(4) $: n("<[0,2,4] [1,3,5]>").scale("D:dorian").sound("piano").lpf(1500).room(.4)'

# 2. 재생
strudel play lofi

# 3. 들으면서 수정 (자동 재생됨)
strudel update lofi --from "lpf(1500)" --to "lpf(2500)"
strudel update lofi --from "swing(4)" --to "swing(4).degradeBy(.15)"

# 4. 코드 확인
strudel detail lofi

# 5. 이전 버전으로 돌아가기
strudel play lofi --ver 1

# 6. 정지
strudel stop
```

## 곡 코드 작성 시 주의사항

### 괄호 짝 맞추기 (가장 흔한 실수)
```
❌ note("<g5 bb5> [~ d6>")     ← < > 와 [ ] 가 섞여서 닫힘
✅ note("<g5 bb5> [~ d6]")     ← 각각 올바르게 닫힘
```
- `[ ]` — 서브시퀀스 (그룹핑)
- `< >` — 사이클당 하나씩 번갈아 재생
- `( )` — 유클리드 리듬 `"bd(3,8)"`
- **열었으면 같은 종류로 닫기!** 중첩 가능하지만 교차하면 파싱 에러

### 미니노테이션 빠른 참조
| 문법 | 의미 | 예시 |
|------|------|------|
| 공백 | 시퀀스 | `"bd sd hh"` |
| `*N` | 빠르게 | `"hh*8"` |
| `/N` | 느리게 | `"[c d e f]/2"` |
| `< >` | 번갈아 | `"<bd sd rim>"` |
| `[ ]` | 그룹 | `"bd [hh hh] sd"` |
| `,` | 동시 재생 | `"bd sd, hh*4"` |
| `~` | 쉼표 | `"bd ~ sd ~"` |
| `:N` | 샘플 번호 | `"hh:2"` |
| `@N` | 길게 | `"c@3 e"` |
| `!N` | 복제 | `"c!3 e"` |

### 노트 이름 규칙
```
✅ c3, eb3, f#4, bb2, a4    ← 소문자 + 옥타브
❌ C3, Eb3, am3, H2          ← 대문자, 존재하지 않는 노트명
```
- `b` = B 노트, `bb` = B♭ (플랫), `#` = 샤프
- 옥타브 생략하면 기본 3 (`c` = `c3`)
- MIDI 번호도 가능: `note("60 64 67")` = C4 E4 G4

### 존재하지 않는 함수명 (흔한 실수)
| ❌ 잘못된 이름 | ✅ 올바른 이름 |
|---------------|---------------|
| `.reverb()` | `.room()` |
| `.lowpass()` | `.lpf()` |
| `.bpm(120)` | `setcpm(30)` |
| `.volume()` | `.gain()` |
| `.synth("saw")` | `.sound("sawtooth")` |

### 사용 가능한 사운드 목록

**드럼 (기본 내장)**
`bd` `sd` `hh` `oh` `cp` `rim` `cr` `rd` `lt` `mt` `ht` `cb`

**드럼 머신** (`.bank()` 사용)
`RolandTR808` `RolandTR909` `RolandTR707` `RolandTR505` `AkaiLinn` `RhythmAce` `CasioRZ1` `ViscoSpaceDrum`
```
s("bd sd [~ bd] sd, hh*8").bank("RolandTR909")
```

**신스 (파형)**
`sine` `sawtooth` `square` `triangle`

**샘플 악기 (네트워크 필요 — 첫 재생 시 다운로드)**
`piano` `casio` `jazz` `metal` `east` `crow` `space` `wind` `insect` `numbers`

**GM 사운드 (네트워크 필요)**
`gm_acoustic_bass` `gm_electric_guitar_muted` `gm_synth_strings_1` `gm_synth_bass_1` `gm_voice_oohs` `gm_blown_bottle` `gm_xylophone` `gm_accordion` `gm_epiano1`

**Soundfonts GM 악기 (추가 — `@strudel/soundfonts`)**
`gm_violin` `gm_trumpet` `gm_flute` `gm_cello` `gm_french_horn` `gm_clarinet` `gm_oboe` 등 다양한 GM 악기를 soundfont로 사용할 수 있습니다.
```
note("c4 e4 g4 c5").sound("gm_violin").room(.5)
```

> 💡 신스(`sine`, `sawtooth` 등)는 네트워크 없이 즉시 재생됩니다.
> 샘플/GM 사운드는 첫 재생 시 다운로드되므로 초반 1~2초 지연이 있을 수 있습니다.

### CLI 환경 제약사항
- **AudioWorklet 미지원** — `.shape()`, `.crush()`, `.coarse()` 등 일부 이펙트는 소리가 안 남 (브라우저 전용 기능)
- **FM 합성 주의** — `.fm()` 값이 높으면 (8 이상) 노이즈가 심할 수 있음. CLI에서는 `.fm(1~4)` 권장
- **샘플 첫 로딩** — 피아노, GM 사운드 등은 네트워크에서 다운로드됨. 첫 재생 시 약간의 지연 후 정상 동작

## 주의사항 & 팁

- **`--code` 값은 작은따옴표(`'`)로 감싸세요** — 큰따옴표는 셸이 먹음
- **`--from`이 여러 번 매칭되면 에러** → `--index`로 지정하거나 더 구체적인 문자열 사용
- **`update`는 find & replace** — 변경할 부분만 정확히 지정
- **버전은 자동 관리됨** — `update`할 때마다 새 버전 생성, 이전 버전은 `--ver`로 접근
- **데몬은 자동 시작/종료** — `play` 시 자동 시작, 30분 비활동 시 자동 종료
- **`$:`는 병렬 레이어**, **`setcpm(N)`** = BPM ÷ 4 (예: 120 BPM → `setcpm(30)`)
