"""Unit tests for the simulated off-chain store. Run with `python3 -m unittest discover offchain`."""

import json
import tempfile
import unittest
from pathlib import Path

from offchain import AccessDenied, DataNotFound, DataStore, IntegrityError, compute_hash

OWNER = "0x0000000000000000000000000000000000001234"
REQUESTER = "0x0000000000000000000000000000000000005678"
DEVICE = "0x0000000000000000000000000000000000009ABC"
PAYLOAD = {"temperature": 21.5, "unit": "C"}


def allow(*_):
    return True


def deny(*_):
    return False


class DataStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "store.json"
        self.store = DataStore(self.path)

    def test_store_returns_bytes32_hash_of_document(self):
        data_hash = self.store.store_data(OWNER, DEVICE, PAYLOAD)
        document = self.store.read_data(OWNER, DEVICE, REQUESTER, allow)["document"]

        self.assertRegex(data_hash, r"^0x[0-9a-f]{64}$")
        self.assertEqual(data_hash, compute_hash(document))

    def test_hash_ignores_key_order_and_address_casing(self):
        first = self.store.store_data(OWNER, DEVICE, {"a": 1, "b": 2})
        second = self.store.store_data(OWNER.upper().replace("0X", "0x"), DEVICE.lower(), {"b": 2, "a": 1})

        self.assertEqual(first, second)
        self.assertEqual(self.store.history(OWNER, DEVICE), [first])

    def test_hash_is_bound_to_the_device(self):
        other_device = "0x000000000000000000000000000000000000dEaD"

        self.assertNotEqual(
            self.store.store_data(OWNER, DEVICE, PAYLOAD),
            self.store.store_data(OWNER, other_device, PAYLOAD),
        )

    def test_read_returns_payload_when_access_granted(self):
        data_hash = self.store.store_data(OWNER, DEVICE, PAYLOAD)
        result = self.store.read_data(OWNER, DEVICE, REQUESTER, allow)

        self.assertEqual(result["payload"], PAYLOAD)
        self.assertEqual(result["dataHash"], data_hash)

    def test_read_passes_normalized_addresses_to_access_check(self):
        self.store.store_data(OWNER, DEVICE, PAYLOAD)
        seen = []
        self.store.read_data(OWNER, DEVICE, REQUESTER, lambda *args: seen.append(args) or True)

        self.assertEqual(seen, [(OWNER.lower(), DEVICE.lower(), REQUESTER.lower())])

    def test_read_denied_without_access(self):
        self.store.store_data(OWNER, DEVICE, PAYLOAD)

        with self.assertRaises(AccessDenied):
            self.store.read_data(OWNER, DEVICE, REQUESTER, deny)

    def test_denied_read_does_not_reveal_missing_data(self):
        with self.assertRaises(AccessDenied):
            self.store.read_data(OWNER, DEVICE, REQUESTER, deny)

    def test_read_returns_latest_document(self):
        self.store.store_data(OWNER, DEVICE, {"temperature": 20})
        latest = self.store.store_data(OWNER, DEVICE, {"temperature": 22})

        self.assertEqual(self.store.data_hash(OWNER, DEVICE), latest)
        self.assertEqual(self.store.read_data(OWNER, DEVICE, REQUESTER, allow)["payload"], {"temperature": 22})
        self.assertEqual(len(self.store.history(OWNER, DEVICE)), 2)

    def test_missing_data_raises(self):
        with self.assertRaises(DataNotFound):
            self.store.data_hash(OWNER, DEVICE)
        with self.assertRaises(DataNotFound):
            self.store.verify("0x" + "00" * 32)

    def test_invalid_address_rejected(self):
        with self.assertRaises(ValueError):
            self.store.store_data("not-an-address", DEVICE, PAYLOAD)

    def test_tampering_is_detected(self):
        data_hash = self.store.store_data(OWNER, DEVICE, PAYLOAD)
        self.assertTrue(self.store.verify(data_hash))

        state = json.loads(self.path.read_text())
        state["records"][data_hash]["document"] = state["records"][data_hash]["document"].replace("21.5", "99")
        self.path.write_text(json.dumps(state))

        self.assertFalse(self.store.verify(data_hash))
        with self.assertRaises(IntegrityError):
            self.store.read_data(OWNER, DEVICE, REQUESTER, allow)

    def test_data_persists_across_instances(self):
        data_hash = self.store.store_data(OWNER, DEVICE, PAYLOAD)

        self.assertEqual(DataStore(self.path).data_hash(OWNER, DEVICE), data_hash)


if __name__ == "__main__":
    unittest.main()
