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

# id: (reference picture or None, prompt)
PICTURES: dict[str, tuple[Path | None, str]] = {
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


def generate(prompt: str, ref: Path | None) -> tuple[bytes, dict]:
    parts: list[dict] = []
    if ref:
        parts.append({"inlineData": {"mimeType": "image/png", "data": base64.b64encode(ref.read_bytes()).decode()}})
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
    for pid, (ref, prompt) in PICTURES.items():
        name = f"r2-{pid}"
        if only and pid not in only:
            continue
        if not only and (RAW / f"{name}.png").exists():
            continue
        full = prompt + TAIL
        try:
            png, usage = generate(full, ref)
        except Exception as e:  # one picture failing does not stop the others
            print("failed:", name, str(e)[:300])
            continue
        (RAW / f"{name}.png").write_bytes(png)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(RAW / f"{name}.png"), "-vf", "scale=1600:-2:flags=lanczos", "-q:v", "3", str(OUT / f"{name}.jpg")], check=True)
        record[name] = {"concept": "PRISM", "kind": pid, "model": MODEL, "prompt": full, "reference": str(ref.relative_to(ROOT.parent)) if ref else None, "imageSize": "2K", "usage": usage, "made": MADE}
        record_file.write_text(json.dumps(record, ensure_ascii=False, indent=1))
        print("made:", name, usage.get("totalTokenCount"))


if __name__ == "__main__":
    main()
