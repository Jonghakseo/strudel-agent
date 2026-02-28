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

## 주의사항 & 팁

- **`--code` 값은 작은따옴표(`'`)로 감싸세요** — 큰따옴표는 셸이 먹음
- **`--from`이 여러 번 매칭되면 에러** → `--index`로 지정하거나 더 구체적인 문자열 사용
- **`update`는 find & replace** — 변경할 부분만 정확히 지정
- **버전은 자동 관리됨** — `update`할 때마다 새 버전 생성, 이전 버전은 `--ver`로 접근
- **데몬은 자동 시작/종료** — `play` 시 자동 시작, 30분 비활동 시 자동 종료
- **`$:`는 병렬 레이어**, **`setcpm(N)`** = BPM ÷ 4 (예: 120 BPM → `setcpm(30)`)
