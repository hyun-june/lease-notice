# LH / SH 임대공고 뷰어 + 카카오톡 알림 봇

LH 청약플러스 **공고중** 가운데 내 지역의 임대주택 공고와 SH **주택임대 게시판**을 **매일 오전 9시**(GitHub 사정으로 수~수십 분 늦을 수 있음)에 확인해,
새 공고를 카카오톡 "나에게 보내기"로 보내 줍니다. 목록은 웹 뷰어(Vercel)에서 봅니다.
(GitHub cron은 정시에 안 돌고 5~15분 밀리는 게 정상입니다.)

의존성 0개 · Node 20 내장 기능만 사용 · GitHub Actions 무료 한도 안에서 동작.

---

## 뷰어

- **배포**: [vercel.com](https://vercel.com) → Add New → Project → `hyun-june/lease-notice` import. 설정은 건드릴 필요 없습니다. 이후 push 하면 자동 배포됩니다. (`seen.json` 만 바뀐 봇 커밋은 `vercel.json` 설정으로 배포를 건너뜁니다.)
- **로컬 실행**: `npx vercel dev`
- 첫 화면 **내 조건** 탭은 알림과 같은 규칙으로 거른 목록입니다. LH·SH 탭은 전체 검색입니다.

## 지역 바꾸기

GitHub 웹에서 `config.json` 을 열어 연필(편집) → 저장하면 됩니다.

```json
{"regions":["서울특별시","경기도","인천광역시"]}
```

- 쓸 수 있는 이름: 서울특별시, 경기도, 인천광역시, 부산광역시, 대구광역시, 대전광역시, 울산광역시, 세종특별자치시, 강원특별자치도, 충청북도, 충청남도, 전북특별자치도, 전남광주통합특별시, 경상북도, 경상남도, 제주특별자치도 (`lib.js` 의 `REGIONS`)
- `[]` 로 비우면 전국 모든 지역입니다.
- 목록에 없는 이름을 넣으면 다음 알림 실행이 실패하고, 뷰어 "내 조건" 탭에 설정 오류가 뜹니다.
- 지역을 새로 추가하면 그 지역 기존 공고가 한꺼번에 신규로 잡힙니다 (5건 + 요약 1건).

## 알림 규칙

- **LH**: 지역이 `regions` 중 하나를 포함하거나 **전국** 공고이고, 유형이 **임대주택·주거복지**(국민·영구·행복·공공·통합공공·매입임대 등) 또는 행복주택(신혼희망)인 것. 토지·상가·분양주택·공공분양(신혼희망)은 제외.
- **SH**: `regions` 에 서울특별시가 있을(또는 비어 있을) 때만, 주택임대 게시판 1페이지.
- 나이·소득 같은 자격은 판단하지 않습니다. 알림을 받고 공고문에서 직접 확인하세요.

## 실패 알림

GitHub Actions 실행이 **실패(빨간 X)** 로 끝나면 GitHub이 메일을 보냅니다. 뜻은 다음 중 하나입니다.

- LH 또는 SH 조회가 실패했거나 0건이 왔다 (프록시 장애, SH 사이트 구조 변경 등). 다른 쪽 알림은 정상 발송되고, 실패한 쪽 기록은 그대로 둡니다.
- `config.json` 형식이 틀렸거나 모르는 지역 이름이 있다.
- 카카오 토큰 갱신 실패 (아래 9번 PAT 만료 등).

## 시크릿 (3개)

| 이름 | 내용 |
|---|---|
| `KAKAO_REST_KEY` | 카카오 앱 REST API 키 |
| `KAKAO_REFRESH_TOKEN` | `kakao-login.js` 로 받은 refresh token (봇이 자동 갱신) |
| `GH_PAT` | fine-grained PAT, Repository access: 이 레포만, Permissions: **Secrets: Read and write** |

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
   > **이 토큰이 없거나 만료되면** refresh token을 자동 갱신하지 못합니다. 증상은 "며칠간 같은 공고가 매일 중복 발송되다가 어느 날 완전히 멈춤"입니다. 그렇게 되면 7~12번을 다시 하세요.
> 10~14번은 hyun-june 계정으로 실행돼야 합니다. 같은 터미널에서 먼저 `export GH_TOKEN=$(gh auth token -u hyun-june)` 를 실행하세요. 전역 gh 활성 계정은 바뀌지 않습니다.

10. `gh secret set KAKAO_REST_KEY -R hyun-june/lease-notice --body "<REST API 키>"` 를 실행하세요.
11. `gh secret set KAKAO_REFRESH_TOKEN -R hyun-june/lease-notice --body "<8번의 refresh token>"` 를 실행하세요.
12. `gh secret set GH_PAT -R hyun-june/lease-notice --body "<9번의 PAT>"` 를 실행하세요.
13. `gh workflow run notify.yml -R hyun-june/lease-notice` 로 수동 실행해 동작을 확인하세요.
14. `gh run watch -R hyun-june/lease-notice` 또는 GitHub Actions 탭에서 로그가 정상인지 확인하세요.

---

## 알아 두면 좋은 것

- 한 번 실행에 **최대 5건**까지만 보내고, 그보다 많으면 마지막에 `외 N건 더 있음` 요약 1건을 추가로 보냅니다.
- 보낸 공고 목록은 `seen.json` 에 기록되며, 워크플로가 자동으로 커밋합니다. (각 목록 최근 500건 유지)
- 6건 이상 밀린 경우 **나머지는 발송되지 않고** 곧바로 "본 것"으로 기록됩니다. 요약에 LH·SH 건수가 나오고 버튼은 LH 목록(LH가 0건이면 SH 주택임대 게시판)으로 갑니다. 전체는 뷰어 "내 조건" 탭에서 확인하세요.
- LH와 SH를 번갈아 담으므로, LH 신규가 많아도 SH 알림이 묻히지 않습니다.
- `seen.json` 을 `{"lh":[],"sh":[]}` 로 비우면 다음 실행에 5건 + 요약 1건만 오고 나머지 100여 건은 발송 없이 기록됩니다. 되도록 비우지 마세요.
- LH 또는 SH 한쪽 조회가 실패해도 다른 쪽 알림은 정상 발송되고, 실행은 실패로 표시됩니다.
