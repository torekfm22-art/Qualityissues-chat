# 품질톡 정리기

텔레그램 품질 채팅방(또는 카카오톡 대화 내보내기)에서 **부적합 톡을 자동 수집**하고, **일일 단위 엑셀**로 정리하는 현장용 웹 도구입니다.

## 핵심 기능

- **텔레그램 봇 연동**: 채팅방 메시지를 폴링/웹훅으로 수집
- **일일 엑셀**: KST 기준 날짜별 `.xlsx` 생성 (`data/exports/`)
- **카카오톡**: 공식 그룹 읽기 API가 없어 **대화 내용 내보내기 .txt** 업로드로 연동
- **수동 붙여넣기**: 보조 입력 탭으로 유지
- **데모 수집**: 봇 토큰 없이 흐름 체험
- **패턴 1차 → LLM 2차**: 규칙 파서가 먼저 처리하고, QC처럼 보이는데 패턴이 실패한 톡만 LLM(또는 로컬 보조)으로 보완

인식 필드: 발생일시, 보고자, 차종, 품명, 품번, 불량 현상, 공정번호, 수량, 로트, 라인/설비, 조치내용, 비고

## 실행

```bash
npm install
cp .env.example .env.local   # TELEGRAM_BOT_TOKEN / OPENAI_API_KEY 설정 (선택)
npm run dev                  # http://localhost:3847
```

`OPENAI_API_KEY`(또는 `LLM_API_KEY`)가 없으면 LLM 단계는 **로컬 휴리스틱 보조**로 동작합니다. LLM으로 채운 행은 비고에 `〔LLM 보조〕` 표시와 `needsReview` 플래그가 붙습니다.

상시 수집(폴링) 워커:

```bash
TELEGRAM_BOT_TOKEN=xxxxx npm run collector
```

웹 UI와 워커를 함께 켜 두면, 채팅방 톡이 쌓이고 설정한 KST 시각 이후 일일 엑셀이 `data/exports/` 에 저장됩니다.

## 텔레그램 설정 (주 연동 방식)

상세 절차는 [docs/TELEGRAM.md](./docs/TELEGRAM.md) 를 보세요.

1. `@BotFather` → 봇 생성 → `/setprivacy` **Disable**  
2. 품질 부적합 그룹에 봇 초대  
3. UI **텔레그램 연동**에 토큰 저장 → 채팅방 ID 검색  
4. `npm run collector` (로컬 폴링) 또는 웹훅 등록  
5. **오늘 엑셀 다운로드** / `data/exports/`

## 카카오톡

카카오톡 일반 채팅방은 외부 앱이 실시간으로 읽을 수 없습니다.  
채팅방 → 대화 내용 내보내기 → `.txt` 업로드 탭에서 가져와 같은 일일 엑셀에 합칩니다.

## 기술 스택

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- ExcelJS
- 로컬 JSON 저장소 (`data/store.json`, gitignore)
