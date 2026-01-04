# WebCrawler MCP Server

TikTok Shop 데이터 수집을 위한 MCP (Model Context Protocol) 서버입니다.

## 주요 기능

| Tool | 설명 |
|------|------|
| `crawl_bestsellers` | 카테고리별 베스트셀러 상품 크롤링 |
| `crawl_product` | 상품 상세 페이지(PDP) 크롤링 |
| `crawl_reviews` | 상품 리뷰 크롤링 및 감성 분석 |
| `crawl_search` | 검색 결과 크롤링 |
| `crawl_creator` | 크리에이터 프로필 크롤링 |
| `crawl_video` | 비디오 및 태그 상품 크롤링 |
| `crawl_shop` | 샵 정보 크롤링 |
| `get_crawl_status` | 크롤링 작업 상태 조회 |

## 기술 스택

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5+
- **Browser Automation**: Playwright
- **MCP SDK**: @modelcontextprotocol/sdk
- **Validation**: Zod

## 환경 변수

```bash
# 필수
SCRAPECREATORS_API_KEY=your_api_key  # ScrapeCreators API 키

# 선택
LOG_LEVEL=info                        # 로깅 레벨
BROWSER_HEADLESS=true                 # 헤드리스 브라우저 모드
MAX_CONCURRENT_PAGES=3                # 동시 브라우저 페이지 수
PROXY_URL=http://user:pass@proxy:8080 # 프록시 설정 (IP 로테이션)
```

## 빠른 시작

### 로컬 개발

```bash
# 의존성 설치
npm install

# Playwright 브라우저 설치
npx playwright install chromium

# 빌드
npm run build

# 실행
npm start
```

### Docker 실행

```bash
# 이미지 빌드 및 실행
docker compose up -d --build

# HTTP API 모드로 실행 (포트 3000)
docker compose --profile http up -d --build
```

## 문서

- [배포 가이드](./docs/DEPLOYMENT.md) - AWS 배포 방법
- [사용 가이드](./docs/USAGE.md) - MCP 도구 사용법
- [API 레퍼런스](./docs/API.md) - 입출력 스키마 상세

## 프로젝트 구조

```
mcp-webcrawler/
├── src/
│   ├── index.ts              # MCP 서버 엔트리포인트
│   ├── tools/                # MCP 도구 구현
│   ├── extractors/           # 페이지별 데이터 추출기
│   ├── schemas/              # Zod 스키마 정의
│   ├── browser/              # Playwright 브라우저 관리
│   ├── store/                # 엔티티 저장소
│   ├── classifier/           # URL 패턴 분류기
│   ├── normalizer/           # 데이터 정규화
│   └── utils/                # 유틸리티
├── config/                   # CSS 선택자 설정 (YAML)
├── tests/                    # 테스트 코드
├── scripts/                  # 배포 스크립트
├── Dockerfile
└── docker-compose.yml
```

## 라이선스

Private - All rights reserved
