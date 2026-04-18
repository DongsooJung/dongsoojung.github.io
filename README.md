# Dongsoo Jung — Personal Portfolio Site

> **Source repository for [dongsoojung.github.io](https://dongsoojung.github.io)**
> AI CEO · 도시 공간 데이터 연구자 · KOI 강사의 개인 포트폴리오

[![Live Site](https://img.shields.io/badge/Live-dongsoojung.github.io-4f7df5?style=flat-square)](https://dongsoojung.github.io)
[![GitHub Pages](https://img.shields.io/badge/Hosted-GitHub%20Pages-222?style=flat-square&logo=github)](https://pages.github.com/)
[![License](https://img.shields.io/badge/Content-CC%20BY--NC%204.0-lightgrey?style=flat-square)](LICENSE)

---

## About

이 리포지토리는 **정동수 개인 소개·연구·프로젝트를 한 장에 정리한 포트폴리오 사이트**의 소스코드입니다. 주식회사 별의문(Stargate Corporation) 법인 사이트([stargate11.com](https://stargate11.com))와 분리된 개인 공간으로, 경력·학문·기술 스택을 담습니다.

**Who I am (요약)**
- 🏢 주식회사 별의문 (Stargate Corp) CEO — AI 소프트웨어
- 🎓 SNU 건설환경공학 스마트도시공학 박사 수료 (공간계량·헤도닉·DID)
- 🏆 시도 정보올림피아드 대상 · 공군참모총장상
- 📚 대치동 KOI(수학정보올림피아드) 전문 강사
- 🎖 대구과학고 17기 · 만 17세 SNU 최연소 입학

상세 내역은 [프로필 README](https://github.com/DongsooJung)를 참고해 주세요.

## Tech Stack

- **Frontend**: Vanilla HTML + CSS (프레임워크 없음)
- **Typography**: Instrument Serif · DM Sans · JetBrains Mono (Google Fonts)
- **Design Tokens**: CSS custom properties, 다크 테마 기본
- **Hosting**: GitHub Pages (무료, HTTPS)
- **SEO**: OpenGraph 메타태그, 한국어 최적화

```
dongsoojung.github.io/
├── index.html          ← 싱글 페이지 포트폴리오
└── README.md           ← (이 파일)
```

## Design Philosophy

- **Instrument Serif 헤드라인 + DM Sans 본문** 조합으로 학술성·전문성 강조
- 다크 배경 `#0a0a0c` + 골드 포인트 `#c4a265` — Stargate 법인 브랜드(Navy/Gold)와 연속성 유지
- 프레임워크·빌드스텝 zero — **단일 HTML 파일 하나로 완결**되어 유지보수 부담 최소화

## Local Preview

```bash
git clone https://github.com/DongsooJung/dongsoojung.github.io.git
cd dongsoojung.github.io
python -m http.server 8000
# → http://localhost:8000
```

## 관련 사이트

| URL | 용도 |
|-----|------|
| [dongsoojung.github.io](https://dongsoojung.github.io) | **개인 포트폴리오** (이 리포) |
| [stargate11.com](https://stargate11.com) | 주식회사 별의문 법인 홈페이지 |
| [stargateedu.co.kr](https://stargateedu.co.kr) | STARGATE EDU (대치동 수학·KOI 전문 교육) *준비 중* |
| [github.com/DongsooJung](https://github.com/DongsooJung) | GitHub 프로필 |

## Contact

- 📧 jds068888@gmail.com
- 🌐 [stargate11.com](https://stargate11.com)
- 📍 서울 강남구 대치동

## License

- **Code**: MIT License (HTML/CSS 자유 사용)
- **Content** (텍스트·약력·프로필 이미지): CC BY-NC 4.0 — 비상업적 사용 시 출처 표기 조건

---

> *Building at the intersection of urban space, artificial intelligence, and education.*
