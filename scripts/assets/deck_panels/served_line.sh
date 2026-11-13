#!/bin/bash
# served_line.sh: the judge line height the dev server serves (the common one), e.g. 0.72
U=$(curl -s -m 5 http://127.0.0.1:5198/src/engine/config.ts | grep -o '"[^"]*camera\.json[^"]*"' | head -1 | tr -d '"')
curl -s -m 5 "http://127.0.0.1:5198$U" | grep -o "judgeLineY = [0-9.]*;" | grep -o "[0-9.]*"
