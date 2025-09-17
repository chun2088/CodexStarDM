# 소프트웨어 요구사항 명세서 (SRS)

## 시스템 설계
- **단일 PWA (한국 전용)**: 모바일 우선 반응형 웹앱, PWA 설치 가능. 역할 기반 UX: **고객 / 점주 / 영업** (로그인 후 자동 라우팅).
- **핵심 플로우**
  - 고객: 검색/열람 → **클레임** → **월렛 저장** → **동적 QR(120초)** → 매장 제시/사용 처리
  - 점주: 초대코드 온보딩 → **구독 결제(월/연)** → 쿠폰 생성/수정/관리 → **스캔·사용 처리**
  - 영업: 점포 리스트(담당 점포만) → 쿠폰 승인/반려 → 초대코드 발급
- **구독/결제**: 반복 구독(월/연), 자동 갱신, 실패 시 재시도, 상태 기반 기능 접근 (**활성 / 유예 / 해지됨**)

## 아키텍처 패턴
- **Monolithic Next.js (App Router)** + **서버리스 API Routes**, Vercel 배포
- **Supabase** (Postgres + 인증 + 실시간 + 스토리지)
- **토스페이먼츠 BillingKey** 연동 (KRW 구독 결제) + 웹훅 동기화
- **MCP 기반 개발**: Toss Payments MCP, Supabase/Postgres MCP, Vercel/Next.js MCP 어댑터 활용

## 상태 관리
- **UI 로컬 상태**: React hooks / Context API  
- **서버 상태**: TanStack Query (캐싱, SWR, 낙관적 업데이트)  
- **세션/역할**: Supabase 인증 세션 + 역할 매핑(고객/점주/영업)  
- **실시간**: Supabase Realtime (쿠폰 상태, 사용 이벤트)

## 데이터 흐름
- 클라이언트(Next.js) ↔ API Routes ↔ Supabase (CRUD)  
- **매직링크**: 이메일 입력 → 링크 발송 → 클릭 → 세션 생성 (TTL ~15분, 1회성)  
- **QR 사용 처리(120초)**: 월렛이 QR 토큰 생성 → 점주 스캔 → 서버 검증 및 원자적 사용 처리(중복 불가)  
- **결제 이벤트**: Toss → 웹훅 → `subscriptions`/`invoices` 업데이트 → Supabase Realtime → UI 반영  

## 기술 스택
- **프론트엔드**: Next.js(TypeScript), TailwindCSS, PWA(workbox), 카메라(MediaDevices), QR(qrcode/jsQR)  
- **백엔드**: Next.js API Routes(Node.js), Supabase(Postgres, RLS, Auth, Storage)  
- **결제**: Toss Payments (KRW 구독 결제, 웹훅)  
- **DevOps**: Vercel(CI/CD, preview), Supabase Cloud  
- **MCP**: Toss Payments MCP, Supabase/Postgres MCP, Vercel/Next.js MCP 어댑터  

## 인증 프로세스
- **비밀번호 없는 이메일 매직링크**
  - 사용자 이메일 입력 → 매직링크 발송 → 클릭 → 즉시 로그인
  - TTL ~15분, 1회용 토큰, 서버에는 해시만 저장
- **딥링크/PWA 복귀** 지원  
- **차기 확장**: 구글 OAuth, 카카오/SMS OTP  

## 라우트 설계
- **공용**: `/`, `/login`, `/search`, `/coupon/:id`  
- **로그인 후 라우팅**: `/home` → 역할별 자동 리다이렉트  
  - 고객: `/c/home`, `/c/search`, `/c/wallet`, `/c/coupon/:id`  
  - 점주: `/m/home`, `/m/coupons`, `/m/coupons/:id/edit`, `/m/scan`, `/m/subscription`  
  - 영업: `/s/home`, `/s/stores`, `/s/approvals`, `/s/invite-codes`  
- **API**: `/api/*` (auth, coupons, wallet/qr, redeem, scan, billing, approvals)  
- **웹훅**: `/api/webhooks/toss`  

## API 설계
- **인증**
  - `POST /api/auth/magiclink` — 매직링크 요청
  - `GET /api/auth/callback` — 세션 확정
- **고객**
  - `GET /api/coupons` — 쿠폰 목록/필터
  - `POST /api/coupons/:id/claim` — 쿠폰 클레임 후 월렛 저장
  - `POST /api/wallet/:walletId/qr` — 120초 QR 생성
- **점주**
  - `POST /api/stores` — 초대코드로 매장 온보딩
  - `GET/POST /api/coupons` — 쿠폰 생성/수정 (상태: **초안 / 승인대기 / 활성 / 일시중지 / 보관됨**)  
  - `POST /api/scan/verify` — 스캔 모드 QR 검증 및 사용 처리  
  - **구독(토스)**
    - `POST /api/billing/initialize` — BillingKey 등록
    - `POST /api/billing/subscribe` — 구독 생성/활성화
    - `POST /api/billing/cancel` — 구독 해지
- **영업**
  - `GET /api/s/stores` — 담당 점포 조회/관리
  - `POST /api/coupons/:id/approve` / `POST /api/coupons/:id/reject` — 쿠폰 승인/반려
  - `POST /api/invite-codes` — 초대코드 발급
- **웹훅(토스)**
  - `POST /api/webhooks/toss` — 이벤트 수신 → `subscriptions`/`invoices` 업데이트  

## 데이터베이스 설계 ERD
- **users** (id, email, role[고객|점주|영업])  
- **sales_profiles** (user_id PK, name)  
- **merchants** (id, owner_user_id, name, status)  
- **stores** (id, merchant_id, name, address, status)  
- **coupons** (id, store_id, title, description, terms, status[Draft|Pending|Active|Paused|Archived])  
- **wallets** (id, user_id, coupon_id, state[클레임됨|사용됨|만료], claimed_at, used_at)  
- **qr_tokens** (id, wallet_id, token_hash, expires_at, used_at)  
- **subscriptions** (id, merchant_id, plan[월/연], status[active|grace|canceled], toss_billing_key, toss_customer_id, current_period_end)  
- **invoices** (id, subscription_id, amount_krw, period_start, period_end, status)  
- **invite_codes** (id, code, sales_user_id, store_id?, status, expires_at)  
- **events** (id, type[쿠폰_클레임|쿠폰_사용|구독_*], payload_json, created_at)  
