"""Second round of concept pictures for PRISM: the gear's deck, the judgement and combo lettering, the HUD round the track and the long note.

    GOOGLE_API_KEY=... python3 design-mockups/tools/make_gear_round2.py [id ...]

The notes of the first round were approved and are left out. `screen` redraws a screenshot of the game as it is
(docs/screenshots/44-prism-7k.png, sent with the prompt) so the result compares with it part for part; the sheets are drawn
from the prompt alone. Concept pictures to choose a direction from, not game assets.
Writes _src/gear-concepts/r2-<id>.png (as generated, not committed), gear-concepts/r2-<id>.jpg (1600 px wide) and adds to
_src/gear-concepts/record.json (model, prompt in full, reference picture, token counts). The key is read from the
environment and never written.
"""
from __future__ import annotations

import base64
import fcntl
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "_src" / "gear-concepts"
OUT = ROOT / "gear-concepts"
SHOT = ROOT.parent / "docs" / "screenshots" / "44-prism-7k.png"
MODEL = "gemini-nano-banana-2.1"
URL = f"https://aiplatform.googleapis.com/v1/projects/85168768924/locations/global/publishers/google/models/{MODEL}:generateContent"
MADE = "2026-11-11"
TAIL = " Original design: it must not resemble any existing game's interface. No logos, no watermark, no characters, no people."

THEME = (
    "Theme PRISM: cut crystal and light. Everything is made of faceted clear crystal, bevelled optical glass and satin black anodised "
    "aluminium, lit from inside by white light that splits into thin rainbow dispersion at cut edges; colours are ice white, cobalt "
    "and azure blue with small spectral accents. One consistent visual language across the gear, the lettering and the panels: "
    "45-degree chamfered corners, facet lines, hairline light-guides, a hexagonal gem motif. "
)

# id: (reference picture, several of them, or None; prompt)
PICTURES: dict[str, tuple[Path | tuple[Path, ...] | None, str]] = {
    "screen": (
        SHOT,
        "This is a screenshot of our PC rhythm game. Redraw it as polished concept art in the same layout and camera, 16:9. "
        "KEEP exactly as they are: the lane layout, the falling glass bar notes, the blue judgment line and the position of every element. "
        "REDESIGN with far more character, all in one consistent crystal theme: "
        "(1) the control deck below the judgment line: now a rich sculpted crystal console, a large faceted gem set in a machined "
        "ring at the centre with light inside it, cut-crystal wings spreading to both sides with facet planes, inlaid hairline "
        "light-guides, small hexagonal gem studs, rainbow dispersion along the cut edges, engraved fine ornament; "
        "(2) the side rails: bevelled crystal rails with facets and a line of light, crystal end caps where they meet the deck; "
        "(3) the combo number and the word COMBO in the middle of the track: custom display lettering that looks cut from crystal, "
        "faceted bevelled glyphs with a bright edge and a thin spectral fringe; "
        "(4) the judgment text 'MAX 100%': the same crystal lettering family, sharper and smaller, with a small gem-cut underline; "
        "(5) the HUD around the track (song title plate top-left, SCORE / RATE / MAX COMBO / SPEED on the left, the gauge with its "
        "name and CLEAR mark on the right, the time): each set in a small chamfered glass plate with a hairline frame and a facet "
        "highlight, typography matching the crystal lettering, the gauge a column of cut crystal segments. "
        "Keep the texts the same words and numbers as in the screenshot, spelled correctly. " + THEME,
    ),
    "deck": (
        None,
        "A design sheet on a near-black background, 16:9: three different designs, stacked one above the other with generous spacing, "
        "of the 'gear bottom' of a PC rhythm game, the wide control deck that sits below the judgment line of a seven-lane note "
        "highway, each drawn as a wide trapezoid strip seen in perspective from above (wider at the bottom), with the ends of the two "
        "side rails joining it. Each must be unmistakably crystal, rich and sculpted, not a flat plate. "
        "Design A 'GEODE': a black anodised shell split open to show a bed of clear crystal points inside, lit from below, one large "
        "hexagonal gem in the centre. Design B 'CHANDELIER': a symmetrical console of cut-crystal wings with long facet planes fanning "
        "out from a central brilliant-cut gem in a machined ring, hairline light-guides, rainbow dispersion on the edges. "
        "Design C 'OPTICAL BENCH': a precision instrument, a row of triangular glass prisms and lenses on a black rail splitting a "
        "white beam into a spectrum that runs across the deck, engraved fine tick ornament. No text. " + THEME,
    ),
    "type": (
        None,
        "A typography and HUD design sheet on a near-black background, 16:9, for a PC rhythm game, laid out in a tidy grid. "
        "Left half, the in-track lettering in one custom display typeface that looks cut from crystal (faceted bevelled glyphs, "
        "bright edges, thin spectral fringe, italic and fast): the big combo number '128' with the small word 'COMBO' under it; the "
        "judgment texts 'MAX 100%', 'MAX 90%', 'MAX 50%', 'BREAK' (BREAK in cracked ruby red crystal); 'FEVER x3' as a rainbow "
        "dispersion badge; the digits '0123456789'. "
        "Right half, the HUD plates in the same family: a song title plate with a square jacket slot, the title 'Demo Groove' and a "
        "difficulty chip 'EXPERT 9'; a stats plate with 'SCORE 199,357', 'RATE 100.00%', 'MAX COMBO 62'; a 'SPEED 3.00' plate; a "
        "vertical gauge made of cut crystal segments with the name 'LUMEN', a 'CLEAR' mark and '61%'; a time readout '0:27'. "
        "Each plate is chamfered smoked glass with a hairline light frame and one facet highlight. All words spelled exactly as "
        "given. " + THEME,
    ),
    "long": (
        None,
        "A design sheet on a near-black background, 16:9: four different designs of a 'long hold note' for a PC rhythm game, side "
        "by side, each drawn vertically as it travels down a lane (head at the bottom, tail at the top), each shown twice: idle, "
        "and being held (lit from inside, brighter). The tap note of the game is a short wide bevelled bar of clear crystal glass "
        "with a bright leading edge; each long note starts with that same bar as its head. "
        "Design A 'TUBE': a clear glass tube narrower than the head with a thin thread of light inside, wedge-cut tail. "
        "Design B 'FULL PRISM': a long triangular glass prism as wide as the head, a ridge of light down its middle, facets "
        "either side, tail a second bar with a notch. Design C 'CRYSTAL SHAFT': a hexagonal crystal column as wide as the head "
        "with visible facet planes and internal reflections, pointed crystal tip as its tail. Design D 'LIGHT RIBBON': a flat "
        "wide band of frosted glass with two bright edge lines and a soft spectrum inside, tail a thin bright bar. "
        "No text. " + THEME,
    ),
}

# Third round: the second was too ornate. Quiet, minimal crystal; the rails and the combo plain.
MINIMAL = (
    "Art direction: MINIMAL and restrained, the taste of a high-end audio product or a camera lens, not fantasy. Mostly satin black "
    "anodised aluminium with very few, precise parts of clear cut glass. Large calm flat surfaces, a lot of empty space, two or "
    "three facets at most, one thin white line of light, at most one tiny hint of rainbow dispersion at a single edge. No wings, "
    "no gem clusters, no ornament, no engraving, no glow bloom, no lens flare, no sparkles. Colours: black, graphite, clear "
    "glass, white light, a little azure. It must look designed by an industrial designer, crisp and quiet. "
)
PICTURES["deck-min"] = (
    None,
    "A design sheet on a near-black background, 16:9: three different minimal designs, stacked one above the other with generous "
    "spacing, of the 'gear bottom' of a PC rhythm game, the wide control deck that sits below the judgment line of a seven-lane "
    "note highway, each drawn as a wide low trapezoid strip seen in perspective from above (wider at the bottom), with plain "
    "black metal side rails joining it at its upper corners. "
    "Design A 'SINGLE PRISM': a flat satin black plate with one long, low triangular bar of clear glass lying across its "
    "centre, a thin white line of light inside it, a faint spectrum where the light leaves one end. "
    "Design B 'INLAY': a flat satin black plate with a single wide chamfered window of clear smoked glass set flush in it, "
    "one diagonal facet line across the glass, a hairline of white light along the window's upper edge, a small hexagonal clear "
    "stud at the centre. "
    "Design C 'EDGE': a thick slab of clear glass with a polished 45-degree bevel along its upper edge that catches a line of "
    "light, sitting on a black base, nothing on its surface except one small engraved hexagon outline at the centre. No text. " + MINIMAL,
)
PICTURES["screen-min"] = (
    SHOT,
    "This is a screenshot of our PC rhythm game. Redraw it as clean concept art in the same layout and camera, 16:9. "
    "KEEP exactly as they are: the lane layout, the falling glass bar notes, the blue judgment line, the plain black metal side rails "
    "with their thin line of light, and the position of every element. Change only these, quietly: "
    "(1) the control deck below the judgment line: a flat satin black plate with one wide chamfered window of clear smoked glass set "
    "flush in it, one long low triangular bar of clear glass lying across its centre with a thin white line of light inside and a "
    "faint spectrum at one end, nothing else on it; "
    "(2) the combo number and the word COMBO: a clean, sharp italic sans-serif in plain white with a thin dark outline, no facets, no "
    "glass effect; (3) the judgment text 'MAX 100%': the same typeface, 'MAX' white and '100%' in a soft azure gradient, a hairline "
    "under it; (4) the HUD around the track (song title top-left, SCORE / RATE / MAX COMBO / SPEED on the left, the gauge on the "
    "right, the time): each on a small flat plate of smoked glass with chamfered corners and a hairline frame, labels in azure, "
    "values in white, the gauge a plain column of thin segments. The gauge's name reads 'FEVER' (not LUMEN). Keep all other texts "
    "the same words and numbers as in the screenshot, spelled correctly. " + MINIMAL,
)

# Fourth round: the minimal one lost the crystal. Crystal as the MATERIAL, built the way commercial rhythm-game gears are
# built (a body of layered panels with working-looking parts), with no glitter.
CRYSTAL = (
    "Material: the gear is carved from thick blocks of clear and lightly frosted crystal glass, like a solid acrylic or quartz "
    "trophy block, set in a slim satin graphite frame. You see the glass's thickness: polished bevels, crisp facet edges, the "
    "darker edge seen through the block, soft light carried inside the glass and gathered along its edges. Calm studio lighting. "
    "STRICTLY NO glitter: no sparkles, no star glints, no lens flare, no bloom, no rainbow streaks, no light rays, no smoke. "
    "At most a faint cool tint (ice blue) inside the glass. Colours: clear glass, frost white, graphite, a little azure light. "
)
BUILD = (
    "Construction, as commercial arcade-style rhythm game gears are built (do not copy any existing one): the gear is one designed "
    "object, not a decoration. Below the judgment line is a 'key deck': a row of key pads, exactly one per lane and aligned to the "
    "lanes (a wider pad for the wider far-left lane), each pad a block of crystal with a bevelled top like a real key cap; in "
    "front of the pads a slim centre name plate flanked by two small module panels with a few flush functional details (a "
    "slot, two small indicator windows, a seam). Angular chamfered panel cuts, layered plates, clean seams, a few tiny "
    "fasteners. The two side rails are slim glass light-guides in graphite channels that thicken into solid shoulder blocks "
    "where they meet the deck. Symmetrical, sturdy, engineered. "
)
PICTURES["deck-build"] = (
    None,
    "A design sheet on a near-black background, 16:9: three different designs, stacked one above the other with generous spacing, "
    "of the 'gear bottom' of a PC rhythm game with a seven-lane note highway plus one wider lane at the far left, each drawn as a "
    "wide low trapezoid seen in perspective from above (wider at the bottom), the lower ends of the two side rails joining it. "
    "Design A 'KEY BLOCKS': eight separate crystal key pads in a row filling the deck, thin graphite gaps between them, a slim "
    "centre plate in front. Design B 'MONOLITH': one long crystal slab whose top is cut into eight shallow bevelled key facets, "
    "graphite shoulder blocks at both ends, a centre plate inset in its front face. Design C 'CONSOLE': a graphite console with "
    "eight inset crystal key pads, a hexagonal crystal dial in a ring at the left end (over the wider lane), a frosted glass "
    "panel with two indicator windows at the right end. No text. " + BUILD + CRYSTAL,
)
PICTURES["screen-build"] = (
    SHOT,
    "This is a screenshot of our PC rhythm game. Redraw it as clean concept art in the same layout and camera, 16:9. "
    "KEEP exactly as they are: the lane layout, the falling glass bar notes, the blue judgment line, the top-left song information "
    "(do not restyle it at all) and the position of every element. Redesign the gear (the deck below the judgment line and the two "
    "side rails) as described below. Also restyle, plainly: the combo number and 'COMBO' in a clean sharp italic sans-serif, "
    "white, no glass effect; 'MAX 100%' in the same typeface, 'MAX' white and '100%' soft azure; the left score block (SCORE, "
    "RATE, MAX COMBO, SPEED) and the right gauge each on a flat plate of frosted crystal glass with chamfered corners that is "
    "attached to the gear's side rail like a mounted panel; the gauge's name reads 'FEVER' (not LUMEN). Keep all other texts the "
    "same words and numbers as in the screenshot, spelled correctly. " + BUILD + CRYSTAL,
)

# Fifth round: the user's pick is the first redraw (r2-screen); four things change. The deck follows what commercial gears do,
# seen in their store screenshots (DJMAX RESPECT V, EZ2ON REBOOT : R; the ideas only, nothing of theirs is copied): the gear is
# a flat graphic, not a 3D render; a row of key cells under the judge line; a thin strip, a chevron, a dark lower panel with
# working-looking parts; its character from a few low-poly facets at its corners.
PICK = RAW / "r2-screen.png"
EDIT = (
    "This is concept art of our PC rhythm game's play screen. Make a new version of it, 16:9, changing ONLY the four things below "
    "and keeping everything else exactly as it is (the lanes, the notes, the judgment line, the judgment text 'MAX 100%', the "
    "score plates on the left, the gauge on the right, the time, all positions). "
    "(1) Top-left song information: remove its crystal plate, frame and sparkles completely. It becomes plain flat interface text "
    "on the dark background: a small disc icon, 'Demo Groove 150', 'Generative Rhythm (합성 데모)', a flat red chip 'EXPERT Lv.9', "
    "'7K+1S', and an outlined chip 'AUTO'. It does not belong to the crystal theme. "
    "(2) The two crystal side rails: keep the cut-crystal material, but a little flatter and calmer: lower relief, fewer facets, "
    "no star glints, no rainbow flares. "
    "(4) The combo number '57' and the word 'COMBO': keep a cut-crystal look, but a little flatter and calmer: shallow bevel, no "
    "glints, no rainbow fringe. "
    "Also the small label over the gauge reads 'FEVER' instead of 'LUMEN'. "
    "(3) The gear bottom (the big winged gem ornament below the judgment line): REMOVE it and design a new one. It must look like "
    "the work of a professional UI designer at a rhythm game studio, a FLAT front-facing graphic, not a 3D render and not jewellery: "
    "crisp vector edges, flat fills with at most one soft gradient each, no ornament, no engraving, no wings, no big gem, no sparkles, "
    "no bloom, no lens flare. "
)
FLAT = (
    "Material within that flat style: frosted and clear crystal glass in ice white, pale azure and graphite, the crystal shown by a "
    "few flat facet planes of slightly different tone and one thin bright edge, as low-poly crystal. Restrained, minimal, exact. "
)
PICTURES["pick-a"] = (
    PICK,
    EDIT + "Its parts from top to bottom: directly under the judgment line a row of eight key cells aligned to the eight lanes "
    "(the far-left one wider), each a dark frosted-glass tile with a small diamond mark in its middle, one of them lit ice-white "
    "as if its key is pressed; under the row a thin bright strip; then a shallow V-shaped chevron band in two crystal tones (pale "
    "azure on the left half, ice white on the right) meeting at the centre; then a dark graphite lower panel with a row of four "
    "small square module slots, the first holding a small badge that reads 'SPEED 3.00', and fine diagonal hatch marks at both "
    "ends. At the two lower outer corners a low-poly crystal shoulder of three flat triangular facets each. " + FLAT,
)
PICTURES["pick-b"] = (
    PICK,
    EDIT + "Its parts from top to bottom: directly under the judgment line a row of eight key cells aligned to the eight lanes "
    "(the far-left one wider), each a clear crystal tile with a thin bright top edge, one of them lit pale azure as if its key is "
    "pressed; under the row one long low slab of frosted crystal with chamfered ends, its face split by a single diagonal facet "
    "line into a lighter and a darker plane; set flush in the slab's centre a small flat hexagon emblem of clear crystal with "
    "three facets; a hairline of light along the slab's lower edge; left and right of the emblem two tiny flat indicator "
    "windows. The side rails end in plain chamfered crystal blocks where they meet the slab. " + FLAT,
)

# Sixth round: after looking at some 25 commercial gears (store screenshots of DJMAX RESPECT V and its gear packs, EZ2ON
# REBOOT : R and its DLC panels). The gear stays a 3D object in the track's perspective (the game uses a tilted camera), its
# relief kept low. Borrowed, as ideas only: a row of key caps under the judge line that light when pressed; a symmetrical
# deck with one centre emblem; readouts housed in the deck; shoulders flaring where the rails meet it; fine line-work on a
# dark base for elegance in place of glitter.
EDIT3D = (
    "This is concept art of our PC rhythm game's play screen. Make a new version of it, 16:9, changing ONLY the things below and "
    "keeping everything else exactly as it is (the camera and perspective, the lanes, the notes, the judgment line, the judgment "
    "text 'MAX 100%', the gauge on the right, the time, all positions). "
    "(1) Top-left song information: remove its crystal plate, frame and sparkles completely. It becomes plain flat interface text "
    "on the dark background: a small disc icon, 'Demo Groove 150', 'Generative Rhythm (합성 데모)', a flat red chip 'EXPERT Lv.9', "
    "'7K+1S', and an outlined chip 'AUTO'. It does not belong to the crystal theme. "
    "(2) The two crystal side rails: keep the cut-crystal material, a little flatter and calmer: lower relief, fewer facets, "
    "no star glints, no rainbow flares. "
    "(4) The combo number '57' and the word 'COMBO': keep a cut-crystal look, a little flatter and calmer: shallow bevel, no "
    "glints, no rainbow fringe. "
    "Also the small label over the gauge reads 'FEVER' instead of 'LUMEN'. "
    "(3) The gear bottom (the big winged gem ornament below the judgment line): REMOVE it and design a new one as a real 3D "
    "object lying in the same perspective as the track, but restrained: LOW relief, soft even studio light, clean edges, no "
    "ornament carving, no sculpted wings, no big gem, no sparkles, no star glints, no bloom, no lens flare, no rainbow streaks. It "
    "should look like the gear of a commercial arcade rhythm game designed by a professional UI artist: symmetrical, engineered, "
    "elegant, with empty space. Material: clear and frosted cut crystal in ice white and pale azure over a dark navy-graphite "
    "base; the crystal reads from a few broad facet planes and thin bright edges. "
)
PICTURES["pick-c"] = (
    PICK,
    EDIT3D + "Its parts: directly under the judgment line a row of eight low crystal key caps aligned to the eight lanes (the "
    "far-left one wider), each a bevelled block of clear crystal with a tiny engraved four-point mark, one of them lit pale azure "
    "from inside as if its key is pressed. Under the row a dark navy-graphite deck panel, slightly sloped toward the viewer, with "
    "one small flat hexagonal cut-crystal emblem set flush at its centre, and fine hairline engraving in pale light spreading "
    "symmetrically from the emblem (a few thin straight lines and one thin arc, like a technical drawing), nothing else. Where "
    "the side rails meet the deck, a low crystal shoulder block of three broad facets on each side, flaring slightly outward. " ,
)
PICTURES["pick-d"] = (
    PICK,
    EDIT3D + "Also remove the two glass plates at the left (SCORE / RATE / MAX COMBO and SPEED): their readouts move into the gear "
    "bottom. Its parts: directly under the judgment line a row of eight low crystal key caps aligned to the eight lanes (the "
    "far-left one wider), each a bevelled block of clear crystal, one of them lit pale azure from inside as if its key is "
    "pressed. Under the row a dark navy-graphite deck panel, slightly sloped toward the viewer, holding three inset windows of "
    "smoked crystal with thin bright frames: a wide centre window reading 'SCORE 183,280', a smaller left window reading "
    "'SPEED 3.00', a smaller right window reading 'RATE 100.00%'; between them two thin hairlines. Where the side rails meet the "
    "deck, a low crystal shoulder block of three broad facets on each side, flaring slightly outward. Readout digits in a clean "
    "italic sans-serif, white, labels in pale azure. " ,
)

# ---------- skins (a skin: the gear, the notes, the hit effect, the combo and judgement lettering; not the side notes) ----------
# The 'default' skin (기본), after the user's eleven reference panels and guidelines (docs/GEAR_NOTE_FX_RESEARCH.md 6, 7).
BASE_SHOT = ROOT.parent / "docs" / "screenshots" / "03-play-7k.png"
RULES = (
    "Rules of this game's skins, all of which must hold. The gear (the frame of the note highway) is NO WIDER than the highway: its "
    "bottom deck is exactly as wide as the track and does not spread sideways. The side rails are thin. The gear is a 3D object in "
    "the track's perspective but with LOW relief and calm lighting: no sparkles, no glints, no bloom, no lens flare. Directly "
    "under the judgment line: a thin row of eight key indicator cells aligned to the lanes (the far-left lane is wider), one lit as "
    "if pressed. Under it the deck panel, which holds three readouts: 'SPEED 3.60' at the left, 'SCORE 180,233' in the centre "
    "(largest), 'RATE 100.00%' at the right. There are NO score plates floating at the left of the track any more. The gauge "
    "stays a thin vertical bar along the outside of the right rail, with '58%' and 'NORMAL' by it and the small label 'FEVER'. "
    "Top-left song information stays exactly as in the screenshot (plain text, its red chip 'DJMAX MX Lv.12', '7K+1S', 'AUTO'), "
    "and directly under it add the running time '0:27 / 0:41' with a thin horizontal progress bar about a third filled; remove "
    "the old time readout beside the track. A long note has NO tap-note cap at its start or its end: it is one body closed its own "
    "way, and the one being held is lit along its length with a light running inside it. "
)
BASE_LOOK = (
    "Skin 'DEFAULT' (기본): the neutral house style. Matte graphite and near-black, white text, ONE accent colour, a cyan "
    "(#37e2ff). Quiet, exact, a little technical, like well-made audio hardware; flat planes, fine seams, hairline accent lines, "
    "small tick marks; nothing ornamental. Notes: plain rounded bars, white and light blue alternating, gold in the centre lane, "
    "a pink bar with two slanted notches for the far-left turntable lane; each note's near edge crisp. Judgment line: a clean "
    "white core in a thin cyan glow. Hit effect: a short flat flash across the lane on the line and one thin ring, cyan-white. "
    "Combo: the number large in a condensed bold italic sans-serif, white with a thin dark outline, 'COMBO' small and "
    "letter-spaced under it. Judgment text 'MAX 100%': same typeface, 'MAX' white, '100%' cyan. "
)
PICTURES["skin-default-a"] = (
    BASE_SHOT,
    "This is a screenshot of our PC rhythm game (a tilted camera looking down a note highway). Redraw it as clean concept art for a "
    "new skin, 16:9, keeping the camera, the perspective, the lane layout and the notes' positions. " + RULES + BASE_LOOK +
    "This version: the deck is one low graphite slab with a chamfered front edge; the three readouts sit in three flush recessed "
    "windows with a hairline cyan line under each label; a small round dial detail at the far left of the deck under the wider "
    "lane; the key indicator cells are dark with a small cyan dash, the lit one solid cyan. " + TAIL,
)
PICTURES["skin-default-b"] = (
    BASE_SHOT,
    "This is a screenshot of our PC rhythm game (a tilted camera looking down a note highway). Redraw it as clean concept art for a "
    "new skin, 16:9, keeping the camera, the perspective, the lane layout and the notes' positions. " + RULES + BASE_LOOK +
    "This version: the key indicator cells are low physical key caps in graphite with a thin lighter top edge, the lit one "
    "glowing cyan from under its edges; the deck below is two stepped layers, the upper holding 'SCORE' in one wide window in the "
    "centre, the lower holding 'SPEED' and 'RATE' as two small pills at its left and right ends; a single thin cyan light strip "
    "runs across the deck's front edge; the rails each carry one hairline of cyan light. " + TAIL,
)
PICTURES["skin-default-parts"] = (
    None,
    "A clean design sheet on a near-black background, 16:9, for the 'DEFAULT' skin of a PC rhythm game; parts laid out in a tidy "
    "grid with generous spacing, small thin labels are allowed. " + BASE_LOOK +
    "Row one, the tap notes seen from the front-top: white, light blue, gold, and the pink turntable note. "
    "Row two, a long note laid horizontally, WITHOUT any tap-note cap at either end (one body, its two ends closed by a short "
    "chamfer of the same body): once idle, once held (brighter, a line of light running inside it, soft glow at the end that "
    "touches the judgment line). Row three, the hit effect as a six-frame sequence from the first bright frame to nothing, and "
    "the held long note's effect at the judgment line (a small steady flare with two short side streaks). Row four, the "
    "lettering: the combo '128' with 'COMBO', and the judgment texts 'MAX 100%', 'MAX 90%', 'MAX 50%', 'BREAK' (BREAK in a flat "
    "red), 'FEVER x3' as a small flat badge. Row five, a segment of the judgment line, and one key indicator cell idle and lit. " + TAIL,
)

# Skin 1, CRYSTAL: after the first of the user's reference panels (described in words; the picture itself is not sent).
DEFAULT_SHOT = ROOT.parent / "docs" / "screenshots" / "47-default-7k.png"
KEEP = (
    "This is a screenshot of our PC rhythm game with its default skin. Redraw it as clean concept art for a NEW SKIN, 16:9, keeping "
    "EXACTLY: the camera and perspective, the lane layout, where every note is, the top-left song information with its time and "
    "progress bar (do not restyle that block at all: it belongs to no skin), the place of the combo and of the judgment text, the "
    "gauge along the outside of the right rail with its label 'FEVER', the row of eight key caps directly under the judgment line "
    "(one per lane, the far-left wider, the pressed one lit), and the three readouts in the deck under them: 'SCORE' in the centre, "
    "'SPEED' at the left, 'RATE' at the right, with the same numbers. The gear stays NO WIDER than the track (a few shard tips may "
    "poke out a little at the bottom corners, no more). A long note has NO tap-note cap at its start or end. Restyle the gear, the "
    "notes, the hit effect, the judgment line, and the combo and judgment lettering as described. "
)
CRYSTAL_LOOK = (
    "Skin 'CRYSTAL': clear cut crystal on black. The look is LOW-POLY and graphic, not glittering: the crystal is drawn as a few "
    "LARGE flat facet planes in white, pale ice blue and pale lavender, each plane one flat tone or one soft gradient, meeting at "
    "crisp straight edges, like a paper-craft or vector crystal; here and there a facet carries a faint pastel iridescence "
    "(pink to cyan), very soft. NO sparkles, NO star glints, NO lens flare, NO bloom, NO rainbow rays, NO ornament. Low relief. "
    "Side rails: thin bright bands of clear glass, almost white, with one fine inner line, plain all the way up. "
    "Deck: under the key caps a cluster of big angular crystal shards and facet planes fills the deck, densest in the middle and "
    "at the lower corners, overlapping like a crushed-ice bouquet, in the same flat low-poly manner; the three readouts sit on "
    "small clear frosted plates set among the facets, digits dark navy or white for contrast, small and clean. "
    "Key caps: slabs of frosted crystal with a bright top edge; the pressed one glows ice blue from inside. "
    "Judgment line: a thin white line with a soft ice-blue edge. "
    "Notes: bevelled bars of clear glass, ice white and cobalt blue alternating, amber in the centre lane, a ruby hexagonal gem bar "
    "in the far-left lane; each note's near edge the brightest. Long note: a long triangular glass prism as wide as its lane's "
    "bar with a ridge of light down its middle, both ends closed by a facet (no bar caps); the held one is lit from inside. "
    "Hit effect: a small white flash on the line with a few thin flat shards in pale spectrum colours flying sideways, short. "
    "Combo number and 'COMBO': a clean geometric italic display type cut with one or two facet lines per glyph, white to ice "
    "blue, flat, no glints. Judgment text 'MAX 100%': the same type, 'MAX' white, '100%' ice blue. "
)
PICTURES["skin-crystal-a"] = (
    DEFAULT_SHOT,
    KEEP + CRYSTAL_LOOK + "This version: the shard cluster is asymmetrical and bold, a large pale wing of facets rising a little "
    "at the lower right corner and a smaller group at the lower left, the centre around the SCORE plate calmer. " + TAIL,
)
PICTURES["skin-crystal-b"] = (
    DEFAULT_SHOT,
    KEEP + CRYSTAL_LOOK + "This version: the shard cluster is symmetrical and quieter: a shallow bed of broad facets across the deck, "
    "like a cut gem seen from above (a table facet in the middle holding the SCORE plate, crown facets fanning to both sides), "
    "nothing poking outside the gear's width. " + TAIL,
)
PICTURES["skin-crystal-parts"] = (
    None,
    "A clean design sheet on a near-black background, 16:9, for the 'CRYSTAL' skin of a PC rhythm game; parts in a tidy grid with "
    "generous spacing, small thin labels allowed. " + CRYSTAL_LOOK +
    "Row one, the tap notes seen from the front-top: ice white, cobalt blue, amber, and the ruby gem bar for the turntable lane. "
    "Row two, a long note laid horizontally with NO tap-note cap at either end: once idle, once held (lit from inside, the ridge "
    "white-hot). Row three, the hit effect as a six-frame sequence from the first bright frame to nothing, and the small steady "
    "effect shown where a held long note meets the judgment line. Row four, the lettering: the combo '128' with 'COMBO', the "
    "judgment texts 'MAX 100%', 'MAX 90%', 'MAX 50%', 'BREAK' (BREAK as cracked ruby glass, flat), 'FEVER x3' as a small flat "
    "badge. Row five: a segment of the judgment line, one key cap idle and one lit, a short piece of the side rail. " + TAIL,
)

# CRYSTAL, version B with the lanes left alone: the lanes (the highway's floor) belong to no skin.
PICTURES["skin-crystal-b2"] = (
    RAW / "r2-skin-crystal-b.png",
    "This is concept art of a skin for our PC rhythm game. Make a new version of it, 16:9, changing ONLY ONE thing and keeping "
    "everything else exactly as it is (the crystal side rails, the row of crystal key caps, the faceted crystal deck with its "
    "SCORE, SPEED and RATE plates, the notes, the long note, the hit effect, the combo and judgment lettering, the gauge, the "
    "top-left song information, all positions). The one change: the LANES, the floor of the note highway between the two rails "
    "from the far end down to the judgment line. They belong to no skin, so remove every pastel facet, colour plane and "
    "iridescence from them and draw them as the game's plain floor: near-black (#0d0f14 to #15171f), each lane only very "
    "faintly tinted by its key colour (a barely visible dark wine red in the far-left lane, dark slate blue and dark neutral "
    "alternating in the others, a faint dark amber in the centre lane), thin hairline dividers between lanes at about ten "
    "percent white, nothing else on the floor. The notes then stand out clearly on it: ice-white, cobalt blue, amber and the "
    "ruby gem. The judgment line stays a thin white line with a soft ice-blue edge across the dark floor." + TAIL,
)

# CRYSTAL: the deck's readouts in the skin's own manner, unlike the default skin's windows and pills.
READOUT_EDIT = (
    "This is concept art of a crystal skin for our PC rhythm game. Make a new version of it, 16:9, changing ONLY the three "
    "readouts in the gear's bottom deck (SCORE 266,881, SPEED 3.00, RATE 100.00%) and keeping everything else exactly as it is "
    "(the dark lanes, the rails, the row of crystal key caps, the notes, the lettering in the track, the gauge, the top-left song "
    "information, the faceted deck itself, all positions). At present the readouts are a rounded rectangle and two pills, which is "
    "the default skin's manner. Redesign them so they belong to the crystal: flat, low-poly, crisp, no sparkles, no glints, no "
    "bloom; the numbers must stay large enough and high-contrast enough to read at a glance; same words and numbers, spelled "
    "correctly. "
)
PICTURES["skin-crystal-b3"] = (
    RAW / "r2-skin-crystal-b2.png",
    READOUT_EDIT + "Design: the deck reads as one cut gem seen from above, and the readouts are engraved on its facets. SCORE sits "
    "on the gem's table facet in the centre, a long hexagon with pointed left and right ends, of deep clear sapphire-navy "
    "crystal with a thin bright bevel all round; its label 'SCORE' small in ice blue above the number, the number large in white. "
    "SPEED and RATE sit on two crown facets left and right of the table, each a slanted parallelogram of the same deep crystal "
    "leaning outward along the facet lines, label over number. Thin bright facet lines run from the table's corners to the "
    "deck's corners. The lettering is the skin's italic geometric type." + TAIL,
)
PICTURES["skin-crystal-b4"] = (
    RAW / "r2-skin-crystal-b2.png",
    READOUT_EDIT + "Design: no dark plates at all. The readouts are cut into the pale crystal itself, as engraving filled with deep "
    "navy: the SCORE number large and centred on a broad pale facet with a fine double line under it and a small diamond mark "
    "at each end of the line, its label 'SCORE' small and letter-spaced above; SPEED at the left and RATE at the right each on a "
    "triangular facet, the label small above the number, with one fine line under. All digits deep navy on the pale crystal, "
    "the skin's italic geometric type." + TAIL,
)

# CRYSTAL: the readouts keep version B2's plates (their shapes and places), filled and lettered as B3's were.
PICTURES["skin-crystal-b5"] = (
    RAW / "r2-skin-crystal-b2.png",
    "This is concept art of a crystal skin for our PC rhythm game. Make a new version of it, 16:9, changing ONLY the inside of the "
    "three readout plates in the gear's bottom deck and keeping everything else exactly as it is, including the plates' shapes, "
    "sizes and places (the rounded SCORE plate in the centre, the SPEED pill at the lower left, the RATE pill at the lower "
    "right), their thin bright bevelled rims, the pale faceted crystal deck round them, the dark lanes, the rails, the key caps, "
    "the notes, the lettering in the track, the gauge and the top-left song information. The change: fill each plate with deep "
    "clear sapphire-navy crystal (a dark blue, about #1b2a5c to #24408a, with one soft diagonal facet a little lighter), and "
    "write on it in the skin's italic geometric type: the labels 'SCORE', 'SPEED', 'RATE' in ice blue (#7cc8ff), the numbers "
    "'266,881', '3.00', '100.00%' in white. Label and number side by side on one line as now. Flat and crisp: no sparkles, no "
    "glints, no bloom." + TAIL,
)

# CRYSTAL: the readouts' plates in the shape of the skin's gem note, a long hexagon with pointed ends.
PICTURES["skin-crystal-b6"] = (
    RAW / "r2-skin-crystal-b5.png",
    "This is concept art of a crystal skin for our PC rhythm game. Make a new version of it, 16:9, changing ONLY the OUTLINE SHAPE "
    "of the three readout plates in the gear's bottom deck and keeping everything else exactly as it is: the plates' places and "
    "sizes (SCORE in the centre, SPEED at the lower left, RATE at the lower right, all three INSIDE the gear, between its two "
    "rails, none of them outside it), their deep sapphire-navy fill, their thin bright bevelled rims, their lettering (labels in "
    "ice blue, numbers in white, label and number side by side on one line, the same words and numbers), the pale faceted crystal "
    "deck round them, the dark lanes, the rails, the key caps, the notes, the lettering in the track, the gauge and the top-left "
    "song information. The change: each plate is no longer a rounded rectangle or a pill. Each becomes a LONG HEXAGON, the shape "
    "of this skin's gem note (the ruby bar in the far-left lane): a wide flat bar whose left and right ends each come to a "
    "single point, so it has two long parallel edges (top and bottom) and two short slanted edges at each end meeting in a "
    "point at mid-height; six straight edges, six sharp corners, no rounded corners anywhere. The SCORE hexagon is the widest; "
    "the SPEED and RATE hexagons are smaller ones of the same proportions. Inside each, one thin facet line may run parallel to "
    "the outline a little way in, as on a cut gem's table. Flat and crisp: no sparkles, no glints, no bloom." + TAIL,
)

# CRYSTAL: a little of the crystal in the combo and the judgement lettering, two strengths.
TYPE_EDIT = (
    "This is concept art of a crystal skin for our PC rhythm game. Make a new version of it, 16:9, changing ONLY the lettering that "
    "stands in the track: the combo number '83' with the word 'COMBO' under it, and the judgment text 'MAX 100%' (the small '0ms' "
    "under it stays plain white). Keep everything else exactly as it is: the same words and numbers, the same places and sizes "
    "of that lettering, its italic geometric letterforms, the dark lanes, the rails, the key caps, the notes, the deck with its "
    "three hexagonal readout plates, the gauge and the top-left song information. The change is the SURFACE of those letters "
    "only: give them a little of the skin's cut crystal. It must stay perfectly legible at a glance and calm: NO sparkles, NO "
    "star glints, NO lens flare, NO bloom, NO rainbow fringe, no heavy 3D extrusion, no drop of legibility. "
)
PICTURES["skin-crystal-c1"] = (
    RAW / "r2-skin-crystal-b6.png",
    TYPE_EDIT + "Strength: SUBTLE. The letters stay flat. Each glyph is cut by one or two straight facet lines into two or three "
    "planes of slightly different tone (white, very pale ice blue, pale blue), like a flat vector drawing of cut glass, with a "
    "thin crisp bright edge along the top-left of each stroke and a thin dark navy outline for contrast against the lanes. '83' "
    "and 'COMBO' in white to pale ice blue; 'MAX' in white to pale ice blue, '100%' in ice blue to a slightly deeper sky blue." + TAIL,
)
PICTURES["skin-crystal-c2"] = (
    RAW / "r2-skin-crystal-b6.png",
    TYPE_EDIT + "Strength: A LITTLE MORE. The letters read as thin slabs of cut glass: a narrow shallow bevel runs round each "
    "glyph (lighter on its top-left edges, a shade deeper on its bottom-right ones), the face inside the bevel is a clear pale "
    "crystal with two or three broad facet planes of slightly different tone and a faint cool gradient from white at the top to "
    "ice blue at the bottom; a thin dark navy outline keeps them clear of the lanes. Low relief only. '83' and 'COMBO' in white to "
    "pale ice blue; 'MAX' in white to pale ice blue, '100%' in ice blue to a slightly deeper sky blue." + TAIL,
)

# CRYSTAL lettering again: the second strength plain to see at the screen's size (the first try of it barely differed and lost
# the hit effect), and the lettering alone, large, in the strengths side by side. The facets are those a flat fill can carry in
# the game: planes of tone split by straight lines at one angle across a word, a light along its top edges, a dark outline.
PICTURES["skin-crystal-c3"] = (
    RAW / "r2-skin-crystal-b6.png",
    TYPE_EDIT + "Also keep the hit effect (the white burst with its few pastel shards on the judgment line) exactly as it is. "
    "Strength: MODERATE, plain to see at normal viewing size without zooming in. Each word looks cut from one sheet of frosted "
    "crystal: its glyphs are filled with three or four flat planes of clearly different tone (pure white, pale ice blue, light "
    "steel blue, a little soft lavender) split by crisp straight diagonal lines that run at the same angle across the whole "
    "word, as the facets of a cut gem do; a thin bright highlight follows the top edges of the strokes; a thin dark navy outline "
    "keeps the letters clear of the lanes. No extrusion, low relief. '83' and 'COMBO' in whites and pale ice blues; 'MAX' in "
    "whites and pale ice blues, '100%' in ice blue, sky blue and a deeper azure plane." + TAIL,
)
PICTURES["skin-crystal-type"] = (
    None,
    "A lettering design sheet on a dark slate background (#14161d), 16:9, for the 'CRYSTAL' skin of a PC rhythm game. It shows the "
    "same in-game lettering in THREE strengths of crystal texture, in three columns of equal width with a thin label over each "
    "column: 'FLAT', 'SUBTLE', 'MODERATE'. Each column holds, top to bottom, drawn large and identical in size and layout across "
    "the columns: the combo '83' with the word 'COMBO' under it; then the judgment texts 'MAX 100%', 'MAX 90%', 'MAX 50%' and "
    "'BREAK'. The typeface in all columns is the same bold italic geometric sans-serif, with a thin dark navy outline. "
    "Column FLAT: plain flat fills, no texture: '83', 'COMBO' and 'MAX' white; '100%' sky blue, '90%' a lighter blue, '50%' pale "
    "lavender; 'BREAK' flat rose red. "
    "Column SUBTLE: the same colours, but each word is cut by ONE crisp straight diagonal line into two flat planes of slightly "
    "different tone (for white: pure white and very pale ice blue), with a thin bright highlight along the top edges of the "
    "strokes. Barely there. "
    "Column MODERATE: each word is cut by crisp straight diagonal lines at one shared angle into three or four flat planes of "
    "clearly different tone (for white: pure white, pale ice blue, light steel blue, a touch of soft lavender; for the blues: "
    "ice blue, sky blue, a deeper azure; for BREAK: rose, ruby and a dark garnet plane with one fine crack line), with a thin "
    "bright highlight along the top edges of the strokes, like letters cut from a sheet of frosted crystal. "
    "Everything is flat and crisp, vector-like: NO sparkles, NO star glints, NO lens flare, NO bloom, NO rainbow, no 3D "
    "extrusion. All words spelled exactly as given." + TAIL,
)

# ---------- the skins after the crystal one ----------
# What every later skin keeps of the default skin's screenshot (docs/GEAR_NOTE_FX_RESEARCH.md 7): the lanes, the song
# information, the places of things, the readouts in the deck. Each skin's look follows in words; the user's reference
# panels are described, never sent.
KEEP_SKIN = (
    "This is a screenshot of our PC rhythm game with its default skin. Redraw it as clean concept art for a NEW SKIN, 16:9, keeping "
    "EXACTLY: the camera and perspective; the LANES (the dark floor of the note highway between the two rails, from the far end "
    "down to the judgment line: they belong to no skin, so leave them as dark and plain as in the screenshot, with their faint "
    "lane tints and hairline dividers and nothing added on them); where every note is; the top-left song information with its "
    "time and progress bar (do not restyle that block at all: it belongs to no skin); the place of the combo and of the judgment "
    "text; the gauge along the outside of the right rail with its small label 'FEVER' and '75%' and 'NORMAL' by it; a row of "
    "eight key indicators directly under the judgment line (one per lane, the far-left one wider, the pressed one lit); and the "
    "three readouts in the deck under them, all INSIDE the gear between its two rails: 'SCORE 266,881' in the centre (the "
    "largest), 'SPEED 3.00' at the lower left, 'RATE 100.00%' at the lower right, the same words and numbers, spelled "
    "correctly. The gear stays NO WIDER than the track and its bottom does not spread sideways. The gear is a 3D object in the "
    "track's perspective but with LOW relief and calm lighting: no sparkles, no glints, no bloom, no lens flare. A long note has "
    "NO tap-note cap at its start or its end. Restyle ONLY the gear (the rails, the key indicators, the deck and the way the "
    "readouts are housed), the notes' shape and material (they keep their lane colours: white, light blue, gold in the centre "
    "lane, pink in the far-left lane), the long note, the hit effect, the judgment line, the look of the gauge, and the combo "
    "and judgment lettering, as described. "
)

# Skin 2, SKY: after the second of the user's reference panels (a deck that is a window onto a blue sky with clouds, thin
# white curves and a wing mark on it, thin white digits, slim glass rails with a fine scale, a navy capsule gauge of cyan dashes).
SKY_LOOK = (
    "Skin 'SKY': a clear daytime sky. Palette: sky blue (#3b8fd6 to #8fd0f5), cloud white, a deep navy (#0c1c33) for the small "
    "housings, and ONE accent, a cyan (#3fe3e6). Airy, light and calm. Drawn as a clean matte illustration with soft gradients, "
    "not a photograph: no sun, no sun rays, no lens flare, no sparkles, no birds, no aircraft, no characters. "
    "Deck: the deck is a WINDOW ONTO THE SKY, a deep clear blue at its far edge easing to a lighter blue toward the near edge, "
    "with a few soft white cumulus clouds low in it (most of the cloud in the lower third and toward the lower left, the middle "
    "kept clear blue), and two or three thin white curved hairlines sweeping across it in long gentle arcs, like wind trails. "
    "A thin white line runs along the deck's far edge. "
    "Side rails: slim strips of sky-blue tinted glass, each with a white hairline along its inner edge and fine evenly spaced "
    "tick marks along it like an altimeter's scale (ticks only, no numerals), plain all the way up. "
    "Gauge: a slim deep-navy capsule along the outside of the right rail holding one column of small cyan dashes, lit from the "
    "bottom up to the gauge's level, the unlit ones dim. "
    "Judgment line: a thin white line in a soft sky-blue glow, like a horizon. "
    "Notes: smooth matte bars with softly rounded corners, like glazed ceramic, each with a thin lighter top face and its near "
    "edge the brightest; the far-left lane's pink note is the same bar with a small white chevron (a wing) cut in its middle. "
    "Long note: a long band of translucent light in its lane's colour, like a contrail, as wide as its lane's bar, a soft white "
    "line down its middle, its two ends simply cut square with a thin white edge (no bar caps); the held one is brighter, its "
    "white middle line glowing and a soft light running along it to the judgment line. "
    "Hit effect: a soft white ring opening on the line like a puff of cloud, with two or three tiny white feather-shaped slivers "
    "drifting sideways; short, no sparks. "
)
PICTURES["skin-sky-a"] = (
    DEFAULT_SHOT,
    KEEP_SKIN + SKY_LOOK +
    "This version, the lightest: the readouts have NO boxes. They are written straight on the clear blue part of the sky in thin "
    "white digits, each with its small letter-spaced label ('SCORE', 'SPEED', 'RATE') beside it and a white hairline rule under "
    "it; a small white feather mark sits centred just above the SCORE readout. The key indicators are a row of thin short "
    "horizontal dashes, one per lane, pale blue-grey on a narrow deep-navy strip; the pressed lane's dash glows cyan-white. "
    "Combo number and 'COMBO': a light, wide, elegant italic sans-serif, large but with slender strokes, white easing to a pale "
    "sky blue at its foot, with a thin deep-navy outline so it reads over the lanes; 'COMBO' small and widely letter-spaced. "
    "Judgment text 'MAX 100%': the same type, 'MAX' white, '100%' cyan easing to sky blue. " + TAIL,
)
PICTURES["skin-sky-b"] = (
    DEFAULT_SHOT,
    KEEP_SKIN + SKY_LOOK +
    "This version, a little more solid: the sky in the deck is flatter and more graphic (two or three layered bands of stylised "
    "flat cloud along its near edge, the rest a clean blue gradient, the white wind-trail arcs kept). The readouts sit on three "
    "frosted cloud-white capsules with softly rounded ends, set flush in the sky, their digits deep navy and their small labels "
    "sky blue; the SCORE capsule widest in the centre, the SPEED and RATE capsules smaller at the lower left and right; a small "
    "navy feather mark at the left end of the SCORE capsule. The key indicators are low smooth key caps of matte cloud white with "
    "rounded corners, one per lane; the pressed one glows cyan from under its edges. "
    "Combo number and 'COMBO': a rounded, friendly but clean italic sans-serif of medium weight, white with a sky-blue lower "
    "third and a thin deep-navy outline; 'COMBO' small and letter-spaced. Judgment text 'MAX 100%': the same type, 'MAX' white, "
    "'100%' cyan easing to sky blue. " + TAIL,
)
PICTURES["skin-sky-parts"] = (
    None,
    "A clean design sheet on a near-black background, 16:9, for the 'SKY' skin of a PC rhythm game; parts in a tidy grid with "
    "generous spacing, small thin labels allowed. " + SKY_LOOK +
    "Row one, the tap notes seen from the front-top: cloud white, light blue, sunlight gold, and the pink note with the white "
    "chevron for the turntable lane. "
    "Row two, a long note laid horizontally with NO tap-note cap at either end: once idle, once held (brighter, its white middle "
    "line glowing). Row three, the hit effect as a six-frame sequence from the first bright frame to nothing, and the small "
    "steady effect shown where a held long note meets the judgment line. Row four, the lettering in TWO candidate typefaces, "
    "labelled 'A' and 'B', each showing the combo '128' with 'COMBO' and the judgment texts 'MAX 100%', 'MAX 90%', 'MAX 50%' and "
    "'BREAK': A is a light, wide, elegant italic sans-serif with slender strokes; B is a rounded italic sans-serif of medium "
    "weight; both white easing to sky blue with a thin deep-navy outline, '100%' cyan, '90%' sky blue, '50%' a pale periwinkle, "
    "'BREAK' a soft sunset coral. Row five: a segment of the judgment line; a key indicator idle and lit, once as a thin dash "
    "and once as a low white key cap; a short piece of the side rail with its tick marks; the gauge capsule with its cyan "
    "dashes; a small feather mark. " + TAIL,
)

# SKY, version B with the lanes left alone (the first try let the sky run up the lanes: they belong to no skin).
PICTURES["skin-sky-b2"] = (
    RAW / "r2-skin-sky-b.png",
    "This is concept art of a sky skin for our PC rhythm game. Make a new version of it, 16:9, changing ONLY ONE thing and keeping "
    "everything else exactly as it is (the sky-glass side rails with their tick marks, the row of white key caps under the "
    "judgment line with the pressed ones lit cyan, the deck below them with its sky, its clouds and its three cloud-white readout "
    "capsules, the notes, the long note, the hit effect, the combo and judgment lettering, the gauge capsule, the top-left song "
    "information, all positions). The one change: the LANES, the floor of the note highway between the two rails from the far "
    "end down to the judgment line. They belong to no skin, so remove the blue sky gradient, the clouds and the white curved "
    "wind-trail lines from them completely and draw them as the game's plain floor: near-black (#0d0f14 to #15171f) all the way "
    "down to the judgment line, each lane only very faintly tinted by its key colour (a barely visible dark wine red in the "
    "far-left lane, dark slate blue and dark neutral alternating in the others, a faint dark amber in the centre lane), thin "
    "hairline dividers between lanes at about ten percent white, nothing else on the floor. The sky, the clouds and the wind "
    "trails appear ONLY in the deck below the key caps. The judgment line stays a thin white line in a soft sky-blue glow "
    "across the dark floor." + TAIL,
)

# SKY's parts again: the first sheet gave half of itself to a tall picture of the deck that read as a track with a sky floor.
PICTURES["skin-sky-parts2"] = (
    None,
    "A clean design sheet on a near-black background, 16:9, for the 'SKY' skin of a PC rhythm game; parts in a tidy grid of five "
    "rows with generous spacing, small thin labels allowed. Do NOT draw the note highway, a track or any tall perspective "
    "preview anywhere on the sheet: parts only. " + SKY_LOOK +
    "Row one, the tap notes seen from the front-top: cloud white, light blue, sunlight gold, and the pink note with the white "
    "chevron for the turntable lane. "
    "Row two, a long note laid horizontally with NO tap-note cap at either end: once idle, once held (brighter, its white middle "
    "line glowing). "
    "Row three, the hit effect as a six-frame sequence from the first bright frame to nothing, and the small steady effect "
    "shown where a held long note meets the judgment line. "
    "Row four, the lettering in TWO candidate typefaces, labelled 'A' and 'B', each showing the combo '128' with 'COMBO' and the "
    "judgment texts 'MAX 100%', 'MAX 90%', 'MAX 50%' and 'BREAK': A is a light, wide, elegant italic sans-serif with slender "
    "strokes; B is a rounded italic sans-serif of medium weight; both white easing to sky blue with a thin deep-navy outline, "
    "'100%' cyan, '90%' sky blue, '50%' a pale periwinkle, 'BREAK' a soft sunset coral. "
    "Row five, the gear's parts: the DECK as one wide, short strip (about five times as wide as it is tall, seen from above) "
    "with its sky, low clouds, thin white arcs and feather mark, and the three readouts written on it, 'SCORE 266,881' in the "
    "centre, 'SPEED 3.00' at the left and 'RATE 100.00%' at the right; beside it a short piece of the side rail with its tick "
    "marks, the gauge capsule with its cyan dashes, a segment of the judgment line, and the key indicator in two candidate "
    "forms, each idle and lit: labelled 'DASH' (a thin short dash, lit cyan-white) and 'CAP' (a low white key cap, lit cyan "
    "from under its edges). " + TAIL,
)

# SKY, the user's pick: version A with version B's lettering and notes, and (the user's own exception, for this skin, to the
# rule that the lanes belong to no skin) the deck's sky laid very faintly over the lanes with its white curves kept. Two
# strengths of the faint sky, to choose from. Two pictures are sent: A to redraw, B2 to take the lettering and notes from.
SKY_PICK = (
    "The FIRST picture is concept art of a sky skin (version A) for our PC rhythm game; the SECOND picture is another version "
    "(B) of the same skin. Make a new version of the FIRST picture, 16:9, keeping everything of it exactly as it is (the camera, "
    "the sky-glass side rails with their tick marks, the row of thin dash key indicators on its navy strip, the deck's sky with "
    "its clouds, white arcs and feather mark, the readouts written on it with the same words and numbers, the gauge capsule, "
    "the top-left song information, where every note is, the hit effect, the judgment line) EXCEPT these three things. "
    "(1) LETTERING: draw the combo number '83', the word 'COMBO' and the judgment text 'MAX 100%' in the typeface of the SECOND "
    "picture, a rounded italic sans-serif of medium weight: the digits white with a sky-blue lower part and a thin deep-navy "
    "outline, 'COMBO' small and letter-spaced, 'MAX' white, '100%' cyan easing to sky blue. Same places and sizes as now; the "
    "small '0ms' under the judgment text stays plain white. "
    "(2) NOTES: draw the notes as the SECOND picture draws them: smooth softly rounded matte bars with a thin lighter top face "
    "(cloud white and light blue), the gold long note with its soft white middle line and NO caps at its ends, and the far-left "
    "lane's pink note carrying the small white pair-of-wings mark of the second picture in place of the chevron. Same positions. "
    "(3) LANES: the floor of the note highway between the two rails, from the far end down to the judgment line. Lay over the "
    "dark floor a faded image of the same sky that fills the deck, a deep blue at the far end easing to a lighter blue toward "
    "the judgment line, and keep on it two or three thin white curved hairlines sweeping across the lanes in long gentle arcs, "
    "like wind trails, passing UNDER the notes and the lettering. The floor must stay much darker than the deck, and the notes "
    "must stand out on it as clearly as before; the lane dividers stay as faint hairlines. "
)
PICTURES["skin-sky-c1"] = (
    (RAW / "r2-skin-sky-a.png", RAW / "r2-skin-sky-b2.png"),
    SKY_PICK + "Strength of the sky on the lanes: BARELY THERE. The floor still reads as near-black with only a hint of deep blue "
    "in it, a little bluer toward the judgment line; no clouds on it at all. The white curves are fine and clearly traceable "
    "but soft, at about a third of full white." + TAIL,
)
PICTURES["skin-sky-c2"] = (
    (RAW / "r2-skin-sky-a.png", RAW / "r2-skin-sky-b2.png"),
    SKY_PICK + "Strength of the sky on the lanes: FAINT BUT PLAIN TO SEE. The floor is a dark night blue in which the sky's "
    "gradient can clearly be made out (deep navy far away, a dim blue near the judgment line, about a quarter of the deck's "
    "brightness), with only the palest wisp of cloud low near the judgment line. The white curves are fine and clear, at "
    "about half of full white." + TAIL,
)

# SKY: c2 is the pick as asked (c1 took B's readout capsules too). The same with the lanes' sky a little stronger, to set
# how faint "very faint" is.
PICTURES["skin-sky-c3"] = (
    RAW / "r2-skin-sky-c2.png",
    "This is concept art of a sky skin for our PC rhythm game. Make a new version of it, 16:9, changing ONLY ONE thing and keeping "
    "everything else exactly as it is (the side rails with their tick marks, the row of thin dash key indicators, the deck's sky "
    "with its clouds, arcs and feather mark and the thin white readouts written on it, the notes with the wings mark on the pink "
    "one, the long note, the hit effect, the combo and judgment lettering, the gauge capsule, the top-left song information, "
    "the white curved hairlines that sweep across the lanes, all positions). The one change: the strength of the faint sky on "
    "the LANES, the floor of the note highway from the far end down to the judgment line. Make it a little stronger and clearer "
    "than it is now: a deep navy at the far end easing smoothly to a dim clear blue toward the judgment line, at its brightest "
    "about a third of the deck's brightness, like the same sky seen through dark glass; the pale wisp of cloud low near the "
    "judgment line may stay, very soft. The floor must still be plainly darker than the deck and than every note, the lane "
    "dividers stay as faint hairlines, and the white curves stay exactly as fine and as clear as they are." + TAIL,
)


# Skin 3, FIRESTARTER: the user's concept for this one is a pop group's 2026 comeback (K/DA FIRESTARTER), told to the model
# in words only: gloss black, polished chrome and one hot red, sharp silhouettes, fire as graphic shapes. No picture of
# it is sent, and no logo, name or character of it is asked for. Three screens to choose from. The lanes may carry the
# skin's picture very faintly (the strength the user set with the sky skin's c3).
KEEP_SKIN_FAINT = KEEP_SKIN.replace(
    "they belong to no skin, so leave them as dark and plain as in the screenshot, with their faint lane tints and hairline "
    "dividers and nothing added on them",
    "they stay the dark floor of the screenshot, near-black and clearly darker than the deck and than every note, with their "
    "faint lane tints and hairline dividers; this skin may lay over them ONLY the very faint picture described below, at no "
    "more than a third of the deck's brightness",
)
assert KEEP_SKIN_FAINT != KEEP_SKIN
FIRE_LOOK = (
    "Skin 'FIRESTARTER': the stage look of a pop group's comeback. Palette: gloss black (#0b0b0d), polished silver chrome "
    "(#c9ced6, with the dark horizon band chrome has), ONE hot red (#e8112d), and an orange-white heat (#ff7a1a to #fff1d6) "
    "only where something is lit or burning. Sharp silhouettes, clean reflective metal, fashionable and graphic like stage "
    "graphics and album artwork. Fire appears ONLY as graphic shapes (thin pinstripe flame lines, small sharp sparks): NO "
    "realistic flames, no smoke, no clouds of particles, no lens flare, no sparkles, no characters. "
    "Side rails: slim strips of polished chrome, each with a red hairline along its inner edge, plain all the way up. "
    "Gauge: a slim gloss-black capsule along the outside of the right rail holding one column of small slanted segments, lit "
    "from the bottom up to the gauge's level: deep red at the bottom heating to orange, the topmost lit one orange-white; "
    "the unlit ones dark. "
    "Judgment line: a thin white-hot line in a red glow, like a heated wire. "
    "Long note: a long band in its lane's colour like a tube of heated glass, as wide as its lane's note, with a thin "
    "white-hot line down its middle; its two ends are simply cut (no tap-note caps) with a thin bright edge; the held one "
    "burns brighter, an orange-white light running along it to the judgment line. "
    "Hit effect: the strike of a lighter: a short white-hot flash on the line and five or six thin sharp sparks flying up and "
    "outward, bright streaks with red tails, gone at once; no ring, no smoke. "
)
# The user's staging for this skin: the group's members stand at both sides of the gear. Their pictures are not made here
# and none is sent: the concept shows blank silhouettes where the pictures will stand, so the tail that forbids people is
# replaced for these three (a third entry in the tuple).
FIRE_STAGE = (
    "Staging: at each side of the gear stand TWO tall flat placeholder cut-outs, four in all, like blank standees: each a "
    "plain dark-grey silhouette in the outline of a standing performer (a simple mannequin outline: no face, no hair detail, "
    "no clothing detail, no features at all), about two-thirds of the screen's height, their feet at the bottom of the screen, "
    "the inner one a little in front of the outer one and overlapping it slightly, each with a thin red rim light along one "
    "side. They stand BESIDE the gear, never over the lanes or the deck, and behind the top-left song information and the "
    "gauge's labels. They are placeholders for pictures added later, so keep them blank. "
)
FIRE_TAIL = (
    " Original design: it must not resemble any existing game's interface. No logos, no watermark, no real or known "
    "characters: the only figures are the four blank silhouettes."
)
PICTURES["skin-fire-a"] = (
    DEFAULT_SHOT,
    KEEP_SKIN_FAINT + FIRE_LOOK + FIRE_STAGE +
    "This version, the most minimal: the deck is one panel of gloss black lacquer with one soft straight reflection, and "
    "across its lower left runs a single pinstripe flame: three or four long licks drawn ONLY as thin chrome outlines, flat "
    "on the lacquer like the pinstriping of a custom paint job. A thin red line runs along the deck's far edge. The readouts "
    "have NO boxes: they are written straight on the black in polished-chrome digits, each with its small letter-spaced red "
    "label ('SCORE', 'SPEED', 'RATE') beside it and a chrome hairline rule under it. The key indicators are a row of thin "
    "short horizontal dashes, one per lane, dark red on a narrow black strip; the pressed lane's dash glows orange-white. "
    "Notes: glossy lacquered bars with crisp square corners in their lane colours, each with a thin chrome edge along its near "
    "side (the brightest part) and one thin straight highlight; the far-left lane's pink note is the same bar with a small "
    "white double slash cut in its middle. The faint picture on the lanes: two or three thin red pinstripe flame lines "
    "sweeping up the floor in long curves, barely brighter than the floor, and nothing else. "
    "Combo number and 'COMBO': a heavy, wide italic sans-serif with sharply cut corners, filled as polished chrome (white at "
    "the top, a dark horizon band across the middle, pale silver below) with a thin red outline; 'COMBO' small, widely "
    "letter-spaced, red. Judgment text 'MAX 100%': the same type, 'MAX' chrome, '100%' orange-white easing to hot red. ",
    FIRE_TAIL,
)
PICTURES["skin-fire-b"] = (
    DEFAULT_SHOT,
    KEEP_SKIN + FIRE_LOOK + FIRE_STAGE +
    "This version, the boldest: the deck is a panel of candy-apple red lacquer with one soft straight reflection and a thin "
    "chrome trim round it, and two long black wedges sweep in from its lower corners toward the centre, flat inlays with "
    "sharp points. The readouts sit in three windows of black glass shaped as slanted parallelograms, each with a thin chrome "
    "bevel, set flush in the red: digits chrome-white, small labels red; the SCORE window widest in the centre, the SPEED and "
    "RATE windows smaller at the lower left and right. The key indicators are low key caps of polished chrome whose two short "
    "ends are cut at a slant, one per lane; the pressed one glows hot orange-red from under its edges. "
    "Notes: glossy bars whose two short ends are cut at a slant (slim parallelograms) in their lane colours, each with a thin "
    "chrome edge along its near side; the far-left lane's pink note is the same shape with a small white double slash cut in "
    "its middle; a long note's two ends are cut at the same slant. The lanes stay plain. "
    "Combo number and 'COMBO': a tall, tight, condensed heavy italic sans-serif like a tour poster's, white-hot at the top "
    "easing through orange to hot red at its foot, with a thin black outline and a chrome hairline round that; 'COMBO' small, "
    "widely letter-spaced, chrome. Judgment text 'MAX 100%': the same type, 'MAX' chrome-white, '100%' orange easing to red. ",
    FIRE_TAIL,
)
PICTURES["skin-fire-c"] = (
    DEFAULT_SHOT,
    KEEP_SKIN_FAINT + FIRE_LOOK + FIRE_STAGE +
    "This version, dark and smouldering: the deck is matte soot-black metal with a very fine brushed grain, and its far edge, "
    "just under the key indicators, BURNS: one thin irregular ember line across the whole width, orange-white at its core and "
    "deep red at its fringe, like the glowing edge of burning paper, the black just below it very slightly greyed like ash. "
    "Nothing else on the deck glows. The readouts are housed in three slim recessed windows with sharply chamfered corners, "
    "each edged by a chrome hairline, their glass a dark red-black; digits orange-white like a heated filament, small labels "
    "chrome silver; the SCORE window widest in the centre with a small flat chrome flame mark of two licks at its left, the "
    "SPEED and RATE windows smaller at the lower left and right. The key indicators are a row of short chrome bars, one per "
    "lane, on a narrow black strip; the pressed one glows orange-white. "
    "Notes: flat matte bars with crisp square corners in their lane colours, each with a bright near edge and a thin dark red "
    "line under it; the far-left lane's pink note is the same bar with a small white double slash cut in its middle. The "
    "faint picture on the lanes: a red heat rising from the judgment line over the lowest fifth of the floor only, fading "
    "to nothing above, barely there. "
    "Combo number and 'COMBO': a heavy italic sans-serif with sharply cut corners, like stencilled steel: silver-white at the "
    "top easing to an ember orange and hot red at its foot, with a thin black outline; 'COMBO' small, widely letter-spaced, "
    "chrome silver. Judgment text 'MAX 100%': the same type, 'MAX' silver-white, '100%' orange-white easing to hot red. ",
    FIRE_TAIL,
)


# Skin 4 became four skins, one for each of four AI companies (the user, 2026-11-11): the deck in the company's key colour
# and with something of the company's own look, the notes carrying its mark, and the company's two stickers at the gear's
# two sides. Neither the marks nor the stickers are made here and none is sent: the concept shows a plain white disc where
# a note's mark goes and blank shapes where the stickers go (the player's own pictures, read on the player's PC).
AI_STAGE = (
    "Staging: beside the gear sit TWO blank sticker placeholders. At the LEFT of the gear, rising from the bottom edge of the "
    "screen, a large one about 45% of the screen's height: a flat pale-grey rounded shape like the head and shoulders of a "
    "bust seen from below (no face, no hair detail, no features at all) with a wide white die-cut sticker border and a soft "
    "small drop shadow, its lower right corner tucked behind the gear. At the RIGHT of the gear, near the bottom of the "
    "screen, a smaller one about 24% of the screen's height: a plain pale-grey square with rounded corners, the same white "
    "die-cut border and drop shadow, tilted five degrees. They sit BESIDE the gear, never over the lanes or the deck, and "
    "behind the gauge's labels. They are placeholders for pictures added later, so keep them blank. "
    "Every note (but not a long note) carries in its middle ONE small plain white disc with a thin dark rim, as tall as the "
    "note: the place of an emblem added later; keep the discs blank. "
)
AI_TAIL = (
    " Original design: it must not resemble any existing game's interface. No logos, no brand marks, no product names, no "
    "watermark, no characters, no people: the two sticker shapes and the notes' discs stay blank."
)
PICTURES["skin-gpt"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'G': the look of a calm, minimal chat assistant's dark interface. Palette: a soft near-black (#212121), a darker "
    "black (#171717), a raised dark grey (#2f2f2f), white (#ffffff), a quiet grey (#b4b4b4), and ONE accent, a teal green "
    "(#10a37f). Flat, quiet, generous rounded corners, no gradients, no gloss, no glow except where something is lit. "
    "Deck: one flat panel of the near-black. In its centre sits a long fully rounded pill of the raised dark grey, like the "
    "message box of a chat app: 'SCORE' small and grey at its left, the number '266,881' large and white in a clean modern "
    "sans-serif, and at its right end a small solid white circle holding a black upward arrow. At the lower left and lower "
    "right two smaller outlined pills (a thin grey outline, no fill) hold 'SPEED 3.00' and 'RATE 100.00%', like suggestion "
    "chips. Nothing else on the deck. A hairline of the teal green runs along the deck's far edge. "
    "Key indicators: a row of softly rounded squares of the raised dark grey, one per lane; the pressed one is solid teal "
    "green with one small white dot in its middle. "
    "Side rails: slim flat strips of the raised dark grey, each with a teal-green hairline along its inner edge, plain all "
    "the way up. "
    "Gauge: a slim dark rounded capsule along the outside of the right rail holding one column of small rounded segments, "
    "lit teal green from the bottom up to the gauge's level, the unlit ones dark grey. "
    "Judgment line: a thin white line in a soft teal-green glow. "
    "Notes: flat bars with generously rounded corners like chat message bubbles, in their lane colours, matte, each with a "
    "slightly lighter top edge; the far-left lane's pink note is the same bar. "
    "Long note: a long flat rounded band in its lane's colour, as wide as its lane's note, a soft lighter line down its "
    "middle, its two ends cut straight across (square, no caps); the held one is brighter. "
    "Hit effect: three small white dots in a row popping up over the hit, like a typing indicator, and one thin teal-green "
    "ring opening; short. "
    "Combo number and 'COMBO': a clean, modern, slightly wide sans-serif in heavy weight, solid white with a thin near-black "
    "outline; 'COMBO' small, grey, widely letter-spaced. Judgment text 'MAX 100%': the same type, 'MAX' teal green, '100%' "
    "white. " + AI_STAGE,
    AI_TAIL,
)
# The first GPT screen was plain (the user: no character of its own): the deck itself in the key colour, and on it the parts
# of a chat window: the white message box with its round send button, a reply's small action marks, a typing dot.
PICTURES["skin-gpt2"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'G': the look of a friendly chat assistant's window, in its well-known teal green. Palette: a teal green "
    "(#10a37f) as the MAIN colour of the gear, a deeper green (#0b7d62), pure white (#ffffff), a near-black (#0d0d0d) and a "
    "soft light grey (#ececec). Flat, clean and friendly, with generous fully rounded corners; no gradients but one gentle "
    "darkening of the green toward the near edge, no gloss, no glow except where something is lit. "
    "Deck: one flat panel of the teal green, a little deeper green toward its near edge. In its centre lies a long fully "
    "rounded pill of pure white, like the message box of a chat app: at its left end a small grey plus sign, then 'SCORE' "
    "small and grey and the number '266,881' large in near-black in a clean modern sans-serif, and at its right end a solid "
    "near-black circle holding a white upward arrow (a send button). At the lower left a small rounded speech bubble of "
    "translucent white holds 'SPEED 3.00' in white, and just right of it sit three small solid white dots in a row, the "
    "middle one a little larger (someone typing). At the lower right 'RATE 100.00%' is written in white straight on the "
    "green, followed by two tiny white outline marks side by side: a thumbs-up and a pair of overlapping squares (copy). "
    "Nothing else on the deck. "
    "Key indicators: a row of softly rounded white squares like app tiles, one per lane, with a hairline gap between them; "
    "the pressed one is solid near-black with one white dot in its middle. "
    "Side rails: slim flat white strips, each with a teal-green hairline along its inner edge, plain all the way up. "
    "Gauge: a slim white rounded capsule along the outside of the right rail holding one column of small rounded segments, "
    "lit teal green from the bottom up to the gauge's level, the unlit ones light grey. "
    "Judgment line: a thin white line in a soft teal-green glow. "
    "Notes: flat matte discs in their lane colours, each with a thin white rim (the place of an emblem added later). "
    "Long note: a long flat rounded band in its lane's colour, as wide as its lane's note, a soft lighter line down its "
    "middle, its two ends cut straight across (square, no caps); the held one is brighter. "
    "Hit effect: three small white dots in a row popping up over the hit, like a typing indicator, and one thin white ring "
    "opening; short. "
    "Combo number and 'COMBO': a clean, modern, slightly wide sans-serif in heavy weight, solid white with a thin near-black "
    "outline; 'COMBO' small, white, widely letter-spaced. Judgment text 'MAX 100%': the same type, 'MAX' teal green with a "
    "thin white outline, '100%' white. "
    "Staging: at the gear's lower LEFT and lower RIGHT, standing on the bottom edge of the screen and touching the gear's "
    "two sides, sit two blank sticker placeholders, each about 30% of the screen's height: at the left a flat pale-grey "
    "rounded shape like the head and shoulders of a bust (no face, no features), at the right a plain pale-grey rounded "
    "square, each with a white die-cut sticker border. They are placeholders for pictures added later, so keep them blank. ",
    AI_TAIL,
)
PICTURES["skin-gemini"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'S': the look of a friendly assistant drawn in soft material design, on a dark surface. Palette: a blue-black "
    "surface (#131314), a raised surface (#1e1f20), a soft white (#e3e3e3), and a gradient that runs from blue (#4285f4) "
    "through violet (#9b72cb) to a warm pink (#d96570); as small accents only, four clear colours in this order: blue "
    "(#4285f4), red (#ea4335), yellow (#fbbc04), green (#34a853). Soft, rounded, friendly; smooth gradients only where "
    "named; no gloss, no metal. "
    "Deck: one flat panel of the blue-black surface. Along its far edge, just under the key indicators, lies a soft band of "
    "light in the blue-violet-pink gradient, brightest at the edge and fading down into the panel within a short distance, "
    "like a glow rising behind a prompt box. In the centre a large fully rounded pill of the raised surface with a thin "
    "outline in the blue-violet-pink gradient holds 'SCORE' small and grey and the number '266,881' large and soft white in "
    "a rounded geometric sans-serif. At the lower left and lower right two smaller pills of the raised surface (no outline) "
    "hold 'SPEED 3.00' and 'RATE 100.00%'. Two or three tiny four-pointed sparkles (thin, concave-sided stars) in soft white "
    "sit near the score pill's upper right, small and quiet. "
    "Key indicators: a row of fully rounded short pills of the raised surface, one per lane; the pressed one is lit in one "
    "clear colour, the colours going blue, red, yellow, green across the lanes. "
    "Side rails: slim strips of the raised surface, each with a hairline in the blue-violet-pink gradient along its inner "
    "edge, plain all the way up. "
    "Gauge: a slim dark rounded capsule along the outside of the right rail holding one column of small round dots, lit "
    "from the bottom up to the gauge's level in the gradient (blue at the bottom, violet, pink at the top), the unlit dim. "
    "Judgment line: a thin white line in a glow that runs blue at the left through violet to pink at the right. "
    "Notes: smooth fully rounded bars (pills) in their lane colours, matte with a soft lighter top; the far-left lane's "
    "pink note is the same pill. "
    "Long note: a long soft band of light in its lane's colour, as wide as its lane's note, lighter down its middle, its two "
    "ends cut straight across (square, no caps); the held one is brighter. "
    "Hit effect: three or four small four-pointed sparkles (concave-sided stars) popping and fading round the hit, soft "
    "white with a touch of blue and pink, and a soft round glow; short. "
    "Combo number and 'COMBO': a rounded geometric sans-serif in bold weight, filled with the gradient (blue at the left "
    "through violet to pink at the right) with a thin blue-black outline; 'COMBO' small, soft white, widely letter-spaced. "
    "Judgment text 'MAX 100%': the same type, 'MAX' in the gradient, '100%' soft white. " + AI_STAGE,
    AI_TAIL,
)
PICTURES["skin-grok"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'X': stark, minimal, black and white, like the console of a spacecraft drawn by a typographer. Palette: pure black "
    "(#000000), white (#ffffff), two greys (#8b8b8b and #2a2a2a); NO colour at all in the gear. Hard edges, square "
    "corners, thin white hairlines, monospaced capitals, a great deal of empty black. "
    "Deck: one flat panel of pure black with a white hairline round it. A sparse field of tiny white stars (single dots, a "
    "few a little brighter) lies over it, and ONE long thin white line crosses it at a slant from the lower left to the "
    "upper right. In the centre, written straight on the black with no box, 'SCORE' small and grey above the number "
    "'266,881' in large white monospaced digits, with a thin white rule under it and a small white square bracket at each "
    "of its ends. At the lower left and lower right, in the same monospaced type but small: 'SPEED 3.00' and "
    "'RATE 100.00%', each between thin white brackets. "
    "Key indicators: a row of square boxes drawn with a thin white outline on black, one per lane; the pressed one is solid "
    "white. "
    "Side rails: thin white hairlines, each doubled by a second fainter grey line just outside it, plain all the way up. "
    "Gauge: a slim black bar with a white hairline outline along the outside of the right rail holding one column of thin "
    "flat white segments, lit from the bottom up to the gauge's level, the unlit ones dark grey. "
    "Judgment line: a thin, hard, pure white line with only a very slight white glow. "
    "Notes: flat bars with perfectly square corners in their lane colours, each with a hard thin white line along its near "
    "edge and a thin black line under it; the far-left lane's pink note is the same bar. "
    "Long note: a long flat band in its lane's colour with a thin white line along each of its two long sides, as wide as "
    "its lane's note, its two ends cut straight across (square, no caps); the held one is brighter. "
    "Hit effect: two thin white straight strokes crossing at a slant over the hit, like a quick cross drawn with a pen, and "
    "one thin white ring opening round them; very short, no glow. "
    "Combo number and 'COMBO': heavy monospaced digits with square corners, solid white with a thin black outline; 'COMBO' "
    "small, grey, monospaced capitals, widely letter-spaced. Judgment text 'MAX 100%': the same type, all white. "
    + AI_STAGE,
    AI_TAIL,
)
PICTURES["skin-claude"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'C': warm, bookish and hand-made, like a page of good paper with a few drawn marks. Palette: a warm cream paper "
    "(#f0eee6), a lighter ivory (#faf9f5), a terracotta orange (#d97757), a warm charcoal (#141413) for lettering, and a "
    "warm grey (#b0aea5). Matte, calm, a little organic: slightly irregular hand-drawn lines, serif lettering, no gloss, no "
    "metal, no neon, no glow except the judgment line and a lit key. "
    "Deck: one flat panel of the warm cream paper with a very faint paper grain. A band of terracotta runs straight along "
    "its far edge, just under the key indicators. In the centre sits a softly rounded card of the lighter ivory with a thin "
    "warm-grey outline, like a writing box: 'SCORE' small in terracotta at its upper left, the number '266,881' large in "
    "charcoal in an elegant old-style serif typeface, and at its lower right corner a small solid terracotta rounded square "
    "holding a cream upward arrow. At the lower left and lower right, written straight on the paper in the same serif: "
    "'SPEED 3.00' and 'RATE 100.00%', the labels terracotta and the numbers charcoal. In the lower left corner of the deck, "
    "small, ONE loose hand-drawn terracotta line doodle: an open looping scribble like a ball of thread, drawn with a brush "
    "pen. Nothing else. "
    "Key indicators: a row of softly rounded squares of the warm grey on the cream, one per lane; the pressed one is solid "
    "terracotta with a small cream dot. "
    "Side rails: slim strips of the cream paper, each with a terracotta hairline along its inner edge, plain all the way up. "
    "Gauge: a slim cream rounded capsule with a thin charcoal outline along the outside of the right rail holding one "
    "column of small rounded segments, lit terracotta from the bottom up to the gauge's level, the unlit ones warm grey. "
    "Judgment line: a thin cream-white line in a soft terracotta glow. "
    "Notes: softly rounded matte bars like pieces of cut paper in their lane colours, each with a thin lighter edge along "
    "its near side; the far-left lane's pink note is the same bar. "
    "Long note: a long flat band in its lane's colour like a strip of cut paper, as wide as its lane's note, a slightly "
    "lighter line down its middle, its two ends cut straight across (square, no caps); the held one is brighter. "
    "Hit effect: ten or twelve short hand-drawn strokes of uneven length bursting outward from the hit like rays, cream-white "
    "with terracotta tips; short, no ring, no glow. "
    "Combo number and 'COMBO': an elegant old-style serif typeface in bold weight, cream at the top easing to terracotta at "
    "its foot, with a thin charcoal outline; 'COMBO' small, terracotta, in small capitals, widely letter-spaced. Judgment "
    "text 'MAX 100%': the same serif, 'MAX' terracotta, '100%' cream. " + AI_STAGE,
    AI_TAIL,
)


# Skins 5 to 11: each after one of the user's reference panels (a commercial game's panel skins the user showed in chat),
# as close to its concept as words allow. The reference pictures are not sent and are not in the repository: what was seen
# in each is written here in words only. Every one keeps this game's layout: the SCORE in the upper middle of the deck, the
# SPEED and the RATE at its lower left and right, and where a reference has an emblem in the middle of its panel, the emblem
# goes in the lower middle, between the two smaller readouts.
EMBLEM_ROW = (
    "Layout of the deck: the SCORE readout in the upper middle (the largest); in the lower row the SPEED readout at the left, "
    "the RATE readout at the right, and the emblem described below in the middle between them. "
)

# Skin 5 (the reference: white armour plates with chamfers round a dark teal glass, aqua stripes, hot-pink outlines and hatch
# marks, a white ring emblem with three notches, gloss white keys with two of them aqua, a slim gauge from aqua to pink).
PICTURES["skin-aqua"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'AQUA MECHA': the console of a clean white sci-fi machine with aqua and hot-pink accents. Palette: gloss white "
    "armour (#f4f7fa, shaded with pale blue-grey), a dark teal-black glass (#06171a to #0d2a2e) for the panels, ONE aqua "
    "(#22e0e6) and ONE hot pink (#ff3f93), the pink only as thin outlines and small hatch marks. A crisp flat vector look "
    "with 45-degree chamfered silhouettes; no rust, no dirt, no rivets, no sparkles. "
    + EMBLEM_ROW +
    "Deck: a panel of dark teal-black glass framed by white armour plates with chamfered corners: one white plate along its "
    "far edge under the keys, stepping down at both ends, and a white wedge plate at each side edge pointing inward. A thin "
    "hot-pink line runs round the outside of the white plates. On the glass, at the left and at the right, a small slanted "
    "block of four or five aqua stripes like a vent, and a few short pink hatch strokes at the two near corners. The emblem: "
    "a thick white ring with three small arrow-shaped notches cut in it at equal spacing (like a rotation mark) round a "
    "solid pale disc, glowing softly aqua, with two faint concentric rings on the glass round it. The readouts are written "
    "on the dark glass with NO boxes: small aqua labels in a wide squared sans-serif, the digits white and rounded; the "
    "SCORE sits in a shallow dark window cut into the middle of the white far plate. "
    "Key indicators: a row of glossy key caps like a piano's keys in a white frame whose two lower corners are chamfered: "
    "gloss white caps, the caps of the light-blue lanes gloss aqua-blue; the pressed one glows aqua-white. "
    "Side rails: slim white strips, each with a thin aqua hairline along its inner edge and a thin pink hairline along its "
    "outer edge, plain all the way up. "
    "Gauge: a slim bar along the outside of the right rail in a thin white frame whose top end is cut at a slant; its fill a "
    "smooth gradient from hot pink at the bottom to aqua at the top, lit up to the gauge's level, dark glass above. "
    "Judgment line: a thin white line in an aqua glow with a pink hairline just under it. "
    "Notes: low armour plates with their four corners chamfered, in their lane colours, each with a thin white rim and a "
    "brighter near edge; the far-left lane's pink note is the same plate with a small white chevron cut in its middle. "
    "Long note: a long band in its lane's colour like a light rail, a darker see-through body between two bright edges with "
    "a row of small chevrons down its middle pointing to the judgment line; its two ends cut straight across (no caps); the "
    "held one is brighter. "
    "Hit effect: a hexagonal ring of aqua light snapping open with four short pink dashes flying out to the sides, like a "
    "lock-on marker; short, no sparks. "
    "Combo number and 'COMBO': a wide squared technical sans-serif with cut corners and even strokes, slightly italic, white "
    "with a thin aqua outline; 'COMBO' small, aqua, widely letter-spaced. Judgment text 'MAX 100%': the same type, 'MAX' "
    "white, '100%' aqua easing to hot pink. ",
)

# Skin 6 (the reference: two matte slate panels, key caps embossed with plus and cross marks, a recessed slot with a dim blue
# glow, readouts in dark pills that begin with one coloured letter, a brushed-aluminium gauge housing with an orange bar).
PICTURES["skin-steel"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'GUNMETAL': a piece of professional audio hardware in dark slate grey. Palette: matte gunmetal and slate blue-grey "
    "(#1b222b to #303a46), near-black seams, brushed aluminium (#aab2bb) only for the gauge's housing, ONE dim steel-blue "
    "glow (#2f7fc0), and two tiny status colours, a green (#4fd13a) and a blue (#3b82f6), used only for the readouts' small "
    "labels and one LED. Matte anodised metal with soft shallow bevels, very calm and dark; no carbon fibre, no stickers, no "
    "screws everywhere, no sparkles. "
    "Deck: two stacked matte slate panels divided by a dark horizontal seam. The far one is plain, with a shallow recessed "
    "slot (a wide rounded trapezoid) at the middle of its far edge that glows dim steel-blue from inside. The near one is a "
    "shade darker, with one thin engraved rule across it, a soft steel-blue glow at its right end and three small embossed "
    "circles in a trefoil at its lower right corner. The readouts are in dark rounded capsule windows (pills) recessed into "
    "the panels: each holds its small label in colour ('SCORE' blue, 'SPEED' and 'RATE' green), a small dot, then white "
    "rounded digits; the SCORE pill in the middle of the far panel under the slot, the SPEED and RATE pills in the near "
    "panel at the left and right. "
    "Key indicators: a row of flush matte slate key caps divided by thin dark seams, each embossed with a small mark in its "
    "middle: a plus sign on most, a cross (x) on the light-blue lanes' caps; the pressed one's mark glows steel-blue. "
    "Side rails: thin dark slate strips with a fine lighter edge, plain all the way up. "
    "Gauge: along the outside of the right rail a slim brushed-aluminium housing with rounded ends holding a bar that fills "
    "from orange (#ff9a1f) at the bottom to red-orange (#f0452a) at the top, up to the gauge's level; one tiny green LED "
    "under it. "
    "Judgment line: a thin pale steel-blue line in a faint blue glow. "
    "Notes: matte anodised bars with softly bevelled edges, like aluminium key caps, in their lane colours, each with a thin "
    "lighter top face; the far-left lane's pink note is the same bar with a small cross engraved in its middle. "
    "Long note: a long band of brushed metal tinted in its lane's colour with two thin bright edges and a dark groove down "
    "its middle; its two ends cut straight across (no caps); the held one's groove glows. "
    "Hit effect: a small plus-shaped flash (four short rays at right angles) with one thin square outline opening round it, "
    "steel-blue and white; short, no sparks. "
    "Combo number and 'COMBO': a clean rounded geometric sans-serif like hardware panel lettering, bold, white easing to a "
    "pale steel grey at its foot with a thin dark outline; 'COMBO' small, grey, widely letter-spaced. Judgment text "
    "'MAX 100%': the same type, 'MAX' white, '100%' steel-blue. ",
)

# Skin 7 (the reference: a white panel of cut paper with soft grey diagonal stripes, candy-coloured rounded capsules at its
# corners, round embossed white buttons, a navy half dome with a rainbow capsule, readouts on white rounded cards, a pink gauge).
PICTURES["skin-rainbow"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'RAINBOW POP': white cut paper with candy capsules in rainbow colours. Palette: white and very light grey "
    "(#ffffff, #eceef2) with soft shadows, like layers of cut paper; a deep navy (#15155c) for digits and one dome; bright "
    "candy colours only in rounded capsules: red (#ff4b4b), yellow (#ffe23a), green (#8be04a), sky blue (#45c8f5), violet "
    "(#a66bf5), pink (#ff7ac3). Cheerful, clean and flat; no glitter, no sparkles, no characters. "
    + EMBLEM_ROW +
    "Deck: a white panel with soft pale-grey diagonal rounded stripes embossed in it, and a few short diagonal capsules "
    "(bars with fully rounded ends) in the candy colours peeking in at its corners, all slanting the same way. The emblem: "
    "a deep-navy half dome rising from the deck's near edge with one glossy upright capsule on it filled with a rainbow "
    "(red at the top through yellow and green to blue at the bottom). The readouts are on white rounded cards with soft "
    "shadows: small grey labels, the digits deep navy in a bold rounded sans-serif. "
    "Key indicators: a row of round white embossed buttons, soft raised circles, one per lane, each with a small upright "
    "pill-shaped slot in it; the pressed one's slot lights in a candy colour. "
    "Side rails: thin white strips with a soft grey shadow, plain all the way up. "
    "Gauge: a slim white capsule tube along the outside of the right rail holding a glossy magenta-pink (#ff4fd8) fill up to "
    "the gauge's level. "
    "Judgment line: a thin white line with a thin rainbow hairline just under it. "
    "Notes: glossy candy bars with softly rounded corners in their lane colours, each with a soft white highlight along its "
    "top; the far-left lane's pink note is the same bar with a small white ring in its middle. "
    "Long note: a long glossy band in its lane's colour with a lighter stripe down its middle; its two ends cut straight "
    "across (no caps); the held one is brighter. "
    "Hit effect: a small burst of five or six short rounded capsules in the candy colours flying outward with one thin "
    "white ring; short, no sparks. "
    "Combo number and 'COMBO': a very rounded bold sans-serif like bubble letters, white with a thick deep-navy outline; "
    "'COMBO' small, its letters each in a different candy colour, widely letter-spaced. Judgment text 'MAX 100%': the same "
    "type, 'MAX' white with the navy outline, '100%' filled with the rainbow. ",
)

# Skin 8 (the reference: flat black with large dark-red diagonal bands, glowing red dot clusters, a white rectangle over a
# red one like a glitch, white diagonal stripes, red chevrons, thin red orbit curves, outlined LCD digits, hairline rails).
PICTURES["skin-noir"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'REDLINE': black and red cyber graphics, like a glitch poster. Palette: pure black, a deep dark red (#3a0508 to "
    "#5c0a10) for large flat diagonal shapes, ONE bright red (#ff1a2b) for the marks that glow, white for a few small hard "
    "accents, mid grey for the outlined digits. A flat 2D graphic: no metal, no bevels, no texture, no gradients except a "
    "faint red glow round the bright red marks. "
    "Deck: a flat black panel crossed by two or three large dark-red diagonal bands. Small flat graphic marks are scattered "
    "on it: a cluster of bright-red dots in honeycomb rows at the lower left and another at the lower right; at the left "
    "edge and at the right edge a white rectangle overlapping a red rectangle, offset like a glitch; a block of three white "
    "diagonal stripes at the lower left corner; a row of three red chevrons; a few tiny white pixel glyphs and a faint dot "
    "grid; one or two thin red curved lines (arcs of a long tilted ellipse) sweeping across the deck. The readouts have NO "
    "boxes: each a small grey label in a wide sans-serif over digits drawn as OUTLINED squared numerals in light grey, like "
    "an unlit LCD. "
    "Key indicators: a row of thin dark slots with slanted ends (flat elongated hexagons), one per lane, outlined in dark "
    "grey; the pressed one filled bright red and glowing. "
    "Side rails: hairline-thin light-grey lines with a few tiny tick marks and small square nodes, nothing else. "
    "Gauge: along the outside of the right rail one column of small red squares with no housing, lit bright red up to the "
    "gauge's level, the topmost lit one white, the unlit ones a very dark red. "
    "Judgment line: a thin bright red line with a white core. "
    "Notes: flat hard-edged rectangles in their lane colours with NO bevel, each with one corner clipped off and a thin "
    "black line inset along its far edge; the far-left lane's pink note is the same with a small white chevron. "
    "Long note: a flat band in its lane's colour at lower brightness between two bright edge lines with a row of tiny dots "
    "down its middle; its two ends cut straight across (no caps); the held one is brighter. "
    "Hit effect: a glitch: two offset rectangles, one red and one white, flashing over the hit with three small squares "
    "scattering; very short, no ring, no sparks. "
    "Combo number and 'COMBO': a wide squared techno display type with cut corners, white, with a bright red copy of itself "
    "offset a little to the right behind it like a glitch; 'COMBO' small, red, widely letter-spaced. Judgment text "
    "'MAX 100%': the same type, 'MAX' white with the red offset, '100%' bright red. ",
)

# Skin 9 (the reference: a black armour panel with crimson-pink bars, the score and the combo in black windows whose ends
# are cut to points with silver chamfer bars, gloss white and crimson key caps, small amber side lights, a yellow gauge).
PICTURES["skin-magenta"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'CRIMSON MECHA': the console of a black fighting robot with crimson-pink armour lines. Palette: black and dark "
    "charcoal armour (#0d0d10, #1c1c21), ONE crimson pink (#f0145a to #ff2d78), silver-white (#e9ecef) for chamfer bars and "
    "key caps, and a small amber (#ffb21a) only for two tiny side lights and one thin line. Hard angular silhouettes "
    "chamfered at 45 degrees, a clean vector look with flat shading; no rust, no dirt, no sparkles. "
    "Deck: a black armour panel. In its upper middle the SCORE sits in a wide black window whose two ends are cut to points "
    "(an elongated hexagon), with a silver chamfer bar along its far side that steps up in the middle and a crimson bar "
    "along its near side. In the lower row the SPEED and the RATE sit in two smaller windows of the same shape at the left "
    "and the right, each between thin crimson bars, with a silver trapezoid plate between them at the middle of the deck's "
    "near edge. Crimson diagonal slashes at the deck's four corners, a small magenta square light near each lower corner, "
    "and a thin amber line along the near edge at the left and the right. Labels and digits: a bold condensed sans-serif, "
    "white. "
    "Key indicators: a row of glossy square key caps with slightly rounded corners in a black frame: gloss white caps, the "
    "caps of the light-blue lanes gloss crimson, and a small amber light at each end of the row; the pressed one glows. "
    "Side rails: slim black strips, each with a thin crimson line along its inner edge, plain all the way up. "
    "Gauge: a slim bar along the outside of the right rail in a thin crimson frame, its fill bright yellow (#ffe81a) up to "
    "the gauge's level, dark above. "
    "Judgment line: a thin white line in a crimson glow. "
    "Notes: armour plates whose two short ends are cut to points (elongated hexagons) in their lane colours, each with a "
    "bright near edge and a thin dark line inset; the far-left lane's pink note is the same plate with a small white "
    "chevron. "
    "Long note: a long band in its lane's colour, a darker middle between two bright side rails; its two ends cut straight "
    "across (no caps); the held one is brighter. "
    "Hit effect: a crimson-white flash with four thin angular shards flying out diagonally like an X and one thin hexagon "
    "outline opening; short, no smoke. "
    "Combo number and 'COMBO': a tall heavy condensed sans-serif, slightly italic, white easing to pale pink at its foot, "
    "with a thick black outline and a thin crimson line round that; 'COMBO' small, white, condensed. Judgment text "
    "'MAX 100%': the same type, 'MAX' white, '100%' crimson pink. ",
)

# Skin 10 (the reference: white line art glowing on near-black: an open ring emblem with two dots and a small trapezoid,
# thin tilted orbits, tiny isometric bars, dot clusters, outlined digits, bracket-shaped key marks, a glow at the near edge).
PICTURES["skin-wire"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'WHITE LINE': monochrome white line art on near-black, like the drawing of a small machine made of light. "
    "Palette: near-black with a slight navy tint (#06080d to #0e1220), white lines with a soft white glow, a mid blue-grey "
    "(#6b7386) for faint secondary lines, and NO other colour in the gear. Thin luminous outlines, almost no filled shapes; "
    "quiet and technical; no sparkles, no lens flare. "
    + EMBLEM_ROW +
    "Deck: a near-black panel. The emblem, in white line: an open circle (about three quarters of a ring, with a gap), and "
    "inside it two small dots side by side with a small upright trapezoid outline under them. One or two very thin tilted "
    "ellipses sweep across the whole deck like orbits. A few tiny white bars drawn as little 3D blocks float at the deck's "
    "left and right edges, and a small cluster of dots in honeycomb rows sits at the lower left and at the lower right. A "
    "soft white glow rises from the middle of the deck's near edge. The readouts have NO boxes: small faint grey labels, the "
    "digits drawn as OUTLINED rounded numerals in white; a small white chevron beside the SPEED readout and another beside "
    "the RATE readout, both pointing inward. "
    "Key indicators: a row of thin white outlines shaped like shallow trays (a trapezoid open at the top), one per lane; the "
    "pressed one filled with white light. "
    "Side rails: hairline white lines with a faint glow and a few tiny tick marks. "
    "Gauge: along the outside of the right rail a thin outlined white tube holding one column of small white dashes lit up "
    "to the gauge's level, the unlit ones faint. "
    "Judgment line: a thin pure white line in a soft white glow. "
    "Notes: bars in their lane colours drawn as a bright outline with a dimmer see-through fill of the same colour and a "
    "white hairline along the near edge; the far-left lane's pink note is the same with a small chevron. "
    "Long note: two thin parallel lines in its lane's colour with a faint see-through fill between them; its two ends cut "
    "straight across (no caps); the held one's fill is brighter. "
    "Hit effect: a thin white ring opening with four short tick marks round it and two small dots; short, no sparks. "
    "Combo number and 'COMBO': wide rounded numerals drawn as thin white OUTLINES only (hollow), with a soft white glow; "
    "'COMBO' small, thin, white, widely letter-spaced. Judgment text 'MAX 100%': the same type, 'MAX' hollow, '100%' solid "
    "white. ",
)

# Skin 11 (the reference: a deep navy night sky with a star chart, navy key caps with cut corners and a small gold star on
# each, a white four-pointed star with pale wings and an orbit, rows of moon phases, thin white digits, blue flowers and
# ribbons outside the gear's edges).
PICTURES["skin-astral"] = (
    DEFAULT_SHOT,
    KEEP_SKIN +
    "Skin 'STARRY NIGHT': an elegant night sky in deep navy with pale moon-blue light and small gold stars. Palette: deep "
    "navy (#0a1230 to #17265e), a pale moon blue (#a9c8ff), white, and ONE gold (#f2c14e) used only for small star marks. "
    "Fine line ornament like a star chart or an astrolabe: delicate, elegant, calm. No characters, no lens flare. "
    + EMBLEM_ROW +
    "Deck: a deep navy panel with a faint star chart drawn on it in thin pale lines: two or three large circles and a "
    "tilted ellipse with two small ring nodes on it, and tiny four-pointed stars scattered. The emblem: a white "
    "four-pointed star with long thin points and a pair of small pale-blue feathered wings behind it, a short row of moon "
    "phases (tiny crescents round one full disc) above it and another below. The readouts have NO boxes: tiny pale-blue "
    "labels in letter-spaced capitals, the digits thin, elegant and white. At the gear's two outer edges near the bottom "
    "ONLY, a small spray of pale-blue five-petal flowers with one thin ribbon, kept small and close to the gear: the gear "
    "does not spread sideways. "
    "Key indicators: a row of deep-navy bevelled key caps with cut corners (elongated octagons) and a thin pale rim, each "
    "with a small gold four-pointed star in its middle; the pressed one's star glows gold-white. "
    "Side rails: slim pale-blue lines, each with a white hairline, plain all the way up. "
    "Gauge: a slim deep-navy capsule along the outside of the right rail holding one column of small pale-blue diamonds lit "
    "up to the gauge's level, the topmost lit one gold, the unlit ones dim. "
    "Judgment line: a thin white line in a soft moon-blue glow. "
    "Notes: smooth bars with cut corners (elongated octagons, like the key caps) in their lane colours, each with a thin "
    "pale rim and a tiny four-pointed star in its middle; the far-left lane's pink note is the same with a small crescent. "
    "Long note: a long ribbon of soft light in its lane's colour with a thin white line down its middle; its two ends cut "
    "straight across (no caps); the held one is brighter. "
    "Hit effect: a four-pointed star of white light with long thin points, one thin ring and three tiny stars drifting "
    "away; short, no sparks. "
    "Combo number and 'COMBO': an elegant high-contrast serif typeface, white easing to pale moon blue at its foot with a "
    "thin navy outline; 'COMBO' small gold capitals, widely letter-spaced. Judgment text 'MAX 100%': the same serif, 'MAX' "
    "white, '100%' gold. ",
)


def generate(prompt: str, ref: Path | tuple[Path, ...] | None) -> tuple[bytes, dict]:
    # the pictures sent with the prompt, in the order the prompt speaks of them (one, several or none)
    parts: list[dict] = []
    for picture in ref if isinstance(ref, tuple) else ([ref] if ref else []):
        parts.append({"inlineData": {"mimeType": "image/png", "data": base64.b64encode(picture.read_bytes()).decode()}})
    parts.append({"text": prompt})
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "16:9", "imageSize": "2K"}, "thinkingConfig": {"thinkingLevel": "MEDIUM"}},
    }
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST")
    req.add_header("x-goog-api-key", os.environ["GOOGLE_API_KEY"])
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=300) as r:
        out = json.loads(r.read())
    for cand in out.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            if "inlineData" in part:
                return base64.b64decode(part["inlineData"]["data"]), out.get("usageMetadata", {})
    raise RuntimeError("no image in the answer: " + json.dumps(out)[:300])


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    record_file = RAW / "record.json"
    record = json.loads(record_file.read_text()) if record_file.exists() else {}
    only = set(sys.argv[1:])
    for pid, entry in PICTURES.items():
        ref, prompt = entry[:2]
        tail = entry[2] if len(entry) > 2 else TAIL
        name = f"r2-{pid}"
        if only and pid not in only:
            continue
        if not only and (RAW / f"{name}.png").exists():
            continue
        full = prompt + tail
        try:
            png, usage = generate(full, ref)
        except Exception as e:  # one picture failing does not stop the others
            print("failed:", name, str(e)[:300])
            continue
        (RAW / f"{name}.png").write_bytes(png)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(RAW / f"{name}.png"), "-vf", "scale=1600:-2:flags=lanczos", "-q:v", "3", str(OUT / f"{name}.jpg")], check=True)
        # a skin's pictures are recorded under the skin's name (skin-sky-a: SKY), the earlier rounds under PRISM
        concept = pid.split("-")[1].upper() if pid.startswith("skin-") else "PRISM"
        with open(record_file.with_suffix(".lock"), "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            record = json.loads(record_file.read_text()) if record_file.exists() else {}
            record[name] = {"concept": concept, "kind": pid, "model": MODEL, "prompt": full, "reference": [str(r.relative_to(ROOT.parent)) for r in ref] if isinstance(ref, tuple) else str(ref.relative_to(ROOT.parent)) if ref else None, "imageSize": "2K", "usage": usage, "made": MADE}
            record_file.write_text(json.dumps(record, ensure_ascii=False, indent=1))
        print("made:", name, usage.get("totalTokenCount"))


if __name__ == "__main__":
    main()
