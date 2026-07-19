# 국내 VPS 환율 자동 갱신 키트

수출입은행 환율 API는 해외(GitHub Actions) IP를 차단합니다. 이 키트를 **한국에 있는
서버/PC**(네이버 클라우드·카페24·가비아·AWS 서울 리전 EC2, 또는 상시 켜둔 국내 PC)에서
**한 번만 설치**하면, 이후 **매월 스스로** 환율을 수집·커밋·푸시합니다. 사람이 손댈 일이 없습니다.

> 참고: 금리·물가(한국은행 ECOS)는 이미 GitHub Actions에서 정상 자동 갱신됩니다.
> 이 키트는 **환율(수출입은행)만** 담당하며, ECOS와 파일이 달라 서로 충돌하지 않습니다.

## 사전 준비
- 한국 리전 VPS 또는 상시 켜둔 국내 PC (Linux, `git`·`python3`·`cron`)
- **수출입은행 인증키**
- **GitHub Fine-grained PAT** — `dongsoojung.github.io` 저장소에 대해 **Contents: Read and write** 권한만
  (github.com → Settings → Developer settings → Fine-grained tokens)

## 설치 (한 번만)

```bash
# 1) 저장소를 받아 vps 폴더로 이동 (또는 이 폴더만 복사)
git clone https://github.com/DongsooJung/dongsoojung.github.io.git
cd dongsoojung.github.io/exchange-rate/vps

# 2) 설정 파일 작성 (키 채우기)
cp exim-update.env.example /etc/exim-update.env
chmod 600 /etc/exim-update.env
vi /etc/exim-update.env        # EXIM_API_KEY, GH_TOKEN 입력

# 3) 설치 — 최초 수집 + 매월 자동 실행 등록
bash install.sh /etc/exim-update.env
```

설치가 끝나면 최초 1회 수집이 즉시 실행되어 `data.json`이 `sourceMode: "api"` 정밀치로
바뀌고, 이후 **매월 2일 자동 실행**됩니다. (첫 실행은 2024년 이후 전 영업일을 받아 몇 분 소요,
이후엔 최근 2개월만 재수집해 수초 내 완료)

## 확인
```bash
tail -f ~/exim-update.log         # 다음 자동 실행 로그
crontab -l | grep exim-dashboard  # 등록된 스케줄 확인
```
대시보드( https://stargateedu.co.kr/exchange-rate/ )의 상단 배지가
**"자동 갱신: 수출입은행 API 연동 중"** 으로 바뀌면 성공입니다.

## 수동 1회 실행 (테스트)
```bash
EXIM_ENV_FILE=/etc/exim-update.env bash update.sh
```

## 시간대
cron은 서버 시간대를 따릅니다. KST가 아니면:
```bash
sudo timedatectl set-timezone Asia/Seoul
```

## 보안
- `GH_TOKEN`은 이 저장소 Contents 권한만 있는 Fine-grained PAT를 쓰세요(유출 시 영향 최소화).
- env 파일은 `chmod 600`으로 보관하고, 토큰은 저장소에 커밋하지 마세요.
- 토큰은 로컬 클론의 `.git/config`(remote URL)에 저장됩니다. 전용 VPS 사용을 권장합니다.

## Windows PC를 쓰신다면
작업 스케줄러 + `.bat` 버전이 필요하면 알려주세요. 동일 로직으로 만들어 드립니다.
