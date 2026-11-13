"""Where the scripts of this folder read and write (README.md has the whole table).
     S   the work folder, with a slash after it: the environment variable PANEL_WORK. The draft folders (<gear>-<draft>/)
         and refs/ lie in it; S + 'inputs/' holds what was made or fetched elsewhere (the owner's reference pictures, the
         downloads, the logos, the earliest trials).
     R   the repository's root, with a slash after it: three levels above this file.
   A script run with python3 -I does not look in its own folder for modules, so each script puts this folder on the path
   before it imports from here."""
import os, sys
if not os.environ.get('PANEL_WORK'):
    sys.exit('PANEL_WORK is not set: export PANEL_WORK=<the work folder> (see scripts/assets/deck_panels/README.md)')
S = os.path.abspath(os.environ['PANEL_WORK']) + '/'
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))) + '/'
