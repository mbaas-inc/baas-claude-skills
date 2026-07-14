# 마이그레이션 규약 (버전 업데이트 처리)

목적: 스킬/SDK가 업데이트돼도 배포된 프로젝트를 **최소 비용**으로 최신에 맞춘다.
근거 데이터는 여기(스킬)에 심고, 실제 비교·적용 UI는 AI Studio가 구현한다.

## 두 버전 축
- **SDK 버전(런타임 CDN)**: 별칭 `v1` push → 자동 반영(O(1)). 배포 앱 재생성 불필요.
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
- `changed_features`: 변경된 기능 그룹(판정용, 기계가 읽음)
- `tier`: 위 표의 Tier
- Tier 1이면 codemod 스크립트(`*.codemod.js`, jscodeshift 형식) 동봉
- Tier 2면 "무엇을·왜·어떻게" 마이그레이션 노트(LLM 컨텍스트로 주입)

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
