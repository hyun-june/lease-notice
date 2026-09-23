# LH / SH 임대공고 카카오톡 알림 봇

LH 청약플러스 **공고중 전체**와 SH **주택임대 게시판**을 30분마다 확인해,
새 공고를 카카오톡 "나에게 보내기"로 보내 줍니다.
(GitHub cron은 정시에 안 돌고 5~15분 밀리는 게 정상입니다.)

의존성 0개 · Node 20 내장 기능만 사용 · GitHub Actions 무료 한도 안에서 동작.

---

## 처음 한 번만 하면 되는 설정 (순서대로)

1. [Kakao Developers](https://developers.kakao.com/console/app)에서 **애플리케이션 추가하기**로 앱을 만드세요.
2. 만든 앱 → **앱 키** 메뉴에서 **REST API 키**를 복사해 두세요.
3. **카카오 로그인** 메뉴 → 활성화 설정을 **ON** 으로 바꾸세요.
4. **앱 설정 → 플랫폼 → Web → 사이트 도메인**에 아래 3개를 등록하세요.
   - `http://localhost:3000`
   - `https://apply.lh.or.kr`
   - `https://www.i-sh.co.kr`
   > 메시지 버튼 링크(`link.web_url`)의 도메인이 등록돼 있지 않으면 전송이 **400 에러**로 실패합니다.
5. **카카오 로그인 → Redirect URI**에 `http://localhost:3000/oauth` 를 등록하세요.
6. **카카오 로그인 → 동의항목**에서 **"카카오톡 메시지 전송"(`talk_message`)** 을 **필수 동의**로 켜세요.
7. 이 레포를 클론한 폴더에서 `node kakao-login.js <2번에서 복사한 REST API 키>` 를 실행하세요.
8. 열린 브라우저에서 카카오 로그인 후 동의하면, 터미널에 **refresh token** 과 `gh secret set` 명령 3줄이 출력됩니다.
9. GitHub에서 **fine-grained Personal Access Token**을 발급하세요.
   (Repository access: **이 레포만**, Permissions → Repository permissions → **Secrets: Read and write**)
   - fine-grained PAT은 **만료일이 필수**입니다. 선택 가능한 **최대치(1년)** 로 잡고 캘린더에 갱신 알림을 걸어 두세요.
   > **이 토큰이 없거나 만료되면** refresh token을 자동 갱신하지 못합니다. 증상은 "며칠간 같은 공고가 30분마다 중복 발송되다가 어느 날 완전히 멈춤"입니다. 그렇게 되면 7~12번을 다시 하세요.
10. `gh secret set KAKAO_REST_KEY --body "<REST API 키>"` 를 실행하세요.
11. `gh secret set KAKAO_REFRESH_TOKEN --body "<8번의 refresh token>"` 를 실행하세요.
12. `gh secret set GH_PAT --body "<9번의 PAT>"` 를 실행하세요.
13. `gh workflow run notify.yml` 로 수동 실행해 동작을 확인하세요.
14. `gh run watch` 또는 GitHub Actions 탭에서 로그가 정상인지 확인하세요.

---

## 알아 두면 좋은 것

- 한 번 실행에 **최대 5건**까지만 보내고, 그보다 많으면 마지막에 `외 N건 더 있음` 요약 1건을 추가로 보냅니다.
- 보낸 공고 목록은 `seen.json` 에 기록되며, 워크플로가 자동으로 커밋합니다. (각 목록 최근 500건 유지)
- 6건 이상 밀린 경우 **나머지는 발송되지 않고** 곧바로 "본 것"으로 기록됩니다. 요약 메시지의 버튼으로 LH 목록에서 확인하세요.
- LH와 SH를 번갈아 담으므로, LH 신규가 많아도 SH 알림이 묻히지 않습니다.
- `seen.json` 을 `{"lh":[],"sh":[]}` 로 비우면 다음 실행에 5건 + 요약 1건만 오고 나머지 100여 건은 발송 없이 기록됩니다. 되도록 비우지 마세요.
- LH 또는 SH 한쪽 조회가 실패해도 다른 쪽 알림은 정상 발송됩니다.
