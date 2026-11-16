# Merkle 참조 벡터

사용자가 세션 C에서 명시적으로 승인한 예외에 따라 서브에이전트가 작성했다. 프로덕션 TypeScript나 `@noble/hashes`를 불러오지 않는 Python 표준 라이브러리 `hashlib` 참조 구현으로 생성했다.

근거는 [RFC 9162](https://www.rfc-editor.org/rfc/rfc9162.html)의 §2.1.1(root), §2.1.3.1(inclusion 생성), §2.1.4.1(consistency 생성)이다. 재귀 생성 결과를 별도의 스택 root 계산(§2.1.2), 반복 proof 검증(§2.1.3.2/§2.1.4.2)과 대조했다. §2.1.5의 일곱 leaf 예제 경로 구조, proof 변조·누락·추가 거부도 확인한다.

입력은 64개다. 인덱스 0은 빈 바이트, 인덱스 1~63은 UTF-8 `tlog-vector-001`~`tlog-vector-063`이다. 한 treeSize의 입력은 항상 이 목록의 앞부분이다. 해시는 SHA-256이며 leaf에는 `00`, 내부 노드에는 `01` 바이트를 앞에 붙인다.

- `entries.json`: 원본 entry 바이트의 소문자 hex 배열 64개.
- `roots.jsonl`: `{treeSize,rootHash}`. treeSize 0~64, 65줄.
- `inclusion.jsonl`: `{treeSize,leafIndex,proof}`. 크기 1~64의 모든 leaf, 2,080줄.
- `consistency.jsonl`: `{first,second,proof}`. `1 <= first < second <= 64`의 모든 쌍, 2,016줄.

proof는 leaf 쪽에서 root 쪽으로 소비하는 32바이트 해시들의 소문자 hex 배열이다. JSONL은 레코드당 한 줄이며 빈 트리 inclusion이나 크기가 같은 두 트리의 consistency는 포함하지 않는다. 그 API 경계 동작은 별도 테스트에서 정한다.

재생성은 저장소 루트에서 Python 3.10 이상으로 실행한다.

```powershell
py packages/merkle/test/vectors/generate.py
```

언어·해시 라이브러리·생성/검증 순회가 프로덕션 구현과 분리되어 있으나, 같은 RFC를 해석한 구현끼리 동일한 오해를 가질 가능성까지 없애지는 못한다. 이 벡터는 외부 인증이나 사람의 암호학 검토를 대신하지 않는다. 메인 에이전트는 실제 TypeScript 구현을 이 고정 파일들과 직접 대조한다.
