# Strudel CLI

터미널에서 [Strudel](https://strudel.cc/) 라이브 코딩 음악을 재생하는 CLI 도구입니다.

## 주요 기능

- 🎵 터미널에서 Strudel 패턴을 직접 재생
- 🎹 Tonal, Mini-notation 등 Strudel 패키지 지원
- ⚡ 데몬 모드로 빠른 패턴 전환
- 💾 패턴 저장 및 불러오기

## 설치

```bash
# Node.js 18 이상 필요
npm install -g .
```

## 사용법

```bash
# 패턴 직접 재생
strudel play "s(\"bd sd hh sd\")"

# 데몬 모드 시작
strudel daemon start

# 저장된 패턴 목록
strudel list
```

## 개발

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run dev

# 빌드
npm run build
```

## 기술 스택

- TypeScript
- [@strudel](https://strudel.cc/) 코어 패키지
- [node-web-audio-api](https://github.com/AntoineMissworking/node-web-audio-api) (Node.js 오디오 출력)
- Commander.js (CLI 프레임워크)

## 라이선스

MIT
