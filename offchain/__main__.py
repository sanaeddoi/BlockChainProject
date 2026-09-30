"""Command-line access to the simulated off-chain store.

Run from the project root with `python3 -m offchain <command>`. Results are
printed as JSON on stdout; failures are printed as JSON on stderr with exit
code 1. This is how the Hardhat scripts talk to the store.
"""

from __future__ import annotations

import argparse
import json
import sys

from .data_store import DEFAULT_STORE_PATH, AccessDenied, DataNotFound, DataStore, IntegrityError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="offchain", description=__doc__.splitlines()[0])
    parser.add_argument("--store", default=str(DEFAULT_STORE_PATH), help="path of the store file")
    commands = parser.add_subparsers(dest="command", required=True)

    store = commands.add_parser("store", help="store a JSON payload for a device")
    store.add_argument("--owner", required=True)
    store.add_argument("--device", required=True)
    store.add_argument("--payload", required=True, help="JSON payload to store")

    data_hash = commands.add_parser("hash", help="print the latest dataHash for a device")
    data_hash.add_argument("--owner", required=True)
    data_hash.add_argument("--device", required=True)

    read = commands.add_parser("read", help="read a device's latest data")
    read.add_argument("--owner", required=True)
    read.add_argument("--device", required=True)
    read.add_argument("--requester", required=True)
    read.add_argument(
        "--granted",
        required=True,
        choices=["true", "false"],
        help="the on-chain access decision for this requester",
    )

    verify = commands.add_parser("verify", help="check a stored document against its dataHash")
    verify.add_argument("--hash", required=True, dest="data_hash")

    return parser


def run(args: argparse.Namespace) -> dict:
    store = DataStore(args.store)

    if args.command == "store":
        return {"dataHash": store.store_data(args.owner, args.device, json.loads(args.payload))}
    if args.command == "hash":
        return {"dataHash": store.data_hash(args.owner, args.device)}
    if args.command == "read":
        granted = args.granted == "true"
        return store.read_data(args.owner, args.device, args.requester, lambda *_: granted)
    return {"dataHash": args.data_hash, "valid": store.verify(args.data_hash)}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = run(args)
    except (AccessDenied, DataNotFound, IntegrityError, ValueError) as error:
        print(json.dumps({"error": type(error).__name__, "message": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
