"""Entry point of the bundled analysis server (PyInstaller): uses the config and the built client
packed next to it, then runs the normal command line (`--port`, `--data`, ...)."""

import os
import sys

if getattr(sys, "frozen", False):
    bundle = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    os.environ.setdefault("GRG_CONFIG_DIR", os.path.join(bundle, "config"))
    os.environ.setdefault("GRG_CLIENT_DIST", os.path.join(bundle, "client_dist"))

from rhythm_server.__main__ import main  # noqa: E402  (after the environment is set)

if __name__ == "__main__":
    main()
