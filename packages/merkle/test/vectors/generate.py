"""Independent RFC 9162 Merkle fixtures; Python standard library only."""

import hashlib
import json
from functools import cache
from pathlib import Path


DIRECTORY = Path(__file__).resolve().parent
ENTRIES = (b"",) + tuple(f"tlog-vector-{index:03d}".encode("utf-8") for index in range(1, 64))


def leaf(entry: bytes) -> bytes:
    return hashlib.sha256(b"\x00" + entry).digest()


def branch(left: bytes, right: bytes) -> bytes:
    return hashlib.sha256(b"\x01" + left + right).digest()


def split(size: int) -> int:
    return 1 << ((size - 1).bit_length() - 1)


@cache
def root(entries: tuple[bytes, ...]) -> bytes:
    if not entries:
        return hashlib.sha256(b"").digest()
    if len(entries) == 1:
        return leaf(entries[0])
    middle = split(len(entries))
    return branch(root(entries[:middle]), root(entries[middle:]))


def inclusion(entries: tuple[bytes, ...], index: int) -> list[bytes]:
    if len(entries) == 1:
        return []
    middle = split(len(entries))
    if index < middle:
        return inclusion(entries[:middle], index) + [root(entries[middle:])]
    return inclusion(entries[middle:], index - middle) + [root(entries[:middle])]


def consistency(entries: tuple[bytes, ...], first: int, known: bool = True) -> list[bytes]:
    if first == len(entries):
        return [] if known else [root(entries)]
    middle = split(len(entries))
    if first <= middle:
        return consistency(entries[:middle], first, known) + [root(entries[middle:])]
    return consistency(entries[middle:], first - middle, False) + [root(entries[:middle])]


def stack_root(entries: tuple[bytes, ...]) -> bytes:
    stack: list[bytes] = []
    for index, entry in enumerate(entries):
        stack.append(leaf(entry))
        while index & 1:
            right, left = stack.pop(), stack.pop()
            stack.append(branch(left, right))
            index >>= 1
    if not stack:
        return hashlib.sha256(b"").digest()
    while len(stack) > 1:
        right, left = stack.pop(), stack.pop()
        stack.append(branch(left, right))
    return stack[0]


def verify_inclusion(index: int, size: int, node: bytes, proof: list[bytes], expected: bytes) -> bool:
    if not 0 <= index < size:
        return False
    last = size - 1
    for sibling in proof:
        if last == 0:
            return False
        if index & 1 or index == last:
            node = branch(sibling, node)
            while index != 0 and index & 1 == 0:
                index >>= 1
                last >>= 1
        else:
            node = branch(node, sibling)
        index >>= 1
        last >>= 1
    return last == 0 and node == expected


def verify_consistency(first: int, second: int, before: bytes, after: bytes, proof: list[bytes]) -> bool:
    if not 0 < first < second or not proof:
        return False
    nodes = ([before] if first & (first - 1) == 0 else []) + proof
    old_index, new_index = first - 1, second - 1
    while old_index & 1:
        old_index >>= 1
        new_index >>= 1
    old_root = new_root = nodes[0]
    for sibling in nodes[1:]:
        if new_index == 0:
            return False
        if old_index & 1 or old_index == new_index:
            old_root = branch(sibling, old_root)
            new_root = branch(sibling, new_root)
            while old_index != 0 and old_index & 1 == 0:
                old_index >>= 1
                new_index >>= 1
        else:
            new_root = branch(new_root, sibling)
        old_index >>= 1
        new_index >>= 1
    return new_index == 0 and old_root == before and new_root == after


def damaged(value: bytes) -> bytes:
    return bytes([value[0] ^ 1]) + value[1:]


def write_jsonl(name: str, records: list[dict]) -> None:
    text = "".join(json.dumps(record, separators=(",", ":")) + "\n" for record in records)
    (DIRECTORY / name).write_text(text, encoding="utf-8", newline="\n")


def generate() -> None:
    roots = []
    inclusions = []
    consistencies = []
    assert root(()) == bytes.fromhex("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    assert root((b"",)) == bytes.fromhex("6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d")
    for size in range(65):
        entries = ENTRIES[:size]
        expected = root(entries)
        assert expected == stack_root(entries), f"root size={size}"
        roots.append({"treeSize": size, "rootHash": expected.hex()})
        for index, entry in enumerate(entries):
            proof = inclusion(entries, index)
            assert verify_inclusion(index, size, leaf(entry), proof, expected)
            assert not verify_inclusion(index, size, damaged(leaf(entry)), proof, expected)
            assert not verify_inclusion(index, size, leaf(entry), proof + [expected], expected)
            if proof:
                assert not verify_inclusion(index, size, leaf(entry), proof[:-1], expected)
                assert not verify_inclusion(index, size, leaf(entry), [damaged(proof[0])] + proof[1:], expected)
            inclusions.append({"treeSize": size, "leafIndex": index, "proof": [item.hex() for item in proof]})
        for first in range(1, size):
            proof = consistency(entries, first)
            before = root(entries[:first])
            assert verify_consistency(first, size, before, expected, proof)
            assert not verify_consistency(first, size, damaged(before), expected, proof)
            assert not verify_consistency(first, size, before, expected, proof + [expected])
            assert not verify_consistency(first, size, before, expected, proof[:-1])
            assert not verify_consistency(first, size, before, expected, [damaged(proof[0])] + proof[1:])
            consistencies.append({"first": first, "second": size, "proof": [item.hex() for item in proof]})

    # RFC 9162 §2.1.5's seven-leaf example, expressed through independently named subtrees.
    a, b, c, d, e, f, j = (leaf(entry) for entry in ENTRIES[:7])
    g, h, i = branch(a, b), branch(c, d), branch(e, f)
    k, l = branch(g, h), branch(i, j)
    assert inclusion(ENTRIES[:7], 0) == [b, h, l]
    assert inclusion(ENTRIES[:7], 3) == [c, g, l]
    assert inclusion(ENTRIES[:7], 4) == [f, j, k]
    assert inclusion(ENTRIES[:7], 6) == [i, k]
    assert consistency(ENTRIES[:7], 3) == [c, d, g, l]
    assert consistency(ENTRIES[:7], 4) == [l]
    assert consistency(ENTRIES[:7], 6) == [i, j, k]

    assert len(ENTRIES) == 64 and len(roots) == 65
    assert len(inclusions) == 2080 and len(consistencies) == 2016
    (DIRECTORY / "entries.json").write_text(json.dumps([entry.hex() for entry in ENTRIES], indent=2) + "\n", encoding="utf-8", newline="\n")
    write_jsonl("roots.jsonl", roots)
    write_jsonl("inclusion.jsonl", inclusions)
    write_jsonl("consistency.jsonl", consistencies)
    print(f"Validated and wrote {len(roots)} roots, {len(inclusions)} inclusion proofs, {len(consistencies)} consistency proofs")


if __name__ == "__main__":
    generate()
