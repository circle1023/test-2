# REPORT STUDIO — Vercel 웹서비스

기존 보고서 검토 화면과 Gemini 분석 기능을 프런트엔드 + Node.js 서버 API로 분리한 프로젝트입니다. **HTML 파일을 더블클릭하는 방식이 아니라 서버로 실행합니다.**

## Vercel 배포

1. 이 폴더의 **내용 전체**를 GitHub 저장소 루트에 올립니다. `public`이나 `dist`만 업로드하지 마세요.
2. Vercel → Add New → Project → 해당 저장소 Import.
3. Framework Preset: **Other**. Root Directory: `package.json`, `vercel.json`이 있는 폴더.
4. Build Command: `npm run build`, Output Directory: `dist`. Node.js: **22.x**.
5. Deploy. 설정은 `vercel.json`에도 포함되어 있습니다.

API 키 환경 변수는 필요하지 않습니다. 각 사용자가 사이트 상단에서 본인의 Gemini API 키를 입력합니다. 모델은 서버에서 자동 선택합니다. 선택적으로 관리자만 `GEMINI_MODEL` 환경 변수로 우선 사용할 모델 이름을 지정할 수 있습니다. 해당 모델이 목록에 있으면 먼저 사용하며 404 발생 시 다른 모델로 재시도합니다.

기존 Sites 주소와 별개인 프로젝트입니다. Vercel 배포가 완료되면 Vercel이 발급하는 주소를 사용하세요. GitHub 연결이나 Vercel 실제 배포는 이 압축파일 생성 과정에서 수행하지 않았습니다.

## 로컬 실행

Node.js 22.x 설치 후 프로젝트 폴더에서 실행합니다. npm 패키지 의존성은 없습니다.

```sh
npm run dev
```

`http://localhost:3000`을 엽니다. 프런트엔드와 API가 같은 서버에서 동작합니다.

```sh
npm test
npm run build
```

`PORT`와 `GEMINI_MODEL`은 실행 환경 변수로 지정합니다. `.env.example`은 참고용이며 로컬 개발 서버가 `.env` 파일을 자동으로 읽지는 않습니다. Vercel 환경 변수는 Vercel 프로젝트 Settings에서 설정하세요.

## 구조

| 경로 | 역할 |
| --- | --- |
| `public/` | 업로드, 분석 화면, 결과 표시·다운로드 |
| `api/analyze.js` | 보고서 분석 API |
| `api/connection.js` | 짧은 실제 생성 요청으로 연결 확인 |
| `lib/gemini.js` | 서버 전용 Gemini 연결·모델 자동 선택 |
| `lib/review.js`, `lib/schema.js` | 프롬프트·출력 구조·입출력 검증 |
| `lib/http.js` | 요청 검증·안전한 오류 응답 |
| `scripts/dev.mjs` | 개발용 로컬 HTTP 서버 |
| `scripts/build.mjs` | 정적 프런트엔드 빌드 |
| `test/` | 모의 Gemini 응답 기반 API 테스트 |
| `vercel.json` | 빌드·함수 실행 시간·보안 헤더 |

브라우저 → 같은 도메인의 `/api/analyze` → Google Gemini 순으로 요청합니다. 브라우저 코드에 Google API 주소, 프롬프트, 응답 스키마는 포함하지 않습니다. 범용 프록시가 아니므로 사용자가 외부 URL이나 임의 Gemini 요청 본문을 지정할 수 없습니다.

## 기능과 제한

- PDF 최대 **3,000,000바이트(3MB)**. Base64 변환 후에도 Vercel 함수의 4.5MB 요청 제한 안에 들어가도록 제한했습니다. 스캔 PDF도 Gemini에 원문으로 전달합니다.
- DOCX·TXT·MD 최대 **10,000,000바이트(10MB)**, 추출된 본문 최대 **120,000자**. DOCX는 브라우저에서 Mammoth 1.8.0으로 본문만 추출합니다. DOCX 이미지 내용은 분석하지 않습니다.
- DOCX 파서는 jsDelivr에서, 배경 이미지는 Unsplash에서 불러옵니다. 해당 CDN이 차단되면 DOCX 읽기 또는 배경 이미지에 영향이 있습니다. 본문 붙여넣기는 계속 사용할 수 있습니다.
- 서버 제한 시간 110초, Vercel 함수 설정 120초. 프로젝트 플랜의 실행 시간 지원 여부를 확인하세요.
- 연결 확인도 실제 짧은 생성 요청이므로 Gemini 할당량을 소모합니다.
- 모델 목록 조회·404 대체·결과 형식 검증을 수행합니다. 429는 자동 재시도하지 않습니다.
- API 키는 입력란 메모리에만 두며 저장하지 않습니다. 사이트 서버와 Google로 요청 시 전송됩니다. 서버 로그에 키·본문·Google 원문 오류를 출력하지 않습니다. Google 정책에 따른 데이터 처리는 별도입니다.
- 사용자별 로그인·분석 기록·파일 보관 기능은 없습니다. 각 사용자가 자신의 API 키를 쓰는 무상태 서비스입니다. 공용 유료 API 키를 서버에 넣는 모드는 제공하지 않습니다.
- 서버에서 호출하므로 HTTP referrer 제한이 걸린 브라우저 전용 키는 사용할 수 없습니다. Google Cloud에서 Generative Language API 권한이 있는 서버 호출용 키를 사용하세요.
- 취소 버튼은 브라우저 대기를 중단합니다. Vercel에 이미 전달된 작업은 서버 제한 시간까지 잠시 계속될 수 있습니다.

## 확인한 범위

자동 테스트는 입력 검증, PDF 크기·형식, 메서드 제한, 모델 선택과 404 대체, 429 처리, 결과 스키마·점수, API 키 비노출을 모의 응답으로 검증합니다. 실제 Gemini 키를 사용한 생성, Vercel 실배포 및 브라우저 화면 검증은 별도 확인이 필요합니다.

공식 참고: [Vercel 함수 제한](https://vercel.com/docs/functions/limitations), [Node.js 함수](https://vercel.com/docs/functions/runtimes/node-js), [함수 실행 시간](https://vercel.com/docs/functions/configuring-functions/duration), [Gemini 모델 API](https://ai.google.dev/api/models).
