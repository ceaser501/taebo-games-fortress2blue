# taebo-games-fortress2blue

포트리스2 블루 스타일의 턴제 포격 게임 (브라우저, HTML5 Canvas). 게임은 `fortress/` 폴더에 있습니다.

- 원본 데이터: 비공개 저장소 `ceaser501/taebo-games-fortress2blue-assets`
  (안드로이드판 APK의 `assets/Resource.zip`을 푼 `Resource/` 폴더)
- 구조는 `ceaser501/taebo-games-worms`를 따릅니다.

## 원본 데이터 변환

```bash
npm run fortress:assets -- ../taebo-games-fortress2blue-assets
```

`fortress/assets/f2/`에 그림(PNG)·효과음(WAV)·음악(OGG)과 `manifest.json`을 만듭니다. 이 폴더는 git에 올리지 않습니다.

| 원본 | 형식 | 변환 결과 |
|---|---|---|
| `RIFF "ICS "` 1,322개 | 프레임별 24비트 RLE 스프라이트 (투명색 키, 기준점, 프레임 시간) | `sprites/<id>.png` (프레임을 가로로 이어 붙임) |
| `RIFF "WAVE"` 55개 | PCM 22kHz | `sfx/<id>.wav` |
| `OggS` 24개 | Vorbis | `music/<id>.ogg` |

- `fortress/tools/f2-formats.mjs`: 형식 해독, PNG 인코더
- `fortress/tools/f2-names.mjs`: 파일 번호 ↔ 탱크·맵·패널 대응표 (원본에 이름이 없어 그림을 보고 정함)
- `fortress/tools/convert-assets.mjs`: 변환 스크립트
