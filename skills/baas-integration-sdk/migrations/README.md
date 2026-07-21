# 마이그레이션 규약 (버전 업데이트 처리)

목적: 스킬/SDK가 업데이트돼도 배포된 프로젝트를 **최소 비용**으로 최신에 맞춘다.
근거 데이터는 여기(스킬)에 심고, 실제 비교·적용 UI는 AI Studio가 구현한다.

## 두 버전 축
- **SDK 버전(런타임 CDN)**: 브랜치 CD로 배포(`stage`→`next` 검증 → `main`→`v1` 승격). 채널 갱신 → 자동 반영(O(1)), 배포 앱 재생성 불필요.
- **스킬 버전(생성 시점)**: 이미 배포된 앱엔 무영향. 사용자가 "새 UI로 갱신"을 원할 때만 관여.

## 업데이트 판정 (LLM 없이 diff)
각 프로젝트의 `baas-manifest.json`(`skill_version`, `features_used`)과 최신 스킬을 비교:
```
영향받는 기능 = manifest.features_used ∩ 이번 버전에서 변경된 기능
교집합이 비면 → 갱신 대상 아님(건너뜀)
```

## 비용 사다리 (Tier)
| Tier | 변경 종류 | 비용 | 처리 |
|---|---|---|---|
| 0 | API/transport | LLM 0·재빌드 0 | SDK 흡수, CDN push |
| 1 | 기계적 UI(이름·props·import) | LLM 0·재빌드 1 | 아래 codemod 실행 후 재빌드 |
| 2 | 국소 UI(특정 기능 패턴) | LLM 소량 | 교집합 파일만 + 이 폴더의 마이그레이션 노트로 수정 |
| 3 | 구조 재설계 | 전체 재생성 | 사용자 동의 필수 |

## 버전 올릴 때 작성 규약 (스킬 저작자)
버전을 올리는 PR은 이 폴더에 `vX.Y-to-vX.Z.md`를 추가하고 다음을 명시한다:
- frontmatter(필수, 기계가 읽음):
  ```yaml
  from: "0.2"                     # 이 노트가 출발하는 skill_version
  to: "0.3"                       # 도착 버전 (features.json의 version과 일치)
  changed_features: ["collection"] # 판정용 기능 그룹. 횡단 변경(전역 에러 처리 등)은 ["*"] → 모든 앱 대상
  tier: 2                          # 위 표의 Tier
  ```
- Tier 1이면 codemod 스크립트(`*.codemod.js`, jscodeshift 형식) 동봉
- Tier 2면 "무엇을·왜·어떻게" 마이그레이션 노트(LLM 컨텍스트로 주입)
  + **"적용 후 확인" 체크리스트** 섹션 필수 — 재빌드 성공만으로는 부족하므로,
    적용한 LLM이 결과를 검증할 구체 항목(동작·노출 조건·manifest 갱신)을 노트마다 명시한다.

### 체인 무결성 (경로가 끊기면 안 됨)
노트는 삭제·수정하지 않고 누적한다(append-only). 배포 앱은 강제 업데이트가 안 되므로
**릴리스된 모든 `skill_version`에서 최신 버전까지 노트 경로가 존재**해야 한다:
- 버전 건너뛰기 노트(예: `v0.3-to-v0.5.md` 하나로 처리)는 중간 버전(0.4)이
  **실제 릴리스된 적 없을 때만** 허용. 배포 앱이 존재하는 버전은 경로를 잃으면 안 된다.
- 체인이 길어지면(3단계 이상) 요약(squash) 노트 `vX.Y-to-vX.Z.md`를 추가할 수 있다.
  판정기는 앱의 `skill_version`과 `from`이 일치하는 노트 중 `to`가 가장 먼 것을 우선 선택한다.
  단계별 노트는 그대로 유지한다(중간 버전 앱의 경로).

### 예: Tier 1 codemod (훅 이름 변경)
```js
// v0.1-to-v0.2-rename.codemod.js  — useLogin() → useAuthActions()
export default function transform(file, api) {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.CallExpression, { callee: { name: "useLogin" } })
    .forEach((p) => { p.node.callee.name = "useAuthActions"; })
    .toSource();
}
// 적용: jscodeshift -t v0.1-to-v0.2-rename.codemod.js src/
```
codemod는 변경이 **규칙적일 때만** 유효하다(패턴이 명확한 이름/구조 변경). 감각적 디자인·로직 재구성은 Tier 2/3.
