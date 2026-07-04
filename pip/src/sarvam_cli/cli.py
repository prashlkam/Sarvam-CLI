"""Entry point: ensure the native binary is present, then hand over to it."""

import os
import signal
import subprocess
import sys

from .download import DownloadError, ensure_binary


def main():
    try:
        binary = ensure_binary()
    except DownloadError as err:
        print("sarvam-cli: {}".format(err), file=sys.stderr)
        sys.exit(1)

    args = [binary] + sys.argv[1:]
    if os.name == "posix":
        # Replace this process so signals, exit codes, and TTY behavior all
        # belong to the native binary.
        os.execv(binary, args)
    # Windows: no execv semantics — relay via subprocess. Ignore Ctrl+C in the
    # parent so the child owns interrupt handling.
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    sys.exit(subprocess.run(args).returncode)


if __name__ == "__main__":
    main()
