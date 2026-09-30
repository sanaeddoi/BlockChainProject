"""Simulated off-chain data storage.

Device readings are too large (and too private) to keep on-chain, so the chain
only decides *who may read* and this module holds *what is read*. Every stored
document is identified by its dataHash, the SHA-256 of its canonical JSON, which
is the bytes32 value a contract would keep as its off-chain data reference.

Data_sharing.readData does not return a dataHash yet (Device_manager has no
field for it), so documents are also indexed by (owner, device), the same pair
readData and requestAccess take.

SHA-256 is used rather than keccak256 because it is in the Python standard
library and is also available in Solidity (`sha256(...)`) and viem (`sha256`).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Callable

DEFAULT_STORE_PATH = Path(__file__).resolve().parent / "store.json"

_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")

# (owner, device, requester) -> does the chain currently allow this read?
AccessCheck = Callable[[str, str, str], bool]


class AccessDenied(Exception):
    """The on-chain access check did not grant the read."""


class DataNotFound(Exception):
    """Nothing is stored for the given device or dataHash."""


class IntegrityError(Exception):
    """A stored document no longer matches its dataHash."""


def normalize_address(address: str) -> str:
    """Validates an Ethereum address and lowercases it so lookups ignore checksum casing."""
    if not isinstance(address, str) or not _ADDRESS_RE.match(address):
        raise ValueError(f"Invalid address: {address!r}")
    return address.lower()


def canonical_json(value: Any) -> str:
    """Serialises to JSON with sorted keys and no whitespace, so equal data always hashes equally."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_hash(document: str) -> str:
    """Returns the dataHash of a canonical document as a 0x-prefixed bytes32 hex string."""
    return "0x" + hashlib.sha256(document.encode("utf-8")).hexdigest()


class DataStore:
    """JSON-file-backed store of device data, addressed by dataHash."""

    def __init__(self, path: str | os.PathLike[str] = DEFAULT_STORE_PATH):
        self.path = Path(path)

    def store_data(self, owner: str, device: str, payload: Any) -> str:
        """Stores a payload for one of an owner's devices and returns its dataHash.

        The owner and device are hashed together with the payload, so a
        dataHash is bound to the device it was recorded for.
        """
        owner = normalize_address(owner)
        device = normalize_address(device)
        document = canonical_json({"owner": owner, "device": device, "payload": payload})
        data_hash = compute_hash(document)

        state = self._load()
        if data_hash not in state["records"]:
            state["records"][data_hash] = {
                "owner": owner,
                "device": device,
                "document": document,
                "storedAt": int(time.time()),
            }
            state["index"].setdefault(self._key(owner, device), []).append(data_hash)
            self._save(state)
        return data_hash

    def data_hash(self, owner: str, device: str) -> str:
        """Returns the dataHash of the latest document stored for a device."""
        return self.history(owner, device)[-1]

    def history(self, owner: str, device: str) -> list[str]:
        """Returns every dataHash stored for a device, oldest first."""
        key = self._key(normalize_address(owner), normalize_address(device))
        hashes = self._load()["index"].get(key)
        if not hashes:
            raise DataNotFound(f"No data stored for device {device} of owner {owner}")
        return list(hashes)

    def verify(self, data_hash: str) -> bool:
        """Checks that the document stored under a dataHash still hashes to it."""
        record = self._record(data_hash)
        return compute_hash(record["document"]) == data_hash.lower()

    def read_data(
        self, owner: str, device: str, requester: str, has_access: AccessCheck
    ) -> dict[str, Any]:
        """Returns a device's latest data if the chain allows the requester to read it.

        `has_access` stands in for the on-chain decision (Data_sharing.readData
        / requestAccess). It is asked before anything is looked up, so a denied
        requester cannot tell whether data exists.
        """
        owner = normalize_address(owner)
        device = normalize_address(device)
        requester = normalize_address(requester)

        if not has_access(owner, device, requester):
            raise AccessDenied(f"{requester} has no access to device {device} of owner {owner}")

        data_hash = self.data_hash(owner, device)
        record = self._record(data_hash)
        if compute_hash(record["document"]) != data_hash:
            raise IntegrityError(f"Stored document does not match dataHash {data_hash}")

        return {
            "dataHash": data_hash,
            "document": record["document"],
            "payload": json.loads(record["document"])["payload"],
            "storedAt": record["storedAt"],
        }

    @staticmethod
    def _key(owner: str, device: str) -> str:
        return f"{owner}:{device}"

    def _record(self, data_hash: str) -> dict[str, Any]:
        record = self._load()["records"].get(data_hash.lower())
        if record is None:
            raise DataNotFound(f"No data stored under dataHash {data_hash}")
        return record

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"records": {}, "index": {}}
        with self.path.open(encoding="utf-8") as f:
            return json.load(f)

    def _save(self, state: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp, self.path)
