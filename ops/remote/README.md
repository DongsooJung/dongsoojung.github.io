# Remote Server Operations Runbook

이 문서는 `DongsooJung/dongsoojung.github.io`의 원격서버 운영 기준과 GitHub Actions 연계 절차를 정의합니다.

## 1. GitHub Secrets

Repository Settings → Secrets and variables → Actions에 아래 값을 등록합니다.

| Secret | 설명 | 예시 |
|---|---|---|
| `REMOTE_HOST` | 원격서버 주소 | `203.0.113.10` |
| `REMOTE_USER` | 배포 전용 사용자 | `deploy` |
| `REMOTE_PORT` | SSH 포트 | `22` |
| `REMOTE_SSH_KEY` | 배포 전용 Ed25519 private key | 다중행 private key |
| `REMOTE_PATH` | 서버 배포 경로 | `/srv/stargate/www` |
| `NOTION_TOKEN` | 선택: STARGATE 자동화 로그 기록용 Notion integration token | secret |

`NOTION_TOKEN`은 선택입니다. 없으면 배포/헬스체크는 정상 동작하고 Notion 기록 단계만 건너뜁니다.

## 2. Ubuntu 서버 1회 초기화

```bash
sudo apt update
sudo apt install -y rsync curl ca-certificates ufw
sudo adduser deploy
sudo mkdir -p /srv/stargate/www
sudo chown -R deploy:deploy /srv/stargate
```

Docker 기반 서비스가 있으면 추가로 Docker Engine과 Compose plugin을 설치하고 `deploy` 사용자가 Docker를 실행할 수 있도록 권한을 설정합니다.

## 3. SSH 보안 기준

- 배포 전용 Ed25519 키 사용
- 비밀번호 로그인 비활성화 권장
- root SSH 로그인 비활성화 권장
- 방화벽은 SSH, HTTP, HTTPS만 허용
- GitHub 저장소에는 private key나 실제 `.env`를 저장하지 않음

예시 방화벽:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

SSH 포트를 변경했다면 `22/tcp` 대신 실제 포트를 허용합니다.

## 4. 원격 배포 실행

GitHub Actions → **Remote Server Deploy** → Run workflow에서 실행합니다.

배포 순서:

1. 필수 SSH secret 검증
2. 원격 배포 디렉터리 tar.gz 백업
3. 최근 백업 7개만 유지
4. rsync로 코드 전송
5. Compose 파일이 있으면 `docker compose up -d --build`
6. 지정한 health URL 확인
7. health check 실패 시 직전 백업 자동 복원
8. `NOTION_TOKEN`이 있으면 STARGATE 자동화 로그에 결과 기록

`remote-deploy.yml`은 자동 push 배포가 아니라 수동 실행만 허용합니다. 서버 경로와 권한 검증이 끝난 뒤 자동 배포 전환 여부를 결정합니다.

## 5. 헬스체크

`remote-health-check.yml`은 매시간 17분에 다음 엔드포인트를 확인합니다.

- `https://www.stargateedu.co.kr`
- `https://portal.stargateedu.co.kr`
- `https://blog.stargateedu.co.kr`
- `https://shop.stargateedu.co.kr`

HTTP 2xx/3xx는 정상으로 처리합니다. 실패하면 workflow가 실패 상태가 되고, `NOTION_TOKEN`이 있으면 실패 내역을 STARGATE 자동화 로그에 기록합니다. 실행 결과 파일은 GitHub Actions artifact로 7일 보관합니다.

## 6. 장애 대응 순서

1. GitHub Actions health result 확인
2. DNS/HTTPS 응답 확인
3. SSH 접속 확인
4. 디스크 사용량: `df -h`
5. 메모리: `free -h`
6. Docker 상태: `docker ps -a`
7. 최근 로그: `docker compose logs --tail=200`
8. 필요 시 직전 배포 백업 복원

## 7. 다음 고도화

- 운영서버 실제 IP/호스트 등록
- 서버별 인벤토리 표준화
- fail2ban 또는 SSH rate limiting
- 외부 백업 저장소 추가
- 월 1회 복원 테스트
- 수동 배포 검증 후 main 병합 기반 자동 배포 전환
